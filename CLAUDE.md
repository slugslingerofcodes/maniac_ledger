# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> The import above is intentional: this project runs **Next.js 16** (not 15), which has breaking changes vs. older docs. Read `node_modules/next/dist/docs/` before writing framework code.

## Commands

```bash
npm run dev      # dev server at http://localhost:3000 (Turbopack)
npm run build    # production build (Turbopack) — also runs the full TypeScript typecheck
npm run start    # serve the production build
npm run lint     # ESLint (flat config, eslint-config-next)

npm run test          # Vitest (unit; tests/**) — the data-layer gate
npm run test:watch    # Vitest in watch mode
npm run test:coverage # coverage over src/lib, src/app/api, src/app/actions
npm run verify        # lint + test + build — run this before calling a change done

npx shadcn@latest add <name>          # scaffold a shadcn/ui component into src/components/ui/
vercel --prod                         # deploy (project is linked to Vercel; env vars live in the Vercel project)
supabase functions deploy <name>      # deploy a Deno Edge Function (see supabase/functions/)
```

There is no separate typecheck script — `npm run build` is the typecheck. The automated gate is **`npm run verify`** (ESLint + Vitest + build); `"does it build?"` alone is not the bar, because the bugs this project actually shipped (a browse tab rendering 19 of 50 titles, ~48s page loads, a cache that was silently inert) were all invisible to `tsc`. Lint runs error-free (the three `no-unused-vars` warnings are intentional destructure-to-omit patterns in migration fallbacks) — keep it that way; a red gate stops being a gate. The full go-live sequence (migrations → Edge Functions → cron → Vercel) is in `DEPLOY.md`.

### Testing

Vitest, config in `vitest.config.ts`, specs in `tests/` (mirroring `src/`: `tests/lib`, `tests/api`, `tests/actions`). Node environment, no jsdom — the suite covers the **data layer**, not rendering.

What's covered, and why it's the part worth covering: the **upstream fallback chains** (`/api/anime/search`: Jikan → AniList → catalog; `searchMangaAction`: MAL → AniList → MangaDex → catalog), the **Jikan cache/rate-limiter** (TTL, LRU, in-flight de-dupe, negative caching, last-good degradation), and the **catalog mappers**. Every one of those branches only runs during an *upstream outage*, so they're near-impossible to exercise by hand and trivial to break silently.

Conventions worth keeping:
- **Mock at the module boundary** (`vi.mock("@/lib/jikan")`), not `fetch`, except in `tests/lib/jikan.test.ts` where the fetch layer *is* the subject.
- `jikan.ts` holds **module-level state** (cache, last-good map, rate-limit chain). Re-import it per test via `vi.resetModules()` or one test's cache silently satisfies the next one's fetches.
- Its queue spaces calls 350ms apart with real `setTimeout` — drive **fake timers** forward (`vi.advanceTimersByTimeAsync`) or tests hang.
- Supabase's query builder is fluent *and* thenable; `tests/helpers/supabase.ts` mocks it and records calls, so tests assert on the query that would have been sent (e.g. the `{Hentai}` exclusion).
- **Verify a new test can fail.** These tests guard failure paths, so a test that passes for the wrong reason is the default outcome, not the exception — break the code deliberately, watch it go red, then revert.

## Next.js 16 specifics (these differ from older Next and from training data)

- **`src/proxy.ts`, not `middleware.ts`.** The middleware file/function was renamed `proxy`; it runs on the Node runtime and delegates to `updateSession` (`src/lib/supabase/middleware.ts`).
- **`cookies()`, `params`, and `searchParams` are async** — `await` them. Page/route props are typed `params: Promise<{ … }>`.
- Route handlers use native `Request`/`Response`.

## Architecture

App Router project (TypeScript, RSC by default — add `"use client"` only for browser APIs/hooks). Import alias `@/*` → `./src/*`. Stack: Supabase (`@supabase/ssr`), shadcn/ui on **base-ui** primitives, Tailwind v4, Zod, the Jikan (MyAnimeList) API.

### Auth & the security model
- Three Supabase clients, all typed `<Database>`: `src/lib/supabase/client.ts` (browser), `server.ts` (RSC/server actions; async cookies), `middleware.ts` (session refresh + the gate).
- **The auth gate lives in `updateSession` (`src/lib/supabase/middleware.ts`)**: unauthenticated requests redirect to `/login` unless the path is in its `publicPaths` array (`/login`, `/signup`, `/reset-password`, `/auth`, `/api/anime/search`). Server-side guards are `requireUser()`/`getUser()` (`src/lib/supabase/auth.ts`); the client equivalent is `useUser()` (`src/hooks/`).
- **RLS is the access boundary, not app code.** Queries against `user_progress`/`episode_progress` do **not** filter by user — Postgres RLS scopes rows to `auth.uid()`. A missing `eq("user_id", …)` is intentional. Catalog tables (`anime`, `episodes`) are readable by, and insertable by, any authenticated user ("catalog contributions").

### Routing layout — the `(app)` group
**Every authed anime-side route lives under `src/app/(app)/`** — including `/` and `/anime/[id]`, which route groups leave URL-transparent. They share `src/app/(app)/layout.tsx`, which mounts the sticky `<AppNav/>` (drawer + avatar dropdown), the mobile `<BottomTabBar/>` (hidden at `md+`), `<AnnouncementBanner/>`, and `<AppBackdrop/>`. Only the auth pages (`/login`, `/signup`, `/reset-password`), `/choose`, `/admin`, and the manga side sit outside it.

Consequences worth knowing:
- **There is one nav.** `AppNav` + `BottomTabBar` both read `NAV_ITEMS` (`src/lib/nav-items.ts`), so a new authed route is added there once and appears everywhere. (The older `SiteHeader` is gone; the manga side still has its own: `src/components/manga/MangaNav.tsx` + `MangaBottomTabBar`.)
- **Pages must not render their own nav or backdrop.** The layout mounts both; `<AppBackdrop/>` picks by path (`/library` → none, `/search` → poster wall, `/anime/*` → galaxy, else vortex). A page-level backdrop stacks a second fixed layer under the first.
- New authed pages go in the group and should render just their content — a `relative flex flex-1 flex-col` wrapper, not `min-h-screen` (the layout owns full height).

### Database — manual migrations + hand-maintained types
- SQL migrations live in `supabase/migrations/` (`0001`…`0026`). **There is no migration runner**; they are applied by pasting into the Supabase SQL editor, and nothing records what ran. So schema work means three things, not one: write the migration, update `database.types.ts`, and add the new table/column to the manifest in `scripts/check-schema.mjs`.
- **`npm run check:schema` is how you know**, instead of guessing: it probes the live database (anon key, `limit=0`, reads no rows) for every table/column the code needs and names the migration behind anything missing. Exit 1 on drift. `0001`–`0026` are currently all applied — verified by running it, not assumed. Realtime publications, pg_cron schedules, storage buckets, and bare constraints are invisible to PostgREST; the script lists those separately as manual checks.
- `src/lib/database.types.ts` is **hand-maintained** to mirror the SQL (Row/Insert/Update per table, the `anime_watched_count` view, enums) and exports `Tables<T>`/`TablesInsert<T>`/`TablesUpdate<T>`/`Views<T>`/`Enums<T>`. `src/types/anime.ts` aliases these into domain names. **Edit both** `database.types.ts` and the migration when the schema changes, or queries silently lose type safety.
- Tables: `anime` (+ `franchise_id` for grouping sequels) + `episodes` (shared catalog), `user_progress` + `episode_progress` (per-user), `notifications` (air-date reminders) and `recommendations` (AI picks). Per-episode watching feeds the `anime_watched_count` view (created `security_invoker = on` so RLS flows through it) and a trigger that maintains `user_progress.last_watched_at` for "Continue Watching". `user_progress`/`episode_progress` are in the `supabase_realtime` publication (with `REPLICA IDENTITY FULL`) — `useRealtimeProgress` (`src/hooks/`) subscribes and `router.refresh()`es the detail page on change.

### Jikan (MyAnimeList) integration
- `src/lib/jikan.ts` is the typed v4 client. **All calls route through a serial rate-limit queue** (~350ms spacing, ~3 req/s) — do not add ad-hoc `fetch`es to `api.jikan.moe`; go through this client. Debounce search-as-you-type with `useDebounce` (`src/hooks/use-debounce.ts`).
- `/api/anime/search` (`src/app/api/anime/search/route.ts`) is a Zod-validated, edge-cached proxy over `searchAnime` (a public path).
- `src/lib/episodes.ts` `ensureEpisodes()` lazily backfills the `episodes` catalog from Jikan the first time an anime's detail page is opened (no-op afterward).

**Caching — `revalidate` is honoured by us, not by Next.** Both of Next's layers are inert here: `fetch`'s `next.revalidate` only applies before a request-time API and every page reads `cookies()` first, and `unstable_cache` bails under `force-dynamic`. Measured: three identical requests → three live fetches, which is what made the home page take ~48s. So `jikanFetch` stacks three tiers itself:

1. **process-local TTL cache** (LRU + in-flight de-dupe + 60s negative caching) — zero I/O, dies with the instance;
2. **shared `http_cache` table** (`src/lib/http-cache.ts`, migration `0026`) — one ~50ms round trip, survives cold starts, shared across instances;
3. **Jikan** — the 350ms serial queue.

The shared tier is **service-role only**: `http_cache` has RLS on with *no policies and no grants*, so `anon`/`authenticated` can't touch it — a cache any signed-in user could write is a poisoning vector. It needs `SUPABASE_SERVICE_ROLE_KEY`; without it (or without `0026`) it disables itself and the app runs on tier 1 alone. Every tier **fails soft** — a cache problem must never break a page. Never put user data in `http_cache`.

### Writes — server actions + optimistic UI
Mutations are `"use server"` actions, not API routes. Core: `src/lib/library.ts` (`addToLibrary` upsert) wrapped by `src/app/actions/library.ts` (`addToLibraryAction`, `addToLibraryByMalId`, `getUserLibrary`); `src/app/anime/[id]/actions.ts` (`updateProgress`); `src/app/actions/progress.ts` (`toggleEpisode`, `upsertProgress` — Zod-validated patch); `src/app/actions/notifications.ts` (`toggleNotify`); `src/app/actions/recommendations.ts` (`generateRecommendations`, `dismissRecommendation`). Client components call these and update optimistically (the search "+ Add" button, the episode checklist via `useOptimistic` in `src/components/anime/EpisodeList.tsx`), then the action `revalidatePath`s the affected routes.
- `addToLibraryAction` kicks off franchise grouping after the response via `after()` (`next/server`), best-effort — it calls `resolveAndAssignFranchise` (`src/lib/franchise.ts`), which invokes the `resolve-franchise` Edge Function and stamps a shared `franchise_id` onto siblings. A failure never breaks the add.
- `generateRecommendations` calls **Gemini** (`@google/generative-ai`, `gemini-2.0-flash`, requires `GEMINI_API_KEY`), resolves each pick to a real `mal_id`/poster via Jikan, and denormalizes title/poster/score onto the row so the page needs no re-fetch.

### Supabase Edge Functions (Deno runtime)
`supabase/functions/*` run on **Deno**, not Node — they use `npm:`/URL imports and `Deno.*` globals, and are **excluded from the Next typecheck/lint** (`tsconfig.json` exclude + `eslint.config.mjs` ignore). Two exist: `resolve-franchise` (BFS over Jikan relations → the franchise's member ids; called from `resolveAndAssignFranchise`) and `send-airing-notifications` (daily digest via Resend; triggered by pg_cron + pg_net per migration `0009`, guarded by a service-role bearer check). Deploy them separately with `supabase functions deploy`; secrets (`RESEND_API_KEY`, etc.) live in Supabase, not Vercel.

### Client data layer, offline & PWA (exceptions to RSC-by-default)
- **`/library`'s grid is client-side TanStack Query**, not an RSC fetch: `src/app/(app)/library/library-grid-client.tsx` runs `useQuery(["user-library"], getUserLibrary)`. The `QueryClient` (`src/app/providers.tsx`, wrapped around the whole app in the root layout) **persists the cache to IndexedDB** (`@tanstack/query-async-storage-persister` + `idb-keyval`) so the library survives offline. Pull-to-refresh invalidates `["user-library"]`.
- **PWA**: `src/app/manifest.ts` + a hand-written `public/sw.js` (vanilla Cache API), registered **production-only** by `ServiceWorkerRegister` (so it never fights Turbopack HMR in dev). `useOnlineStatus` drives the `<OfflineBanner/>` and disables offline-only actions.
- **Analytics**: `src/lib/analytics.ts` exports a **typed `track(event, props)`** over `@vercel/analytics`; `<Analytics/>` + `<SpeedInsights/>` are in the root layout. Animations (swipe-to-mark, dismiss) use `framer-motion`.

## Styling (Tailwind v4 — important differences)

- **There is no `tailwind.config.js`.** All config lives in `src/app/globals.css`; PostCSS wiring is in `postcss.config.mjs` (`@tailwindcss/postcss`).
- `globals.css` imports Tailwind + `tw-animate-css` + `shadcn/tailwind.css`, defines **OKLCH** design tokens under `:root` (light) / `.dark` (dark), and maps them to utilities via `@theme inline { … }`. New semantic tokens must be registered there to become utilities. Dark mode is class-based (`@custom-variant dark (&:is(.dark *))`).
- Prefer semantic utilities (`bg-background`, `text-muted-foreground`, `bg-primary`, …) over raw color scales so theming stays consistent — the palette is currently neutral/grayscale.

## UI primitives (base-ui, not Radix)

`src/components/ui/*` are the **base-ui** flavor of shadcn (`components.json` style `base-nova`, neutral). Import parts from `@base-ui/react/<component>` (e.g. `Tabs.Root/List/Tab/Panel`, `Menu`, `Dialog`, `Avatar`) and style component **state with `data-[…]` / `aria-selected:` variants**, not Radix's `data-state`. `cn()` is in `src/lib/utils.ts`. Posters now use **`next/image`** (`fill` inside the `aspect-[2/3]` containers, with `sizes`; `priority` only on the above-the-fold detail hero) — `next.config.ts` sets `formats: avif/webp` and **`remotePatterns: [{ hostname: "**" }]`** (any https host, since poster hosts vary). The lone exception is the `send-airing-notifications` email template, which uses `<img>` (HTML email, not React).

## Environment & deploy

- Local: `.env.local` holds `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the publishable anon key; RLS protects data). These are `NEXT_PUBLIC_*`, so they are **baked at build time**.
- Production (Vercel): the same vars are set in the Vercel project; deploy with `vercel --prod`. Changing them requires a redeploy. After deploying schema-dependent code, the matching migration must be run in Supabase or DB calls fail at runtime.
- Other secrets: `GEMINI_API_KEY` is a **server-only** Vercel var (recommendations); `SUPABASE_SERVICE_ROLE_KEY` is server-only too and **bypasses RLS** — it backs both `src/lib/supabase/admin.ts` (the `/admin` dashboard) and the shared cache (`src/lib/http-cache.ts`), so never import either from a Client Component and never prefix it `NEXT_PUBLIC_`. Resend keys (`RESEND_API_KEY`, `RESEND_FROM`) live in **Supabase Edge secrets**, not Vercel. The service worker and offline behavior only activate in a **production build** (the registrar is prod-gated). Full steps: `DEPLOY.md`.
