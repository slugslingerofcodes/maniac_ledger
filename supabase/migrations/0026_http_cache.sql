-- Durable, shared cache for upstream API responses (Jikan/MAL today).
-- Paste into the Supabase dashboard → SQL Editor → Run. Safe to re-run.
--
-- Why this exists: the app already caches Jikan responses in-process, but that
-- cache dies with the serverless instance, so every cold start pays the full
-- price again — ~20 serial calls through a 350ms rate-limit queue. This table
-- is the tier that survives cold starts and is shared across instances.
--
-- Values are public catalog data (anime metadata), never user data.

create table if not exists public.http_cache (
  -- Namespaced request key, e.g. 'jikan:/anime?q=frieren&page=1'.
  key        text primary key,
  value      jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security — service_role only.
--
-- RLS is ON with **no policies and no grants**, which is the point: anon and
-- authenticated cannot read or write this table at all, and service_role
-- bypasses RLS entirely. A cache that any signed-in user could write to is a
-- cache-poisoning vector — one bad row would be served to every other user as
-- if it came from MAL. Only trusted server code (src/lib/http-cache.ts, which
-- holds the service key) may touch it.
-- ---------------------------------------------------------------------------

alter table public.http_cache enable row level security;

-- Defensive: revoke anything a previous run or a default grant may have left.
revoke all on public.http_cache from anon, authenticated;

-- Expired-row lookup for the purge below.
create index if not exists http_cache_expires_at_idx
  on public.http_cache (expires_at);

-- ---------------------------------------------------------------------------
-- Purge. Reads skip expired rows anyway (lazy expiry), so this is housekeeping
-- to stop the table growing without bound.
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;

-- Re-runnable: drop the job first if this migration is applied twice.
select cron.unschedule('purge-http-cache')
where exists (select 1 from cron.job where jobname = 'purge-http-cache');

select cron.schedule(
  'purge-http-cache',
  -- Hourly at :17, off the top of the hour to avoid the busy minute.
  '17 * * * *',
  $$ delete from public.http_cache where expires_at < now() $$
);

-- Manage:
--   select * from cron.job where jobname = 'purge-http-cache';
--   select cron.unschedule('purge-http-cache');
