-- Group related anime (sequels, spin-offs, etc.) under a shared franchise.
-- Paste into the Supabase dashboard → SQL Editor → Run. Safe to re-run.
--
-- Note: `franchise_id` is a bare uuid with no FK yet — there's no `franchises`
-- table to reference. Add a `references public.franchises (id)` constraint here
-- if/when that table exists.

alter table public.anime
  add column if not exists franchise_id uuid;

create index if not exists anime_franchise_id_idx
  on public.anime (franchise_id);
