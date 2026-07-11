-- Web Push subscriptions for airing notifications.
-- Paste into the Supabase dashboard → SQL Editor → Run.
--
-- One row per browser subscription (a user can have several devices).
-- `endpoint` is the push service URL and is unique; p256dh/auth are the
-- client keys needed to encrypt pushes. The send-airing-notifications Edge
-- Function reads these with the service role (bypasses RLS); the app only
-- ever touches the signed-in user's own rows.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "read own push subscriptions"
  on public.push_subscriptions for select
  to authenticated
  using (user_id = auth.uid());

create policy "insert own push subscriptions"
  on public.push_subscriptions for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "delete own push subscriptions"
  on public.push_subscriptions for delete
  to authenticated
  using (user_id = auth.uid());

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);
