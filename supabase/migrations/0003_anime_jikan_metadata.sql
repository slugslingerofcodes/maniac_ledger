-- Richer catalog metadata captured from Jikan / MyAnimeList when a user adds an
-- anime from search. (Jikan's airing status maps onto the existing
-- airing_status enum, so no column is needed for it.)
--
-- Apply in the Supabase dashboard → SQL Editor, or via `supabase db push`.

alter table public.anime
  add column if not exists title_english text,
  add column if not exists score numeric(4, 2)
    check (score is null or score between 0 and 10),
  add column if not exists studio text;
