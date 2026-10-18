import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test as setup } from "@playwright/test";

import { ACCOUNT, SKIP_NO_ACCOUNT, USER_STATE } from "../env";

/**
 * Flow: sign in with the dedicated test account, through the real form.
 *
 * Runs once per run; every signed-in spec starts from the session it saves.
 * One sign-in per run also keeps well inside the login form's per-IP rate
 * limit (12 per 5 minutes).
 */
setup("sign in with the test account", async ({ page }) => {
  if (!ACCOUNT) {
    // The signed-in project still loads this file as its storage state, so it
    // has to exist; its specs skip themselves on the same condition.
    mkdirSync(path.dirname(USER_STATE), { recursive: true });
    writeFileSync(USER_STATE, JSON.stringify({ cookies: [], origins: [] }));
    setup.skip(true, SKIP_NO_ACCOUNT);
    return;
  }

  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(ACCOUNT.identifier);
  await page.getByLabel("Password", { exact: true }).fill(ACCOUNT.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  // Success redirects to /choose; failure comes back to /login with one
  // generic message, which is worth surfacing as the failure itself.
  try {
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
  } catch {
    const message = await page.getByRole("status").textContent().catch(() => null);
    throw new Error(`Sign-in didn't leave /login${message ? `: "${message.trim()}"` : ""}`);
  }
  await expect(page).toHaveURL(/\/choose$/);
  await expect(page.getByRole("heading", { name: "What are you here for?" })).toBeVisible();

  await page.context().storageState({ path: USER_STATE });
});
