-- Schedule the weekly-digest Edge Function: Mondays 09:00 UTC.
-- Paste into the Supabase dashboard → SQL Editor → Run.
--
-- Same pattern as 0009: replace __PROJECT_REF__ with your project ref and make
-- sure the 'service_role_key' Vault secret exists (created in 0009's step 2a).

-- Refuse to schedule a job that can never reach the function. This file was
-- once run with the placeholder left in (0032 repairs that job), and since
-- cron.schedule overwrites a job of the same name, a re-run would break it
-- again. Find-and-replace rewrites this literal too, so the check only trips
-- while the placeholder is still here.
do $$
begin
  if '__PROJECT_REF__' like '\_\_%' then
    raise exception 'Replace __PROJECT_REF__ with your project ref before running 0019.';
  end if;
end $$;

create extension if not exists pg_cron;
create extension if not exists pg_net;

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

-- Manage:
--   select * from cron.job;
--   select cron.unschedule('weekly-digest-monday');
