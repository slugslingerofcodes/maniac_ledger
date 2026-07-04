# Deploying anime_maniacs

Production stack: **Vercel** (Next.js 16) + **Supabase** (Postgres/RLS, Edge
Functions, pg_cron) + **Resend** (email) + **Gemini** (recommendations).

Run these in order — later steps depend on earlier ones. There is **no migration
runner**: paste each SQL file into the Supabase dashboard → SQL Editor → Run.

## 1. Database migrations (Supabase → SQL Editor)

Apply in order (1–5 are already applied if the app has been running):

| File | Adds |
| --- | --- |
| `supabase/migrations/0006_realtime_progress.sql` | Realtime publication + `REPLICA IDENTITY FULL` |
| `supabase/migrations/0007_anime_franchise_id.sql` | `anime.franchise_id` + index |
| `supabase/migrations/0008_notifications.sql` | `notifications` table + RLS |
| `supabase/migrations/0010_recommendations.sql` | `recommendations` table + RLS + GRANTs |
| `supabase/migrations/0011_announcements.sql` | `announcements` table + RLS + `is_admin()` helper |
| `supabase/migrations/0012_avatars.sql` | public `avatars` storage bucket + per-user RLS (profile pictures) |
| `supabase/migrations/0013_anime_chat.sql` | `anime_chat_messages` table + RLS + Realtime publication (per-anime chat) |
| `supabase/migrations/0014_anime_genres.sql` | `anime.genres text[]` + GIN index (library genre filter; backfills on add/view) |

(`0009` is run in step 3, after the Edge Functions are deployed.)

**Make an administrator** (for the `/admin` dashboard) — after `0011`, flag a user,
then have them sign out/in so the claim lands in their token:

```sql
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"is_admin": true}'::jsonb
 where email = 'you@example.com';
```

## 2. Edge Functions (Supabase CLI)

```bash
supabase login
supabase link --project-ref <your-project-ref>

# Resend — verify a sending domain at resend.com first
supabase secrets set RESEND_API_KEY=re_xxx RESEND_FROM="anime_maniacs <alerts@yourdomain>"

supabase functions deploy resolve-franchise
supabase functions deploy send-airing-notifications
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — do not set them.

## 3. Cron — daily airing digest (Supabase → SQL Editor)

Run `supabase/migrations/0009_schedule_airing_notifications.sql` — replace
`__PROJECT_REF__` and use the **Vault** variant (store the service-role key in
Vault, never inline). Smoke-test:

```sql
select net.http_post(
  url := 'https://<ref>.supabase.co/functions/v1/send-airing-notifications',
  headers := jsonb_build_object('Authorization', 'Bearer <service_role>'),
  body := '{}'::jsonb);
select * from cron.job_run_details order by start_time desc limit 5;
```

## 4. Environment variables (Vercel → Settings → Environment Variables)

| Var | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | **Baked at build time** — changing requires a redeploy |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same; RLS protects the data |
| `GEMINI_API_KEY` | Server-only; required for `/recommendations` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only; bypasses RLS.** Used solely by the `/admin` dashboard (`src/lib/supabase/admin.ts`) to list users via the Auth admin API. Also add to `.env.local` for local admin testing. Never expose to the client. |

Resend keys live in Supabase Edge secrets (step 2), **not** Vercel.

## 5. Deploy + enable analytics

```bash
vercel --prod    # or push to the connected branch for auto-deploy
```

In the Vercel dashboard, enable **Web Analytics** and **Speed Insights** — the
`<Analytics/>` / `<SpeedInsights/>` components only emit once those are on.

## 6. Post-deploy smoke test (prod URL, signed in)

- Library loads; search → add; episode toggle; `/upcoming` notify; `/recommendations` → Generate (needs `GEMINI_API_KEY` + some completed/rated anime).
- PWA: install prompt (manifest + icons + HTTPS), service worker registers (prod-only), offline `/library` shows cached data.
- Analytics: trigger events (`anime_added`, etc.) and confirm they land in the Vercel Analytics dashboard.

## Not yet wired (optional)

- **Sentry** — run `npx @sentry/wizard@latest -i nextjs`, then set
  `enabled: process.env.NODE_ENV === "production"`, `tracesSampleRate: 0.1`, a
  `beforeBreadcrumb` email scrub, and wrap server actions in
  `Sentry.withServerActionInstrumentation`. Note: source-map upload is webpack-based;
  check Turbopack support for release builds.

## Notes

- `next.config.ts` allows **any** https image host (`remotePatterns: "**"`); tighten to specific hosts if you want the allowlist back.
- `franchise_id` stays empty until steps 1–2 are done and users add anime (the
  `after()` hook calls `resolve-franchise`); the detail-page Franchise section
  stays hidden until then.
