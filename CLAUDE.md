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

npx shadcn@latest add <name>   # scaffold a shadcn/ui component into src/components/ui/
vercel --prod                  # deploy (project is linked to Vercel; env vars live in the Vercel project)
```

There is no separate typecheck script and **no test runner** — `npm run build` is the typecheck and the only automated gate. "Does it build?" is the bar for a change being correct.

## Next.js 16 specifics (these differ from older Next and from training data)

- **`src/proxy.ts`, not `middleware.ts`.** The middleware file/function was renamed `proxy`; it runs on the Node runtime and delegates to `updateSession` (`src/lib/supabase/middleware.ts`).
- **`cookies()`, `params`, and `searchParams` are async** — `await` them. Page/route props are typed `params: Promise<{ … }>`.
- Route handlers use native `Request`/`Response`.

## Architecture

App Router project (TypeScript, RSC by default — add `"use client"` only for browser APIs/hooks). Import alias `@/*` → `./src/*`. Stack: Supabase (`@supabase/ssr`), shadcn/ui on **base-ui** primitives, Tailwind v4, Zod, the Jikan (MyAnimeList) API.

### Auth & the security model
- Three Supabase clients, all typed `<Database>`: `src/lib/supabase/client.ts` (browser), `server.ts` (RSC/server actions; async cookies), `middleware.ts` (session refresh + the gate).
- **The auth gate lives in `updateSession` (`src/lib/supabase/middleware.ts`)**: unauthenticated requests redirect to `/login` unless the path is in its `publicPaths` array (`/login`, `/signup`, `/reset-password`, `/auth`, `/api/anime/search`). Server-side guards are `requireUser()`/`getUser()` (`src/lib/supabase/auth.ts`); client equivalents are `useUser()`/`useAuthGuard()` (`src/hooks/`).
- **RLS is the access boundary, not app code.** Queries against `user_progress`/`episode_progress` do **not** filter by user — Postgres RLS scopes rows to `auth.uid()`. A missing `eq("user_id", …)` is intentional. Catalog tables (`anime`, `episodes`) are readable by, and insertable by, any authenticated user ("catalog contributions").

### Routing layout — the `(app)` group
`/search` and `/library` live under `src/app/(app)/` and share `src/app/(app)/layout.tsx`, which renders the sticky `<AppNav/>` (avatar dropdown + mobile Sheet). Routes **outside** the group (`/`, `/anime/[id]`, the auth pages) still render the older `<SiteHeader/>`. This is a half-finished migration — both navs exist; prefer the `(app)` group + `AppNav` for new authenticated pages.

### Database — manual migrations + hand-maintained types
- SQL migrations live in `supabase/migrations/` (`0001`…`0005`). **There is no migration runner**; they are applied by pasting into the Supabase SQL editor. Schema work means writing a migration there *and* updating the types.
- `src/lib/database.types.ts` is **hand-maintained** to mirror the SQL (Row/Insert/Update per table, the `anime_watched_count` view, enums) and exports `Tables<T>`/`TablesInsert<T>`/`TablesUpdate<T>`/`Views<T>`/`Enums<T>`. `src/types/anime.ts` aliases these into domain names. **Edit both** `database.types.ts` and the migration when the schema changes, or queries silently lose type safety.
- Tables: `anime` + `episodes` (shared catalog) and `user_progress` + `episode_progress` (per-user). Per-episode watching feeds the `anime_watched_count` view (created `security_invoker = on` so RLS flows through it) and a trigger that maintains `user_progress.last_watched_at` for "Continue Watching".

### Jikan (MyAnimeList) integration
- `src/lib/jikan.ts` is the typed v4 client. **All calls route through a serial rate-limit queue** (~350ms spacing, ~3 req/s) — do not add ad-hoc `fetch`es to `api.jikan.moe`; go through this client. It also exports `debounce`.
- `/api/anime/search` (`src/app/api/anime/search/route.ts`) is a Zod-validated, edge-cached proxy over `searchAnime` (a public path).
- `src/lib/episodes.ts` `ensureEpisodes()` lazily backfills the `episodes` catalog from Jikan the first time an anime's detail page is opened (no-op afterward).

### Writes — server actions + optimistic UI
Mutations are `"use server"` actions, not API routes: `src/lib/library.ts` (`addToLibrary` core upsert), `src/app/actions/library.ts` (action wrapper + `revalidatePath`), `src/app/anime/[id]/actions.ts` (`updateProgress`), and `src/app/actions/progress.ts` (`toggleEpisode` — per-episode watched toggle; resolves the anime from the episode row to `revalidatePath`). Client components call these and update optimistically (the search "+ Add" button, the episode checklist via `useOptimistic` in `src/components/anime/EpisodeList.tsx`), then the action `revalidatePath`s the affected routes.

## Styling (Tailwind v4 — important differences)

- **There is no `tailwind.config.js`.** All config lives in `src/app/globals.css`; PostCSS wiring is in `postcss.config.mjs` (`@tailwindcss/postcss`).
- `globals.css` imports Tailwind + `tw-animate-css` + `shadcn/tailwind.css`, defines **OKLCH** design tokens under `:root` (light) / `.dark` (dark), and maps them to utilities via `@theme inline { … }`. New semantic tokens must be registered there to become utilities. Dark mode is class-based (`@custom-variant dark (&:is(.dark *))`).
- Prefer semantic utilities (`bg-background`, `text-muted-foreground`, `bg-primary`, …) over raw color scales so theming stays consistent — the palette is currently neutral/grayscale.

## UI primitives (base-ui, not Radix)

`src/components/ui/*` are the **base-ui** flavor of shadcn (`components.json` style `base-nova`, neutral). Import parts from `@base-ui/react/<component>` (e.g. `Tabs.Root/List/Tab/Panel`, `Menu`, `Dialog`, `Avatar`) and style component **state with `data-[…]` / `aria-selected:` variants**, not Radix's `data-state`. `cn()` is in `src/lib/utils.ts`. Posters frequently use plain `<img>` on purpose (hosts vary); `next/image` is configured only for `cdn.myanimelist.net` in `next.config.ts`.

## Environment & deploy

- Local: `.env.local` holds `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the publishable anon key; RLS protects data). These are `NEXT_PUBLIC_*`, so they are **baked at build time**.
- Production (Vercel): the same vars are set in the Vercel project; deploy with `vercel --prod`. Changing them requires a redeploy. After deploying schema-dependent code, the matching migration must be run in Supabase or DB calls fail at runtime.
