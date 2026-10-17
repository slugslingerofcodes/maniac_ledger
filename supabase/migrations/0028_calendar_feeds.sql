-- 0028: per-user secret tokens for the live calendar subscription feed.
-- Paste into the Supabase dashboard → SQL Editor → Run. Safe to re-run.
--
-- "Add to calendar" started as a one-time .ics download behind the session
-- cookie. A *subscription* is fetched by the calendar app on its own schedule
-- (Google, Apple, Outlook), with no cookies, so the URL itself has to carry the
-- credential: /api/calendar/feed/<token>.ics. This table maps that token to
-- its owner.
--
-- Only a SHA-256 of the token is stored. The token is 32 random bytes, so the
-- hash can't be reversed or guessed, and a read of this table — a leaked
-- backup, or a future policy as broad as 0015's — yields no working feed URLs.
-- The cost is that the app can't show a link again after minting it; the user
-- rotates to get a new one, which also kills the old one.
--
-- One feed per user (user_id is the primary key): rotating overwrites the hash,
-- revoking deletes the row. Deleting the account cascades.
--
-- Access: the owner manages their own row through RLS (the server actions use
-- the signed-in client). The public feed route resolves token → user with the
-- service role, which bypasses RLS, so it needs SUPABASE_SERVICE_ROLE_KEY.

create table if not exists public.calendar_feeds (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  -- Lowercase hex SHA-256 of the token; the unique constraint is also the
  -- index the feed route looks tokens up by.
  token_hash text not null unique
    constraint calendar_feeds_token_hash_format check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

alter table public.calendar_feeds enable row level security;

-- Owner-only, for every verb. No policy names anon, so a signed-out client
-- reads and writes nothing.
drop policy if exists "read own calendar feed" on public.calendar_feeds;
create policy "read own calendar feed"
  on public.calendar_feeds for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "insert own calendar feed" on public.calendar_feeds;
create policy "insert own calendar feed"
  on public.calendar_feeds for insert
  to authenticated
  with check (user_id = auth.uid());

-- Rotation is an upsert, which needs UPDATE as well as INSERT. WITH CHECK stops
-- a row being handed to another user.
drop policy if exists "update own calendar feed" on public.calendar_feeds;
create policy "update own calendar feed"
  on public.calendar_feeds for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "delete own calendar feed" on public.calendar_feeds;
create policy "delete own calendar feed"
  on public.calendar_feeds for delete
  to authenticated
  using (user_id = auth.uid());
