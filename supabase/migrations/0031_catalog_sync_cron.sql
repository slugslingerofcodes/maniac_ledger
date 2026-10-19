-- 0031: run the catalog-sync Edge Function every six hours.
-- Paste into the Supabase dashboard → SQL Editor → Run. Safe to re-run.
--
-- Order matters: apply 0030 first, then `supabase functions deploy
-- catalog-sync`, then this. Same pattern as 0009: replace __PROJECT_REF__ with
-- your project ref (Settings → General) and make sure the 'service_role_key'
-- Vault secret exists (0009, step 2a).
--
-- Why six hours: the charts it mirrors move daily at most, and pages treat a
-- snapshot as fresh for 36h — so up to five runs in a row can fail (an outage,
-- a bad deploy) before any page goes back to asking the live engines. One run
-- costs ~25 Jikan requests (≤2.5/s) and ~3 AniList requests, so the budget is
-- nowhere near either upstream's limits.

-- Refuse to schedule a job that can never reach the function. The live
-- 'weekly-digest-monday' job was scheduled from 0019 with the placeholder left
-- in, and nothing noticed. Find-and-replace rewrites this literal too, so the
-- check only trips while the placeholder is still here.
do $$
begin
  if '__PROJECT_REF__' like '\_\_%' then
    raise exception 'Replace __PROJECT_REF__ with your project ref before running 0031.';
  end if;
end $$;

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('catalog-sync')
where exists (select 1 from cron.job where jobname = 'catalog-sync');

select cron.schedule(
  'catalog-sync',
  -- :23 past, every sixth hour: clear of the :00 digests and the :17 purge.
  '23 */6 * * *',
  $$
  select net.http_post(
    url     := 'https://__PROJECT_REF__.supabase.co/functions/v1/catalog-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'service_role_key'
      )
    ),
    body    := '{}'::jsonb,
    -- The function bounds itself at ~110s; this only stops pg_net waiting.
    timeout_milliseconds := 150000
  );
  $$
);

-- Manage:
--   select * from cron.job where jobname = 'catalog-sync';
--   select status, return_message, start_time from cron.job_run_details
--     where jobid = (select jobid from cron.job where jobname = 'catalog-sync')
--     order by start_time desc limit 5;
--   select status_code, left(content::text, 300) from net._http_response order by created desc limit 5;
--   select cron.unschedule('catalog-sync');
