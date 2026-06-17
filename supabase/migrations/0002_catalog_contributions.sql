-- Lets signed-in users add anime from search into their library.
--
-- Two changes:
--   1. Add anime.mal_id so catalog rows can be deduped by their MyAnimeList id
--      (the source of search results).
--   2. Allow authenticated users to INSERT catalog rows (reads were already
--      allowed; updates/deletes stay blocked for normal users).
--
-- Apply in the Supabase dashboard → SQL Editor, or via `supabase db push`.

alter table public.anime
  add column mal_id integer unique;

create policy "Authenticated users can add anime to the catalog"
  on public.anime for insert
  to authenticated
  with check (true);
