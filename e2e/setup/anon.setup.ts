import { expect, test as setup } from "@playwright/test";

import { ANON_STATE, BASE_URL, VERCEL_BYPASS_SECRET } from "../env";

/**
 * Gets a signed-out browser through to the app and saves that state for the
 * public specs and the sign-in setup.
 *
 * Against a protected Vercel preview that means trading the bypass secret for
 * Vercel's bypass cookie, once, on a request to the deployment itself. The
 * cookie then rides along on every navigation — including requests that a
 * per-request header route would miss — and the secret is never sent to the
 * other hosts the page talks to (Supabase, poster CDNs), which a global
 * `extraHTTPHeaders` would do (and trip their CORS preflights besides).
 */
setup("reach the app signed out", async ({ page }) => {
  if (VERCEL_BYPASS_SECRET) {
    const res = await page.request.get("/login", {
      headers: {
        "x-vercel-protection-bypass": VERCEL_BYPASS_SECRET,
        "x-vercel-set-bypass-cookie": "true",
      },
    });
    expect(res.ok(), `bypass request answered ${res.status()}; is VERCEL_AUTOMATION_BYPASS_SECRET current?`).toBe(true);
  }

  await page.goto("/login");
  expect(
    new URL(page.url()).host,
    "Landed off the app — a protected Vercel preview redirects to vercel.com. Set VERCEL_AUTOMATION_BYPASS_SECRET (DEPLOY.md, step 7).",
  ).toBe(new URL(BASE_URL).host);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();

  await page.context().storageState({ path: ANON_STATE });
});
