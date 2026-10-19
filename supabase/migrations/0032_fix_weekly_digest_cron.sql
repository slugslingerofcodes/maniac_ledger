-- 0032: point the weekly-digest cron job at the real project.
-- Paste into the Supabase dashboard → SQL Editor → Run. Safe to re-run.
--
-- 0019 was run with its __PROJECT_REF__ placeholder left in, so the live
-- 'weekly-digest-monday' job has POSTed to https://__PROJECT_REF__.supabase.co
-- every Monday and never once reached the weekly-digest function. Nothing
-- noticed because cron.job_run_details records each run as 'succeeded': that
-- only means net.http_post queued the request. The HTTP outcome lands in
-- net._http_response, which pg_net prunes after ~6 hours.
--
-- Replace __PROJECT_REF__ with your project ref (Settings → General; it is the
-- host in the 'send-airing-notifications-daily' job's URL) and make sure the
-- 'service_role_key' Vault secret exists (0009, step 2a). The weekly-digest
-- Edge Function must already be deployed.

-- Refuse to schedule a job that can never reach the function. Find-and-replace
-- rewrites this literal too, so the check only trips while the placeholder is
-- still here.
do $$
begin
  if '__PROJECT_REF__' like '\_\_%' then
    raise exception 'Replace __PROJECT_REF__ with your project ref before running 0032.';
  end if;
end $$;

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('weekly-digest-monday')
where exists (select 1 from cron.job where jobname = 'weekly-digest-monday');

select cron.schedule(
  'weekly-digest-monday',
  '0 9 * * 1',
  $$
  select net.http_post(
    url     := 'https://__PROJECT_REF__.supabase.co/functions/v1/weekly-digest',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'service_role_key'
      )
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Check (the job should name your ref, and no job should still carry the
-- placeholder):
--   select jobname, schedule, command from cron.job where jobname = 'weekly-digest-monday';
--   select jobname from cron.job where command like '%\_\_PROJECT\_REF\_\_%';
-- After a Monday 09:00 UTC run (pg_net keeps responses ~6h):
--   select status_code, left(content::text, 300) from net._http_response order by created desc limit 5;
-- Manage:
--   select cron.unschedule('weekly-digest-monday');
