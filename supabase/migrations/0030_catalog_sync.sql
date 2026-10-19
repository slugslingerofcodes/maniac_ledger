-- 0030: own the catalog — synced columns, fast local search, chart snapshots.
-- Paste into the Supabase dashboard → SQL Editor → Run. Safe to re-run.
-- Then deploy the Edge Function (`supabase functions deploy catalog-sync`) and
-- run 0031 to schedule it.
--
-- Why: browse and search used to ask Jikan (MAL) or AniList on every page
-- view, and the shared `anime` table was only the last-resort fallback. With
-- Jikan unreachable for days, every surface paid for that: ~0.5–2s per search,
-- and detail sections waiting on upstream calls. Now a scheduled sync
-- (supabase/functions/catalog-sync) writes the titles the UI shows — seasonal,
-- airing, top, upcoming — into this table, and pages read it first. The live
-- engines become enrichment instead of a dependency.
--
-- Three parts:
--   1. `anime` gains the columns the UI needs that only lived upstream before
--      (synonyms, banner art, trailer, broadcast slot, members, duration), plus
--      `synced_at` and a trigram-indexed `search_text`.
--   2. `catalog_lists` holds each chart as the sync last saw it: the ordered
--      MAL ids of "top airing", "this season", … — so a home rail is one
--      query, ranked exactly the way the upstream ranked it.
--   3. RPCs: `search_anime_catalog` (type-ahead), `catalog_list` (a rail),
--      and `catalog_sync_apply` (the sync's write path, service role only).

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

-- Supabase keeps extensions out of `public`; the functions below set their
-- search_path to find its operators.
create extension if not exists pg_trgm with schema extensions;

alter table public.anime
  -- Alternative titles and fan nicknames ("AoT", "SnK") — searched, and shown
  -- as "Also known as" on the detail page.
  add column if not exists title_synonyms text[] not null default '{}',
  -- Wide landscape key art (AniList `bannerImage`) for the home banner.
  add column if not exists banner_url text,
  add column if not exists trailer_youtube_id text,
  -- How many people list the title: MAL `members`, or AniList `popularity`
  -- when MAL was unreachable — the same stand-in the AniList fallback already
  -- uses. A ranking signal, and the Top 10's "viewers".
  add column if not exists members integer
    check (members is null or members >= 0),
  add column if not exists duration_mins integer
    check (duration_mins is null or duration_mins >= 0),
  -- Weekly JST slot, Jikan-style: "Saturdays" / "23:00".
  add column if not exists broadcast_day text,
  add column if not exists broadcast_time text,
  -- When the scheduled sync last refreshed this row. Null = only ever written
  -- by a user's add or a detail-page write-back.
  add column if not exists synced_at timestamptz;

-- Everything a title can be searched by, lowercased, in one string. Must be
-- IMMUTABLE to back a generated column; `array_to_string` is only STABLE in
-- general (it formats arbitrary element types), but for text[] it is pure.
--
-- EXECUTE stays with the default grants on purpose: authenticated users insert
-- catalog rows (0002), and the generated column evaluates this as them.
create or replace function public.anime_search_text(
  title text,
  title_english text,
  synonyms text[]
)
returns text
language sql
immutable
parallel safe
as $$
  -- nullif: an empty array would otherwise add a trailing space.
  select lower(concat_ws(' ', title, title_english, nullif(array_to_string(synonyms, ' '), '')))
$$;

alter table public.anime
  add column if not exists search_text text
    generated always as (public.anime_search_text(title, title_english, title_synonyms)) stored;

-- Serves both `like '%term%'` (substring, for prefixes typed so far) and
-- `term <% search_text` (word similarity, for typos).
create index if not exists anime_search_text_trgm_idx
  on public.anime using gin (search_text extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 2. Chart snapshots
-- ---------------------------------------------------------------------------

create table if not exists public.catalog_lists (
  -- e.g. 'airing', 'season-now', 'top-rated' — see LIST_KEYS in
  -- supabase/functions/catalog-sync/mapping.ts.
  key        text primary key,
  -- Ordered: position 1 is the chart's #1.
  mal_ids    integer[] not null default '{}',
  -- Which engine this snapshot came from.
  source     text not null check (source in ('mal', 'anilist')),
  synced_at  timestamptz not null default now()
);

-- Readable by anyone signed in, like the catalog itself. No write policies:
-- unlike `anime`, these are not user contributions — a writable chart would
-- let one account reorder every user's home page — so only the service role
-- (which bypasses RLS) writes them.
alter table public.catalog_lists enable row level security;

drop policy if exists "Anyone signed in can read catalog lists" on public.catalog_lists;
create policy "Anyone signed in can read catalog lists"
  on public.catalog_lists for select
  to authenticated
  using (true);

revoke insert, update, delete, truncate on public.catalog_lists from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPCs
--
-- Read functions return a jsonb array rather than `setof anime`: PostgREST
-- wraps a set-returning call in its own SELECT, which is free to drop the
-- function's ORDER BY. A json array keeps the ranking, which is the point.
-- All are SECURITY INVOKER, so the catalog's RLS still decides who reads.
-- ---------------------------------------------------------------------------

-- Type-ahead search over the catalog. Ranked by match quality first — exact
-- title, title prefix, word prefix, substring, then fuzzy — and popularity
-- within each tier, so "narut" finds Naruto before Boruto. SFW only: the adult
-- tab writes into the same table, and this feeds SFW surfaces.
create or replace function public.search_anime_catalog(
  q text,
  genre_names text[] default '{}',
  max_results integer default 25
)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
  with term as (
    select
      lower(btrim(coalesce(q, ''))) as t,
      -- Typed % and _ are literal characters, not wildcards.
      replace(replace(replace(lower(btrim(coalesce(q, ''))), '\', '\\'), '%', '\%'), '_', '\_') as esc
  ),
  hits as (
    select
      a,
      case
        when lower(a.title) = term.t or lower(a.title_english) = term.t then 0
        when lower(a.title) like term.esc || '%'
          or lower(a.title_english) like term.esc || '%' then 1
        when a.search_text like '% ' || term.esc || '%' then 2
        when a.search_text like '%' || term.esc || '%' then 3
        else 4
      end as tier,
      word_similarity(term.t, a.search_text) as sim
    from public.anime a, term
    where a.mal_id is not null
      and not (a.genres @> array['Hentai'])
      and (cardinality(coalesce(genre_names, '{}')) = 0 or a.genres @> genre_names)
      -- An empty query is a genre browse; empty *and* no genres is nothing,
      -- never an unfiltered scan.
      and (term.t <> '' or cardinality(coalesce(genre_names, '{}')) > 0)
      and (
        term.t = ''
        or a.search_text like '%' || term.esc || '%'
        or term.t <% a.search_text
      )
    order by tier, sim desc, a.members desc nulls last, a.score desc nulls last
    limit greatest(1, least(coalesce(max_results, 25), 50))
  )
  select coalesce(
    jsonb_agg(to_jsonb(h.a) - 'search_text' order by h.tier, h.sim desc, (h.a).members desc nulls last, (h.a).score desc nulls last),
    '[]'::jsonb
  )
  from hits h
$$;

-- One chart's titles in chart order, or [] when the snapshot is missing or
-- older than `max_age` — so a sync that has stopped running degrades to the
-- live engines rather than serving last month's "airing now" forever.
create or replace function public.catalog_list(
  list_key text,
  max_results integer default 50,
  max_age interval default interval '36 hours'
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(row_json order by pos), '[]'::jsonb)
  from (
    select to_jsonb(a) - 'search_text' as row_json, u.pos
    from public.catalog_lists l
    cross join lateral unnest(l.mal_ids) with ordinality as u(mal_id, pos)
    join public.anime a on a.mal_id = u.mal_id
    where l.key = list_key
      and l.synced_at > now() - max_age
      and not (a.genres @> array['Hentai'])
    order by u.pos
    limit greatest(1, least(coalesce(max_results, 50), 200))
  ) entries
$$;

-- The sync's write path: upsert titles by mal_id and replace chart snapshots,
-- in one transaction per call.
--
-- A missing value never erases a known one — the sync often has only one
-- engine's view of a title (AniList has no broadcast slot, MAL no banner), and
-- a plain upsert would null out whatever the other engine wrote last time.
-- The airing window moves as a pair, so the start ≤ end check can't trip on a
-- new start meeting an old end. Lists with no ids are skipped, leaving the old
-- snapshot to age out rather than blanking a rail on one bad run.
--
-- Idempotent: applying the same payload twice leaves the same rows.
create or replace function public.catalog_sync_apply(
  p_rows jsonb,
  p_lists jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_updated integer := 0;
  v_inserted integer := 0;
  v_lists integer := 0;
begin
  if jsonb_typeof(p_rows) is distinct from 'array'
     or jsonb_typeof(p_lists) is distinct from 'array' then
    raise exception 'catalog_sync_apply: p_rows and p_lists must be JSON arrays';
  end if;

  with incoming as (
    select distinct on (r.mal_id) r.*
    from jsonb_populate_recordset(null::public.anime, p_rows) r
    where r.mal_id is not null and r.title is not null
    order by r.mal_id
  )
  update public.anime a set
    title              = i.title,
    title_english      = coalesce(i.title_english, a.title_english),
    title_synonyms     = case when cardinality(i.title_synonyms) > 0
                           then i.title_synonyms else a.title_synonyms end,
    synopsis           = coalesce(i.synopsis, a.synopsis),
    poster_url         = coalesce(i.poster_url, a.poster_url),
    banner_url         = coalesce(i.banner_url, a.banner_url),
    trailer_youtube_id = coalesce(i.trailer_youtube_id, a.trailer_youtube_id),
    score              = coalesce(i.score, a.score),
    members            = coalesce(i.members, a.members),
    studio             = coalesce(i.studio, a.studio),
    total_episodes     = coalesce(i.total_episodes, a.total_episodes),
    duration_mins      = coalesce(i.duration_mins, a.duration_mins),
    status             = coalesce(i.status, a.status),
    airing_start       = coalesce(i.airing_start, a.airing_start),
    airing_end         = case when i.airing_start is not null
                           then i.airing_end else a.airing_end end,
    rating             = coalesce(i.rating, a.rating),
    season             = coalesce(i.season, a.season),
    year               = coalesce(i.year, a.year),
    type               = coalesce(i.type, a.type),
    genres             = case when cardinality(i.genres) > 0
                           then i.genres else a.genres end,
    broadcast_day      = coalesce(i.broadcast_day, a.broadcast_day),
    broadcast_time     = coalesce(i.broadcast_time, a.broadcast_time),
    synced_at          = now()
  from incoming i
  where a.mal_id = i.mal_id;
  get diagnostics v_updated = row_count;

  with incoming as (
    select distinct on (r.mal_id) r.*
    from jsonb_populate_recordset(null::public.anime, p_rows) r
    where r.mal_id is not null and r.title is not null
    order by r.mal_id
  )
  insert into public.anime (
    mal_id, title, title_english, title_synonyms, synopsis, poster_url,
    banner_url, trailer_youtube_id, score, members, studio, total_episodes,
    duration_mins, status, airing_start, airing_end, rating, season, year,
    type, genres, broadcast_day, broadcast_time, synced_at
  )
  select
    i.mal_id, i.title, i.title_english, coalesce(i.title_synonyms, '{}'),
    i.synopsis, i.poster_url, i.banner_url, i.trailer_youtube_id, i.score,
    i.members, i.studio, i.total_episodes, i.duration_mins,
    coalesce(i.status, 'finished_airing'), i.airing_start, i.airing_end,
    i.rating, i.season, i.year, coalesce(i.type, 'tv'),
    coalesce(i.genres, '{}'), i.broadcast_day, i.broadcast_time, now()
  from incoming i
  -- Rows the update above just refreshed, or a user added a moment ago.
  on conflict (mal_id) do nothing;
  get diagnostics v_inserted = row_count;

  insert into public.catalog_lists (key, mal_ids, source, synced_at)
  select l.key, l.mal_ids, l.source, now()
  from jsonb_to_recordset(p_lists) as l(key text, mal_ids integer[], source text)
  where l.key is not null and cardinality(l.mal_ids) > 0
  on conflict (key) do update set
    mal_ids   = excluded.mal_ids,
    source    = excluded.source,
    synced_at = excluded.synced_at;
  get diagnostics v_lists = row_count;

  return jsonb_build_object('updated', v_updated, 'inserted', v_inserted, 'lists', v_lists);
end;
$$;

-- Supabase grants EXECUTE on new public functions to PUBLIC, anon and
-- authenticated (see 0029). The write path is the sync's alone; the reads are
-- for signed-in users, matching the catalog's own RLS. PUBLIC must be named:
-- anon and authenticated inherit its grant.
revoke execute on function public.catalog_sync_apply(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.catalog_sync_apply(jsonb, jsonb) to service_role;

revoke execute on function public.search_anime_catalog(text, text[], integer) from public, anon;
grant execute on function public.search_anime_catalog(text, text[], integer) to authenticated, service_role;

revoke execute on function public.catalog_list(text, integer, interval) from public, anon;
grant execute on function public.catalog_list(text, integer, interval) to authenticated, service_role;

-- Manage:
--   select key, source, cardinality(mal_ids), synced_at from public.catalog_lists order by key;
--   select count(*) filter (where synced_at > now() - interval '1 day') from public.anime;
--   select jsonb_array_length(public.search_anime_catalog('frieren'));
