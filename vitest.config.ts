import { defineConfig } from "vitest/config";

/**
 * Unit-test config. Tests run on Node (no jsdom): the suite covers the data
 * layer — the upstream fallback chains, the Jikan cache/rate-limiter, and the
 * mappers — none of which touch the DOM.
 *
 * `resolve.tsconfigPaths` reuses the `@/*` → `./src/*` alias from tsconfig so
 * tests import modules exactly the way the app does.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    // Node by default; component tests opt into jsdom per file with a
    // `// @vitest-environment jsdom` docblock (environmentMatchGlobs is gone
    // in Vitest 4). The data-layer suites neither need nor want a DOM.
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Module-level caches in `jikan.ts` are per-process state; `restoreMocks`
    // plus per-file `vi.resetModules()` keeps files from leaking into each other.
    restoreMocks: true,
    /**
     * Well above Vitest's 5s default, because the default was producing
     * failures that had nothing to do with the code under test.
     *
     * Two suites here do real work per test: `cosmos-stage` mounts a WebGL
     * component under jsdom (measured at 5.4s and 6.2s on a loaded machine —
     * either side of the 5s line), and `jikan-throughput` drives 15 requests
     * through the rate limiter with fake timers. Both pass comfortably on an
     * idle machine and fail when something else is competing for CPU, which is
     * the normal condition on CI and on a laptop running a dev server.
     *
     * A timeout that trips under load isn't a safety net, it's a coin flip —
     * and a red gate that means "the machine was busy" trains people to re-run
     * until green, which is how a real failure gets waved through. These are
     * ceilings for hangs, not performance budgets; nothing here should come
     * close on a quiet machine.
     */
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/app/api/**/*.ts", "src/app/actions/**/*.ts"],
      exclude: ["src/lib/database.types.ts", "src/lib/supabase/**"],
    },
  },
});
