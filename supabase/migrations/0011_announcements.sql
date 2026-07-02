-- Admin announcements + an is_admin() helper for RLS.
-- Paste into the Supabase dashboard → SQL Editor → Run. Safe to re-run.
--
-- Admins are designated by a flag in the user's app_metadata (server-controlled,
-- rides in the JWT). Make someone an admin with:
--
--   update auth.users
--      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
--                              || '{"is_admin": true}'::jsonb
--    where email = 'you@example.com';
--
-- They must sign out and back in afterwards so the new claim is in their token.

-- ---------------------------------------------------------------------------
-- 1. is_admin() — reads the JWT app_metadata claim. Used by RLS below and
--    mirrored by requireAdmin() in the app.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean,
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. announcements — admin-authored notices shown to all users.
-- ---------------------------------------------------------------------------
create table if not exists public.announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text not null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.announcements enable row level security;

-- Everyone signed in can read active announcements; admins can read all.
drop policy if exists "Read active announcements" on public.announcements;
create policy "Read active announcements"
  on public.announcements for select
  to authenticated
  using (active or public.is_admin());

-- Only admins can write.
drop policy if exists "Admins insert announcements" on public.announcements;
create policy "Admins insert announcements"
  on public.announcements for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "Admins update announcements" on public.announcements;
create policy "Admins update announcements"
  on public.announcements for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins delete announcements" on public.announcements;
create policy "Admins delete announcements"
  on public.announcements for delete
  to authenticated
  using (public.is_admin());

grant select, insert, update, delete on public.announcements to authenticated;

-- Active announcements, newest first — the common read path.
create index if not exists announcements_active_idx
  on public.announcements (created_at desc)
  where active = true;
