# anime_maniacs — Project Report

*A full-stack anime & manga tracker — installable PWA with offline support, realtime sync, and AI-powered recommendations.*

---

## Overview

anime_maniacs is a production-deployed web app for tracking anime and manga: search any title, add it to your library, tick off episodes as you watch, and get "Continue Watching" resumption, air-date email reminders, and AI-generated recommendations based on your taste. It is built as an installable Progressive Web App, so the library works even when you're offline.

**Live stack:** Next.js 16 (App Router, React Server Components, Turbopack) · React 19 · TypeScript · Supabase (Postgres, Auth, Realtime, Edge Functions) · Tailwind CSS v4 · TanStack Query · Google Gemini · Vercel

**By the numbers:** ~28,000 lines of TypeScript · 39 routed pages · 26 hand-written SQL migrations · 447 automated tests across 19 suites · 79 commits

---

## Key features

- **Universal search & library** — search across the full MyAnimeList catalog (via the Jikan API), one-tap add with optimistic UI, per-episode progress checklists, and a "Continue Watching" rail driven by a database trigger.
- **Offline-first PWA** — the library is cached to IndexedDB via TanStack Query's persister and served by a hand-written service worker, so the app installs to the home screen and keeps working without a network.
- **Realtime sync** — episode progress uses Supabase Realtime (Postgres logical replication), so marking an episode on one device refreshes the page on another instantly.
- **AI recommendations** — a server action sends the user's library to Gemini, resolves every pick back to a real catalog entry with poster and score, and stores denormalized results so the page renders with zero extra fetches.
- **Air-date notifications** — a daily pg_cron job invokes a Deno Edge Function that emails users a digest of their shows airing that day (via Resend).
- **Franchise grouping** — adding a show kicks off a background BFS over MyAnimeList's relation graph (in an Edge Function) to group sequels/spin-offs under one franchise, without blocking the user's request.
- **Polish** — poster-morph page transitions (View Transitions API), a command palette, swipe gestures, pull-to-refresh, dark mode, and a fully responsive mobile navigation.

## Engineering highlights

### A three-tier cache that cut page loads from ~48s to sub-second
Next.js's built-in caching layers turn out to be inert when every page reads auth cookies — measured, not assumed: three identical requests produced three live upstream fetches. The fix was a self-built cache in front of the rate-limited Jikan API: (1) an in-process LRU with TTL, in-flight de-duplication, and negative caching; (2) a shared Postgres-backed HTTP cache that survives serverless cold starts and is locked down to the service role so no user can poison it; (3) the live API behind a serial rate-limit queue. Every tier fails soft — a cache outage can never break a page.

### Resilience as a first-class feature
Search and browse run through explicit fallback chains (Jikan → AniList → local catalog; MAL → AniList → MangaDex → catalog), so the app stays useful during upstream outages. Because those branches only execute when a third-party API is down, they're nearly impossible to test by hand — so the automated suite targets exactly them: outage simulation, cache TTL/LRU/de-dupe behavior, and rate-limiter timing with fake timers. 447 tests, and each new test is verified to fail before it's trusted to pass.

### Security by database design
Row-Level Security in Postgres is the access boundary, not application code — user data is scoped to `auth.uid()` at the database layer, so even a buggy query can't leak another user's rows. Auth is enforced centrally in middleware with an explicit public-path allowlist, and the service-role key never reaches the client.

### Operational discipline
A single `npm run verify` gate (lint + tests + typechecked build) runs in CI, and a custom schema-drift checker probes the live database and names the exact missing migration when code and schema disagree. Deploys span Vercel (app), Supabase (migrations, Edge Functions, cron), and Resend (email) — documented end-to-end.

---

## What I learned

- Framework caching claims are worth **measuring**: the "cached" pages were doing live fetches on every request, and finding that turned a 48-second page into a fast one.
- The most valuable tests cover the code that almost never runs — failure paths and fallbacks — because those are the branches that break silently.
- Putting authorization in the database (RLS) instead of sprinkling `WHERE user_id =` through app code eliminates a whole class of bugs.
- Serverless changes cache design: anything worth keeping across requests needs to live outside the process.

---
---

# LinkedIn post (ready to paste)

🎬 I built anime_maniacs — a full-stack anime & manga tracker, from empty repo to production.

It's an installable PWA where you can search any title, track episodes, sync progress across devices in realtime, get email reminders when your shows air, and receive AI-powered recommendations — and the library keeps working offline.

Stack: Next.js 16 · React 19 · TypeScript · Supabase (Postgres + RLS, Realtime, Edge Functions) · Tailwind v4 · TanStack Query · Gemini · Vercel

The parts I'm most proud of aren't features — they're engineering:

⚡ Diagnosed why Next.js's caching was silently inert for authenticated pages (~48s page loads!) and built a three-tier cache — in-process LRU → shared Postgres HTTP cache → rate-limited API — that fails soft at every level.

🛡️ Made resilience testable: search runs through multi-provider fallback chains (Jikan → AniList → local catalog), and 447 automated tests specifically target the outage paths that are impossible to exercise by hand.

🔒 Enforced security in the database itself with Postgres Row-Level Security, so no application bug can leak another user's data.

📬 Wired up pg_cron + Deno Edge Functions for daily air-date email digests, and background franchise-graph resolution that never blocks a user request.

~28,000 lines of TypeScript, 39 pages, 26 SQL migrations, and a CI gate that runs lint + tests + a typechecked build on every change.

#webdevelopment #nextjs #typescript #supabase #fullstack #buildinpublic
