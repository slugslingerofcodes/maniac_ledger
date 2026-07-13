-- Manga framework: a shared manga catalog + per-user reading progress, mirroring
-- the anime / user_progress model. Paste into the Supabase dashboard → SQL
-- Editor → Run. Safe to re-run.
--
-- Tables:
--   * manga            shared catalog (community contributions, like `anime`)
--   * manga_progress   per-user reading progress (RLS-scoped to auth.uid())
-- Enum:
--   * reading_status   reading|completed|plan_to_read|on_hold|dropped

-- ---------------------------------------------------------------------------
-- Enum
-- ---------------------------------------------------------------------------

do $$
begin
  create type public.reading_status as enum
    ('reading', 'completed', 'plan_to_read', 'on_hold', 'dropped');
exception
  when duplicate_object then null;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. manga (shared catalog)
-- ---------------------------------------------------------------------------

create table if not exists public.manga (
  id            uuid primary key default gen_random_uuid(),
  mal_id        integer unique,
  title         text not null,
  title_english text,
  synopsis      text,
  cover_url     text,
  score         numeric,
  -- Free text ("Finished", "Publishing", "On Hiatus", …) — MAL's manga status.
  status        text,
  -- MAL media kind: "Manga" | "Manhwa" | "Manhua" | "Light Novel" | "One-shot" …
  -- Powers the format tabs on /manga/search and /manga/library.
  type          text,
  chapters      integer,
  volumes       integer,
  year          integer,
  authors       text[] not null default '{}',
  genres        text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- If the table was created from an earlier draft of this migration (no `type`),
-- bring it up to date. No-op on a fresh run.
alter table public.manga add column if not exists type text;

alter table public.manga enable row level security;

-- Catalog contributions: any authenticated user can read + contribute rows,
-- exactly like the anime catalog (see migration 0002).
drop policy if exists "Manga is readable by authenticated" on public.manga;
create policy "Manga is readable by authenticated"
  on public.manga for select
  to authenticated
  using (true);

drop policy if exists "Manga is insertable by authenticated" on public.manga;
create policy "Manga is insertable by authenticated"
  on public.manga for insert
  to authenticated
  with check (true);

drop policy if exists "Manga is updatable by authenticated" on public.manga;
create policy "Manga is updatable by authenticated"
  on public.manga for update
  to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- 2. manga_progress (per-user)
-- ---------------------------------------------------------------------------

create table if not exists public.manga_progress (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null
                   references auth.users (id) on delete cascade
                   default auth.uid(),
  manga_id       uuid not null
                   references public.manga (id) on delete cascade,
  status         public.reading_status not null default 'plan_to_read',
  chapters_read  integer not null default 0,
  volumes_read   integer not null default 0,
  score          integer check (score between 1 and 10),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, manga_id)
);

alter table public.manga_progress enable row level security;

drop policy if exists "Users can view their own manga progress" on public.manga_progress;
create policy "Users can view their own manga progress"
  on public.manga_progress for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own manga progress" on public.manga_progress;
create policy "Users can insert their own manga progress"
  on public.manga_progress for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own manga progress" on public.manga_progress;
create policy "Users can update their own manga progress"
  on public.manga_progress for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own manga progress" on public.manga_progress;
create policy "Users can delete their own manga progress"
  on public.manga_progress for delete
  to authenticated
  using (auth.uid() = user_id);

-- "Your manga", newest activity first.
create index if not exists manga_progress_user_updated_idx
  on public.manga_progress (user_id, updated_at desc);
