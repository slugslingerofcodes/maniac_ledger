-- Realtime for live progress updates across tabs/devices.
-- Paste into the Supabase dashboard → SQL Editor → Run. Safe to re-run.
--
-- The detail page's useRealtimeProgress hook subscribes to postgres_changes on
-- these two tables. For that to deliver anything they must be in the
-- `supabase_realtime` publication, and to deliver UPDATE/DELETE with enough row
-- data for the client filters + RLS to match, they need REPLICA IDENTITY FULL
-- (by default DELETE old-rows carry only the primary key).
--
-- RLS (from 0001 / 0004) still applies to Realtime: each client only receives
-- changes to rows it could SELECT, so users never see each other's progress.

-- ---------------------------------------------------------------------------
-- 1. Add the tables to the Realtime publication (idempotent)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_progress'
  ) then
    alter publication supabase_realtime add table public.user_progress;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'episode_progress'
  ) then
    alter publication supabase_realtime add table public.episode_progress;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Full row image on UPDATE/DELETE so filters (user_id / anime_id) and RLS
--    can be evaluated against the changed row. Idempotent.
-- ---------------------------------------------------------------------------

alter table public.user_progress replica identity full;
alter table public.episode_progress replica identity full;
