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
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/app/api/**/*.ts", "src/app/actions/**/*.ts"],
      exclude: ["src/lib/database.types.ts", "src/lib/supabase/**"],
    },
  },
});
