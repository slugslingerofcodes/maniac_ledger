import { defineConfig, devices } from "@playwright/test";

import { ANON_STATE, BASE_URL, STARTS_DEV_SERVER, USER_STATE } from "./e2e/env";

/**
 * Browser end-to-end tests: the signed-in flows someone used to click
 * through after every deploy. Specs live in e2e/, apart from the Vitest suite
 * in tests/. DEPLOY.md (step 7) covers the test account, the secrets and the
 * CI job; e2e/env.ts lists every variable the suite reads.
 *
 *   npm run e2e                                    # against `npm run dev` (started if not running)
 *   E2E_BASE_URL=https://<preview> npm run e2e     # against a deployment
 */
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  // Files run in parallel; the tests inside one file run in order. The two
  // files that write use different titles, so they never share rows.
  fullyParallel: false,
  workers: CI ? 2 : undefined,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  // Pages stream upstream data (MAL / AniList) and the dev server compiles
  // each route on its first hit, so the defaults are too tight.
  timeout: STARTS_DEV_SERVER ? 120_000 : 60_000,
  expect: { timeout: 15_000 },
  reporter: CI ? [["github"], ["list"]] : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,
    // The production service worker serves cached pages; a test should see
    // what the server renders now.
    serviceWorkers: "block",
    // Skips the entrance animations and the page-transition doors, which
    // otherwise sit between a click and the state the test is waiting for.
    reducedMotion: "reduce",
    // Traces record cookies and typed values — the test account's session
    // and password. Fine on your machine; never in a public repo's CI artifacts.
    trace: CI ? "off" : "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "anon-setup",
      testMatch: /setup[\\/]anon\.setup\.ts/,
    },
    {
      name: "auth-setup",
      testMatch: /setup[\\/]auth\.setup\.ts/,
      dependencies: ["anon-setup"],
      // The one place the password is typed: never trace it, even locally.
      use: { storageState: ANON_STATE, trace: "off" },
    },
    {
      name: "public",
      testMatch: /public\.spec\.ts/,
      dependencies: ["anon-setup"],
      use: { ...devices["Desktop Chrome"], storageState: ANON_STATE },
    },
    {
      name: "signed-in",
      testMatch: /\.spec\.ts$/,
      testIgnore: /public\.spec\.ts/,
      dependencies: ["auth-setup"],
      use: { ...devices["Desktop Chrome"], storageState: USER_STATE },
    },
  ],

  // Local runs: reuse `npm run dev` if it's up, start it if not. Never
  // `next start` on :3000 — its service worker outlives it and serves stale
  // pages to the next dev server on that origin.
  webServer: STARTS_DEV_SERVER
    ? {
        command: "npm run dev",
        url: `${BASE_URL}/login`,
        reuseExistingServer: true,
        timeout: 180_000,
      }
    : undefined,
});
