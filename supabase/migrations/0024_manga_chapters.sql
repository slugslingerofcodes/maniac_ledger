-- Manga chapter catalog: per-manga chapter lists (number + title), lazily
-- backfilled from the MangaDex API the first time a detail page is opened and
-- re-synced when stale (publishing titles refresh daily). Mirrors the anime
-- `episodes` model. Paste into the Supabase dashboard → SQL Editor → Run.
-- Safe to re-run.

-- MangaDex linkage + sync bookkeeping on the manga catalog row.
alter table public.manga
  add column if not exists mangadex_id text,
  add column if not exists chapters_synced_at timestamptz;

create table if not exists public.manga_chapters (
  id           uuid primary key default gen_random_uuid(),
  manga_id     uuid not null
                 references public.manga (id) on delete cascade,
  -- Numeric, not integer: split releases ("10.5") are real chapter numbers.
  number       numeric not null,
  title        text,
  published_at date,
  created_at   timestamptz not null default now(),
  unique (manga_id, number)
);

alter table public.manga_chapters enable row level security;

-- Catalog contributions, like `episodes`: any signed-in user can read and
-- backfill chapter rows.
drop policy if exists "Manga chapters readable by authenticated" on public.manga_chapters;
create policy "Manga chapters readable by authenticated"
  on public.manga_chapters for select
  to authenticated
  using (true);

drop policy if exists "Manga chapters insertable by authenticated" on public.manga_chapters;
create policy "Manga chapters insertable by authenticated"
  on public.manga_chapters for insert
  to authenticated
  with check (true);

-- Re-syncs heal chapter titles in place (upsert's conflict-update path), so
-- updates are catalog contributions too — same trust model as inserts.
drop policy if exists "Manga chapters updatable by authenticated" on public.manga_chapters;
create policy "Manga chapters updatable by authenticated"
  on public.manga_chapters for update
  to authenticated
  using (true)
  with check (true);

-- Chapter list per manga, in reading order.
create index if not exists manga_chapters_manga_number_idx
  on public.manga_chapters (manga_id, number);
