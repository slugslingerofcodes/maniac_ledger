-- MangaDex-only manga: titles with no MyAnimeList entry (e.g. side stories,
-- webtoon-first releases) can now be cataloged and tracked. They are keyed by
-- `mangadex_id`, so it must be unique; `mal_id` stays null for them and the
-- detail route is /manga/md/[mangadexId]. Paste into the Supabase dashboard →
-- SQL Editor → Run. Safe to re-run.

do $$
begin
  alter table public.manga
    add constraint manga_mangadex_id_key unique (mangadex_id);
exception
  when duplicate_table then null;  -- constraint already exists
  when duplicate_object then null;
end
$$;
