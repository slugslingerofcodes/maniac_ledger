import { expect, test } from "@playwright/test";

import { ACCOUNT, SKIP_NO_ACCOUNT } from "./env";

test.skip(!ACCOUNT, SKIP_NO_ACCOUNT);

/**
 * Flow: the home page renders its rows.
 *
 * Every row streams in behind its own Suspense boundary from MAL → AniList →
 * the catalog, so "renders" means rows that actually filled with titles, not
 * skeletons. The genre ribbon is static and links to /search, so requiring
 * links to /anime/ keeps it from counting.
 */
test("home renders the banner and rows of titles", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Something went wrong" })).toHaveCount(0);

  // The carousel, or its fallback frame when every upstream is down.
  await expect(
    page
      .getByRole("region", { name: "Featured anime" })
      .or(page.getByRole("heading", { name: "Track everything you watch." })),
  ).toBeVisible();

  const filledRows = page
    .locator("[data-row-track]")
    .filter({ has: page.locator('[data-row-item] a[href^="/anime/"]') });
  await expect
    .poll(() => filledRows.count(), {
      message: "at least three home rows should fill with titles",
      timeout: 60_000,
    })
    .toBeGreaterThanOrEqual(3);
});
