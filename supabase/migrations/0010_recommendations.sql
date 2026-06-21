-- AI-generated anime recommendations, one row per (user, suggested anime).
-- Paste into the Supabase dashboard → SQL Editor → Run. Safe to re-run.

create table if not exists public.recommendations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null
                 references auth.users (id) on delete cascade
                 default auth.uid(),
  mal_id       integer not null,
  reason       text not null,
  -- Denormalized for display so the recommendations page needs no Jikan lookup.
  title        text,
  poster_url   text,
  score        real,
  generated_at timestamptz not null default now(),
  dismissed    boolean not null default false,
  -- At most one live recommendation per anime per user (upsert target).
  unique (user_id, mal_id)
);

-- ---------------------------------------------------------------------------
-- Row Level Security — users only see/manage their own recommendations.
-- ---------------------------------------------------------------------------

alter table public.recommendations enable row level security;

drop policy if exists "Users can view their own recommendations" on public.recommendations;
create policy "Users can view their own recommendations"
  on public.recommendations for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own recommendations" on public.recommendations;
create policy "Users can insert their own recommendations"
  on public.recommendations for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own recommendations" on public.recommendations;
create policy "Users can update their own recommendations"
  on public.recommendations for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own recommendations" on public.recommendations;
create policy "Users can delete their own recommendations"
  on public.recommendations for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Privileges. RLS gates *which rows* a role may touch; GRANTs gate *whether*
-- the role may touch the table at all. Supabase exposes PostgREST as these
-- roles, so the authenticated role needs table-level DML. (anon gets nothing —
-- recommendations are always user-scoped.)
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.recommendations to authenticated;

-- Active (non-dismissed) recommendations per user — the common read path.
create index if not exists recommendations_active_idx
  on public.recommendations (user_id)
  where dismissed = false;
