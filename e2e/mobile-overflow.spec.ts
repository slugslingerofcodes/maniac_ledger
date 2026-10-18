import { expect, test, type Page } from "@playwright/test";

import { ACCOUNT, EPISODE_ANIME, SKIP_NO_ACCOUNT } from "./env";
import { measureHorizontalOverflow } from "./layout";

test.skip(!ACCOUNT, SKIP_NO_ACCOUNT);

/**
 * Flow: no horizontal scroll at 375px (a small phone) on the three pages
 * people use most.
 *
 * Measured once the page's real content is in — the late-streaming rows and
 * the episode list are exactly what used to push the page wider.
 */
test.use({ viewport: { width: 375, height: 812 } });

async function expectNoSidewaysScroll(page: Page) {
  const overflow = await measureHorizontalOverflow(page);
  expect(overflow.scrollWidth, JSON.stringify(overflow, null, 2)).toBeLessThanOrEqual(overflow.viewport);
}

test("home", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-row-track] [data-row-item] a[href^="/anime/"]').first()).toBeVisible({
    timeout: 60_000,
  });
  await expectNoSidewaysScroll(page);
});

test("library", async ({ page }) => {
  await page.goto("/library");
  // The grid (or the empty state) renders under the search box once the library has loaded.
  await expect(page.getByLabel("Search your library", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expectNoSidewaysScroll(page);
});

test("anime page", async ({ page }) => {
  await page.goto(`/anime/mal/${EPISODE_ANIME.malId}`);
  await expect(page).toHaveURL(/\/anime\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: /^Episodes/ })).toBeVisible({ timeout: 30_000 });
  await expectNoSidewaysScroll(page);
});
