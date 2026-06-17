# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> The import above is intentional: this project runs **Next.js 16** (not 15), which has breaking changes vs. older docs. Read `node_modules/next/dist/docs/` before writing framework code.

## Commands

```bash
npm run dev      # dev server at http://localhost:3000 (Turbopack)
npm run build    # production build (Turbopack) — also runs full TypeScript typecheck
npm run start    # serve the production build
npm run lint     # ESLint (flat config, eslint-config-next)

npx shadcn@latest add <name>   # scaffold a shadcn/ui component into src/components/ui/
```

There is no separate typecheck script and no test runner configured; `npm run build` is the typecheck.

## Architecture

Next.js App Router project (TypeScript, RSC) styled with **Tailwind CSS v4** and **shadcn/ui**.

- **App Router** lives in `src/app/`. `layout.tsx` is the root layout: loads Geist / Geist Mono via `next/font/google` (exposed as `--font-geist-sans` / `--font-geist-mono`) and sets up the `flex flex-col min-h-full` body shell. Pages are Server Components by default — add `"use client"` only when a component needs browser APIs/hooks.
- **Import alias:** `@/*` → `./src/*` (see `tsconfig.json` and `components.json` aliases). Use `@/components/ui/...`, `@/lib/utils`, etc.
- **shadcn/ui** config is in `components.json`: style `base-nova`, `baseColor: neutral`, icon library `lucide`, CSS-variable theming. Generated components land in `src/components/ui/`; the `cn()` class-merge helper is in `src/lib/utils.ts`.

## Styling (Tailwind v4 — important differences)

- **There is no `tailwind.config.js`.** All config lives in `src/app/globals.css`. PostCSS wiring is in `postcss.config.mjs` (`@tailwindcss/postcss`).
- `globals.css` imports Tailwind + `tw-animate-css` + `shadcn/tailwind.css`, defines the design tokens, and maps them to Tailwind color/radius utilities via the `@theme inline { ... }` block. New semantic tokens must be registered there to become utilities (e.g. `bg-<token>`).
- Theme tokens are **OKLCH** CSS variables under `:root` (light) and `.dark` (dark). Dark mode is class-based via the `@custom-variant dark (&:is(.dark *))`. Prefer semantic utilities (`bg-background`, `text-foreground`, `text-muted-foreground`, `bg-primary`, etc.) over raw color scales so theming stays consistent.
