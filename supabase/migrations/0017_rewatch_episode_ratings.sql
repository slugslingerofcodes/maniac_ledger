-- Rewatch tracking + per-episode ratings.
-- Paste into the Supabase dashboard → SQL Editor → Run.
--
-- user_progress.rewatch_count: how many times the user has re-completed the
-- anime (0 = first watch). episode_progress.rating: optional 1–5 stars per
-- watched episode. Existing RLS policies on both tables already scope writes
-- to the owner, so no policy changes are needed for new columns.

alter table public.user_progress
  add column if not exists rewatch_count integer not null default 0
    check (rewatch_count >= 0);

alter table public.episode_progress
  add column if not exists rating smallint
    check (rating between 1 and 5);
