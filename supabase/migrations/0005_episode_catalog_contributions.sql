-- Lets signed-in users contribute episode rows to the shared catalog, the same
-- way migration 0002 did for `anime`. Needed so the app can backfill an anime's
-- episode list from Jikan the first time someone opens its detail page.
--
-- Reads were already allowed (migration 0001). Updates/deletes stay blocked for
-- normal users.
--
-- Apply in the Supabase dashboard → SQL Editor, or via `supabase db push`.

drop policy if exists "Authenticated users can add episodes to the catalog" on public.episodes;
create policy "Authenticated users can add episodes to the catalog"
  on public.episodes for insert
  to authenticated
  with check (true);
