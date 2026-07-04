-- Genre names on the shared catalog, for library filtering.
-- Paste into the Supabase dashboard → SQL Editor → Run. Safe to re-run.
--
-- Populated from Jikan at add-time (upsertCatalogAnime) and lazily backfilled
-- when an anime's detail page is viewed (alongside the trailer fetch), so
-- existing rows fill in as people browse.

alter table public.anime
  add column if not exists genres text[] not null default '{}';

-- Contains queries (genres @> array['Action']) for future server-side filters.
create index if not exists anime_genres_idx
  on public.anime using gin (genres);

-- The catalog only ever had an INSERT policy (0002), so upserts that hit an
-- existing row — re-adding a title someone else cataloged, refreshing
-- metadata, or the genre backfill above — were denied by RLS. Catalog
-- contributions include updates, mirroring the insert policy.
drop policy if exists "Authenticated users can update catalog anime" on public.anime;
create policy "Authenticated users can update catalog anime"
  on public.anime for update
  to authenticated
  using (true)
  with check (true);
