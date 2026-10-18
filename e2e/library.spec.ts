import { expect, test } from "@playwright/test";

import { ACCOUNT, LIBRARY_ANIME, SKIP_NO_ACCOUNT, SKIP_NO_CLEANUP, SUPABASE } from "./env";
import { TestAccountDb } from "./test-account-db";

test.skip(!ACCOUNT, SKIP_NO_ACCOUNT);
test.skip(!SUPABASE, SKIP_NO_CLEANUP);

/**
 * Flows: add an anime from search; library search shows the stats bar;
 * remove it again.
 *
 * One title, in order, so the add sets up the search and the remove undoes
 * the add. Serial: a failed step skips the rest rather than running them
 * against a library in an unknown state. The title is purged before (an
 * earlier run may have died half-way) and after (whatever happened here).
 */
test.describe.configure({ mode: "serial" });

const { malId, title } = LIBRARY_ANIME;
let db: TestAccountDb;

test.beforeAll(async () => {
  db = await TestAccountDb.open();
  await db.purge(malId);
});

test.afterAll(async () => {
  if (!db) return;
  try {
    await db.purge(malId);
  } finally {
    await db.close();
  }
});

test("add an anime from search", async ({ page }) => {
  await page.goto("/search");
  await page.getByLabel("Search anime", { exact: true }).fill(title);

  // The poster links by MAL id, whichever upstream served the results.
  const poster = page.locator(`a[href="/anime/mal/${malId}"]`);
  await expect(poster, `"${title}" (MAL ${malId}) should be among the results`).toBeVisible({
    timeout: 30_000,
  });
  const card = poster.locator("..");

  await card.getByRole("button", { name: "+ Add", exact: true }).click();
  await expect(card.getByRole("button", { name: "Added" })).toBeDisabled();

  // The flip is optimistic; the row is the proof.
  await expect.poll(() => db.inLibrary(malId), { message: "library row written" }).toBe(true);
  // …and the button didn't revert to report a failed action.
  await expect(card.getByRole("button", { name: "Added" })).toBeVisible();
});

test("library search shows the stats bar", async ({ page }) => {
  await page.goto("/library");
  await page.getByLabel("Search your library", { exact: true }).fill(title);

  const stats = page.getByRole("region", { name: "Stats for these results" });
  await expect(stats).toBeVisible();
  await expect(stats.getByText(/^1 of \d+ titles match\.$/)).toHaveCount(1);
  for (const label of ["Titles", "Episodes watched", "Mean score", "Time watched"]) {
    await expect(stats.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: `Remove ${title} from library` })).toBeVisible();
});

test("remove it from the library", async ({ page }) => {
  await page.goto("/library");
  await page.getByLabel("Search your library", { exact: true }).fill(title);

  const remove = page.getByRole("button", { name: `Remove ${title} from library` });
  // Hover-revealed on desktop; hovering the card's corner is what a person does.
  await remove.hover();
  await remove.click();

  await expect(page.getByText(`Removed “${title}”`)).toBeVisible();
  await expect(remove).toHaveCount(0);
  await expect.poll(() => db.inLibrary(malId), { message: "library row deleted" }).toBe(false);
});
