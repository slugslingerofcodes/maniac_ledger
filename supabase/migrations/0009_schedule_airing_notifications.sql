-- Schedule the send-airing-notifications Edge Function to run daily at 08:00 UTC.
-- Paste into the Supabase dashboard → SQL Editor → Run.
--
-- Replace __PROJECT_REF__ with your project ref (Settings → General), and supply
-- the service-role key. Two ways to provide the key are shown below — prefer
-- Vault so the secret isn't stored in plaintext in the cron job definition.

-- ---------------------------------------------------------------------------
-- 1. Extensions (enable once per project)
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- 2a. RECOMMENDED — store the key in Vault once, reference it in the job.
--     Run this insert a single time (it's safe to skip if already stored):
--
--     select vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key');
--
--     Then schedule, reading the key back from Vault at run time:
-- ---------------------------------------------------------------------------
select cron.schedule(
  'send-airing-notifications-daily',
  '0 8 * * *',
  $$
  select net.http_post(
    url     := 'https://__PROJECT_REF__.supabase.co/functions/v1/send-airing-notifications',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'service_role_key'
      )
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- ---------------------------------------------------------------------------
-- 2b. ALTERNATIVE — inline the key directly (simpler, but the secret lives in
--     cron.job in plaintext). Unschedule 2a first, then use:
--
--     select cron.unschedule('send-airing-notifications-daily');
--     select cron.schedule(
--       'send-airing-notifications-daily',
--       '0 8 * * *',
--       $$
--       select net.http_post(
--         url     := 'https://__PROJECT_REF__.supabase.co/functions/v1/send-airing-notifications',
--         headers := jsonb_build_object(
--           'Content-Type',  'application/json',
--           'Authorization', 'Bearer __SERVICE_ROLE_KEY__'
--         ),
--         body    := '{}'::jsonb,
--         timeout_milliseconds := 30000
--       );
--       $$
--     );

-- ---------------------------------------------------------------------------
-- Inspect / manage:
--   select * from cron.job;                              -- list jobs
--   select * from cron.job_run_details order by start_time desc limit 10;
--   select cron.unschedule('send-airing-notifications-daily');
-- ---------------------------------------------------------------------------
