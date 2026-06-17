-- Anime tracker schema
-- Paste into the Supabase dashboard → SQL Editor → Run.
-- (Or apply with the Supabase CLI: `supabase db push`.)
--
-- Design:
--   anime          - shared catalog (read-only to users; written via service role / dashboard)
--   episodes       - per-anime episode list (shared catalog)
--   user_progress  - per-user tracking; RLS keeps each user's rows private

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Where the show is in its broadcast lifecycle (anime.status).
create type public.airing_status as enum (
  'not_yet_aired',
  'currently_airing',
  'finished_airing',
  'hiatus',
  'cancelled'
);

-- Content/audience rating (anime.rating). Swap to numeric if you instead
-- meant an aggregate score — see the note on the `rating` column below.
create type public.content_rating as enum (
  'g',
  'pg',
  'pg_13',
  'r_17',
  'r_plus',
  'rx'
);

-- Broadcast season (anime.season).
create type public.anime_season as enum (
  'winter',
  'spring',
  'summer',
  'fall'
);

-- Medium/format (anime.type).
create type public.anime_type as enum (
  'tv',
  'movie',
  'ova',
  'ona',
  'special',
  'music'
);

-- A user's watch state for a given anime (user_progress.status).
create type public.watch_status as enum (
  'watching',
  'completed',
  'plan_to_watch',
  'on_hold',
  'dropped'
);

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- anime (catalog)
-- ---------------------------------------------------------------------------

create table public.anime (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  synopsis       text,
  poster_url     text,
  total_episodes integer check (total_episodes is null or total_episodes >= 0),
  status         public.airing_status not null default 'not_yet_aired',
  airing_start   date,
  airing_end     date,
  -- Content rating (G / PG / PG-13 / R / R+ / Rx). If you meant an aggregate
  -- 0-10 score instead, replace this with: rating numeric(3,1)
  -- check (rating is null or rating between 0 and 10)
  rating         public.content_rating,
  season         public.anime_season,
  year           integer check (year is null or year between 1900 and 2200),
  type           public.anime_type not null default 'tv',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Sanity: end date must not precede start date.
  constraint anime_airing_range check (
    airing_start is null or airing_end is null or airing_end >= airing_start
  )
);

create index anime_year_season_idx on public.anime (year, season);
create index anime_status_idx on public.anime (status);

create trigger anime_set_updated_at
  before update on public.anime
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- episodes (catalog, child of anime)
-- ---------------------------------------------------------------------------

create table public.episodes (
  id         uuid primary key default gen_random_uuid(),
  anime_id   uuid not null references public.anime (id) on delete cascade,
  number     integer not null check (number >= 0),
  title      text,
  aired_date date,
  created_at timestamptz not null default now(),
  -- One row per episode number within an anime.
  unique (anime_id, number)
);

create index episodes_anime_id_idx on public.episodes (anime_id);

-- ---------------------------------------------------------------------------
-- user_progress (per-user, private)
-- ---------------------------------------------------------------------------

create table public.user_progress (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade default auth.uid(),
  anime_id         uuid not null references public.anime (id) on delete cascade,
  episodes_watched integer not null default 0 check (episodes_watched >= 0),
  status           public.watch_status not null default 'plan_to_watch',
  score            integer check (score is null or score between 1 and 10),
  notes            text,
  started_at       date,
  completed_at     date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- A user tracks each anime once.
  unique (user_id, anime_id),
  -- Sanity: completion date must not precede the start date.
  constraint user_progress_watch_range check (
    started_at is null or completed_at is null or completed_at >= started_at
  )
);

create index user_progress_user_id_idx on public.user_progress (user_id);
create index user_progress_anime_id_idx on public.user_progress (anime_id);

create trigger user_progress_set_updated_at
  before update on public.user_progress
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

-- Catalog: any signed-in user may read anime + episodes. No write policies are
-- defined, so inserts/updates/deletes are blocked for normal users and only
-- possible via the service_role key (which bypasses RLS) or the dashboard.
-- To let users contribute to the catalog, add insert/update policies here.
alter table public.anime enable row level security;
alter table public.episodes enable row level security;

create policy "Anyone signed in can read anime"
  on public.anime for select
  to authenticated
  using (true);

create policy "Anyone signed in can read episodes"
  on public.episodes for select
  to authenticated
  using (true);

-- Progress: each user fully owns their own rows and can see no one else's.
alter table public.user_progress enable row level security;

create policy "Users can view their own progress"
  on public.user_progress for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own progress"
  on public.user_progress for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own progress"
  on public.user_progress for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own progress"
  on public.user_progress for delete
  to authenticated
  using (auth.uid() = user_id);
