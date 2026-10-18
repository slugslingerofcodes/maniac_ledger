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
| `supabase/migrations/0015_social.sql` | `profiles` + `follows` tables + RLS |
| `supabase/migrations/0016_lists.sql` | `lists` + `list_items` tables + RLS |
| `supabase/migrations/0017_rewatch_episode_ratings.sql` | `user_progress.rewatch_count`, `episode_progress.rating` |
| `supabase/migrations/0018_push_subscriptions.sql` | `push_subscriptions` table + RLS |
| `supabase/migrations/0020_friends.sql` | `friendships` table + RLS |
| `supabase/migrations/0021_store.sql` | `products` + `product_requests` tables + RLS |
| `supabase/migrations/0022_manga.sql` | `manga` (+ `type`) + `manga_progress` tables + RLS |
| `supabase/migrations/0023_private_progress.sql` | `user_progress.is_private` (keeps misc-tab adds off the feed) |
| `supabase/migrations/0024_manga_chapters.sql` | `manga.mangadex_id`, `manga.chapters_synced_at`, `manga_chapters` table |
| `supabase/migrations/0025_mangadex_only_manga.sql` | unique constraint on `manga.mangadex_id` (MAL-less titles) |
| `supabase/migrations/0026_http_cache.sql` | `http_cache` table (service-role only) + hourly purge job — the durable Jikan cache |
| `supabase/migrations/0028_calendar_feeds.sql` | `calendar_feeds` table (SHA-256 token hashes, one per user) + owner-only RLS — the live calendar subscription on `/schedule` |
| `supabase/migrations/0029_revoke_trigger_fn_execute.sql` | revokes RPC access (`EXECUTE` from `public`/`anon`/`authenticated`) to the SECURITY DEFINER trigger functions; the triggers keep firing |

(`0009` is run in step 3, after the Edge Functions are deployed; `0019` in step 3a.)

**Verify rather than guess.** Nothing records which migrations have run, so after
applying any of the above, confirm the database actually has what the code needs:

```bash
npm run check:schema     # anon key only, reads no rows; exit 1 on drift
```

It probes every table/column the app depends on via PostgREST and names the
migration behind anything missing. Objects it *can't* see — Realtime publications
(`0006`), pg_cron schedules (`0009`, `0019`, `0026`), the avatars bucket (`0012`),
bare constraints (`0025`), and function grants (`0029`) — are listed in its output
as needing a manual check.

> As of the last run, `0001`–`0029` are **all applied** (verified, not assumed).

**`0026` is optional but recommended.** Without it — or without
`SUPABASE_SERVICE_ROLE_KEY` (step 4) — the shared cache silently disables itself
and the app runs on the in-process cache alone, exactly as it did before. Nothing
breaks; cold starts just stay slow.

**`0028` also needs `SUPABASE_SERVICE_ROLE_KEY`.** Calendar apps fetch
`/api/calendar/feed/<token>.ics` without cookies, so the route resolves the token
with the service role. Until both are in place the "Get subscription link"
control on `/schedule` stays hidden; the one-time "Add to calendar" download
works either way.

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
| `XAI_API_KEY` | Server-only; required for `/recommendations` — the AI picks and the describe-it search box (xAI / Grok) |
| `XAI_MODEL` | Optional; overrides the default Grok model. Set this when xAI retires one rather than editing code |
| `GEMINI_API_KEY` | Server-only; required for the natural-language filter box on `/search` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only; bypasses RLS.** Used by the `/admin` dashboard (`src/lib/supabase/admin.ts`) to list users via the Auth admin API, by the shared Jikan cache (`0026`), and by the calendar subscription feed (`0028`) to resolve feed tokens. Also add to `.env.local` for local admin and feed testing. Never expose to the client. |

Resend keys live in Supabase Edge secrets (step 2), **not** Vercel.

## 5. Deploy + enable analytics

```bash
vercel --prod    # or push to the connected branch for auto-deploy
```

In the Vercel dashboard, enable **Web Analytics** and **Speed Insights** — the
`<Analytics/>` / `<SpeedInsights/>` components only emit once those are on.

## 6. Post-deploy smoke test (prod URL, signed in)

The core signed-in flows — sign in, home rows, library search, search → add →
remove, episode tick/untick, the poster lightbox, the ⌘K palette, 375px layout —
are automated by the E2E job (step 7) on every PR's preview. What's left by hand:

- `/upcoming` notify; `/recommendations` → Generate and the describe-it box (both need `XAI_API_KEY`; Generate also needs some completed/rated anime).
- PWA: install prompt (manifest + icons + HTTPS), service worker registers (prod-only), offline `/library` shows cached data.
- Analytics: trigger events (`anime_added`, etc.) and confirm they land in the Vercel Analytics dashboard.

## 7. End-to-end tests (Playwright, on every PR's preview)

`e2e/` holds Playwright specs for the flows above, kept apart from the Vitest
suite in `tests/`. The **E2E (Vercel preview)** job in `.github/workflows/ci.yml`
runs them on every pull request: it waits for the `maniac-ledger` preview of the
PR's head commit (via the GitHub Deployment the Vercel app records — the same
build its PR comment links to), then runs Playwright against that URL.

| Spec | Flow | Needs |
| --- | --- | --- |
| `setup/auth.setup.ts` | sign in through the real form | account |
| `public.spec.ts` | signed-out redirect, wrong-password message, `/login` at 375px | — |
| `home.spec.ts` | banner + at least three rows filled with titles | account |
| `palette.spec.ts` | Ctrl/⌘+K opens the palette, "naruto" returns titles | account |
| `library.spec.ts` | search → **+ Add** Cowboy Bebop → library search shows the stats bar → remove it | account + Supabase |
| `anime-detail.spec.ts` | poster lightbox paints above everything (the stacking-context regression); tick / untick episode 1 of Trigun | account (+ Supabase for episodes) |
| `mobile-overflow.spec.ts` | no sideways scroll at 375px on `/`, `/library`, an anime page | account |

### One-time setup (yours to do)

1. **Create the test account.** Sign up on production (`/signup`) with an
   address you control that is used for nothing else (a plus-address works),
   confirm the email, and leave the profile **private** (the default) so its
   test adds never show in anyone's feed. Don't reuse a real account: the suite
   writes to this account's library on the live database.
2. **Create a Vercel bypass secret.** Previews of `maniac-ledger` are behind
   Vercel Authentication, which a headless browser can't pass. In Vercel →
   `maniac-ledger` → Settings → Deployment Protection → **Protection Bypass for
   Automation**, generate a secret.
3. **Add GitHub repository secrets** (Settings → Secrets and variables → Actions):

   | Secret | Value |
   | --- | --- |
   | `E2E_EMAIL` | the test account's email |
   | `E2E_PASSWORD` | its password |
   | `VERCEL_AUTOMATION_BYPASS_SECRET` | the secret from step 2 |
   | `NEXT_PUBLIC_SUPABASE_URL` | same value as in Vercel |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same value as in Vercel |
   | `E2E_USERNAME` *(optional)* | the account's username — sign in with it instead of the email, exercising the username lookup |

   The two Supabase secrets are what the writing specs clean up with. They also
   switch the `verify` job from its placeholder build to a real one and turn on
   its schema-drift check, which was already written to wait for them.

### Without the secrets, nothing goes red

| Missing | Result |
| --- | --- |
| `VERCEL_AUTOMATION_BYPASS_SECRET` (preview protected) | the job finds the preview, posts a notice, and runs nothing |
| `E2E_EMAIL` / `E2E_PASSWORD` | only `public.spec.ts` runs; every signed-in spec is skipped |
| the Supabase pair | the specs that write (`library`, the episode test) are skipped; the read-only ones run |

Fork PRs skip the job entirely (no secrets, no unapproved Vercel deploy).

### What the tests write, and how they clean up

Only the test account's own rows, through its own session (anon key, never the
service role), so RLS confines every write to that account:

- `library.spec.ts` adds and removes **Cowboy Bebop** (MAL 1).
- `anime-detail.spec.ts` ticks and unticks episode 1 of **Trigun** (MAL 6).

Each of those files deletes its title's `user_progress` / `episode_progress`
rows for the account **before** it runs (in case an earlier run died half-way)
and **after** (however the tests ended). Shared catalog rows (`anime`,
`episodes`) are left alone; the app writes those on any visit. Runs are queued
behind one concurrency group, because two at once would add and remove each
other's titles. Traces and HTML reports stay off in CI and only failure
screenshots are uploaded: artifacts on a public repo aren't masked the way
logs are, and traces carry the account's cookies.

The lightbox test fails on any build that renders the overlay inside the
detail hero instead of portalling it to `<body>`; that is the regression it
exists to catch.

### Running locally

```bash
npx playwright install chromium   # once
npm run e2e                       # reuses `npm run dev` on :3000, or starts it
```

Put `E2E_EMAIL` / `E2E_PASSWORD` in `.env.local` (gitignored; the dev server
reads the same file) to include the signed-in specs; without them they skip.
To test a deployment instead of the dev server, set `E2E_BASE_URL`, plus
`VERCEL_AUTOMATION_BYPASS_SECRET` for a protected preview. Every variable is
listed in `e2e/env.ts`. Locally `api.jikan.moe` may be unreachable; the pages
fall back to AniList and the catalog, which is what the specs see.

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
