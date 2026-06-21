-- Phase 3: per-episode watch tracking + "Continue Watching" support.
-- Paste into the Supabase dashboard → SQL Editor → Run. Safe to re-run.
--
-- Already present from Phase 1 (NOT recreated here):
--   * status enum  -> public.watch_status (plan_to_watch|watching|completed|on_hold|dropped)
--   * user score   -> public.user_progress.score  (integer 1..10, nullable)
--   * user notes   -> public.user_progress.notes  (text, nullable)
--
-- This migration adds:
--   1. user_progress.last_watched_at   (Continue Watching sort key)
--   2. episode_progress                (one row per watched episode, per user)
--   3. RLS so users only see/edit their own episode_progress
--   4. a view returning watched_count per (user_id, anime_id) for progress bars
--   5. indexes on the columns we filter/sort by most

-- ---------------------------------------------------------------------------
-- 1. last_watched_at on user_progress
-- ---------------------------------------------------------------------------

alter table public.user_progress
  add column if not exists last_watched_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. episode_progress  (per-user, per-episode)
-- ---------------------------------------------------------------------------

create table if not exists public.episode_progress (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null
                references auth.users (id) on delete cascade
                default auth.uid(),
  episode_id  uuid not null
                references public.episodes (id) on delete cascade,
  watched_at  timestamptz not null default now(),
  -- A user marks each episode watched at most once (toggle = delete the row).
  unique (user_id, episode_id)
);

-- ---------------------------------------------------------------------------
-- 3. Row Level Security  (each user owns only their own rows)
-- ---------------------------------------------------------------------------

alter table public.episode_progress enable row level security;

drop policy if exists "Users can view their own episode progress" on public.episode_progress;
create policy "Users can view their own episode progress"
  on public.episode_progress for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own episode progress" on public.episode_progress;
create policy "Users can insert their own episode progress"
  on public.episode_progress for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own episode progress" on public.episode_progress;
create policy "Users can update their own episode progress"
  on public.episode_progress for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own episode progress" on public.episode_progress;
create policy "Users can delete their own episode progress"
  on public.episode_progress for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. watched_count per (user_id, anime_id)  -> for progress bars
--    security_invoker = on  makes the view honor the querying user's RLS, so
--    it only ever returns that user's own counts (Postgres 15+, which Supabase
--    runs). Without it the view would run as its owner and bypass RLS.
-- ---------------------------------------------------------------------------

create or replace view public.anime_watched_count
  with (security_invoker = on) as
  select
    ep.user_id,
    e.anime_id,
    count(*)::int as watched_count
  from public.episode_progress ep
  join public.episodes e on e.id = ep.episode_id
  group by ep.user_id, e.anime_id;

grant select on public.anime_watched_count to authenticated;

-- ---------------------------------------------------------------------------
-- 5. (Optional but recommended) keep user_progress.last_watched_at current
--    automatically whenever an episode is marked watched. Remove this block if
--    you'd rather set last_watched_at from application code.
-- ---------------------------------------------------------------------------

create or replace function public.touch_last_watched_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.user_progress up
     set last_watched_at = new.watched_at,
         updated_at = now()
    from public.episodes e
   where e.id = new.episode_id
     and up.user_id = new.user_id
     and up.anime_id = e.anime_id
     and (up.last_watched_at is null or new.watched_at > up.last_watched_at);
  return new;
end;
$$;

drop trigger if exists episode_progress_touch_last_watched on public.episode_progress;
create trigger episode_progress_touch_last_watched
  after insert on public.episode_progress
  for each row execute function public.touch_last_watched_at();

-- ---------------------------------------------------------------------------
-- 6. Indexes
--    - unique (user_id, episode_id) above already indexes user-scoped lookups
--      and the "is this episode watched?" check, so no separate user_id index.
-- ---------------------------------------------------------------------------

-- Join/count by episode (the view joins episodes on episode_id) + reverse lookups.
create index if not exists episode_progress_episode_id_idx
  on public.episode_progress (episode_id);

-- "Continue Watching": newest activity first, per user.
create index if not exists user_progress_last_watched_idx
  on public.user_progress (user_id, last_watched_at desc nulls last);
