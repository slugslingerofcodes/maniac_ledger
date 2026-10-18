import { expect, test, type Page } from "@playwright/test";

import { ACCOUNT, EPISODE_ANIME, SKIP_NO_ACCOUNT, SKIP_NO_CLEANUP, SUPABASE } from "./env";
import { pointsPaintedOver } from "./layout";
import { TestAccountDb } from "./test-account-db";

test.skip(!ACCOUNT, SKIP_NO_ACCOUNT);

const { malId, title } = EPISODE_ANIME;

/** Opens the title by MAL id; the app resolves it to its catalog page. */
async function openDetail(page: Page) {
  await page.goto(`/anime/mal/${malId}`);
  await expect(page).toHaveURL(/\/anime\/[0-9a-f-]{36}$/);
}

/**
 * Flow: the poster lightbox opens *above* the page.
 *
 * The regression this guards: rendered inside the detail hero — its own
 * stacking context — the "full-screen" overlay ranked only within the hero,
 * so the sticky header and the sections below painted over it. A visible,
 * viewport-sized dialog isn't enough to catch that; the probe asks what is
 * actually on top at points across the screen.
 */
test("the poster lightbox opens above the page", async ({ page }) => {
  await openDetail(page);
  await page.getByRole("button", { name: `View full poster for ${title}` }).click();

  const lightbox = page.getByRole("dialog", { name: `Poster for ${title}` });
  await expect(lightbox).toBeVisible();

  // The viewport less any scrollbar: what `position: fixed; inset: 0` fills.
  const viewport = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  }));
  const box = (await lightbox.boundingBox())!;
  expect(box, "the overlay should cover the viewport").toMatchObject({ x: 0, y: 0, ...viewport });
  expect(await pointsPaintedOver(lightbox), "nothing should paint over the lightbox").toEqual([]);

  await page.keyboard.press("Escape");
  await expect(lightbox).toBeHidden();
});

/**
 * Flow: tick an episode on a detail page, then untick it.
 *
 * Each direction is checked twice: the row in `episode_progress` (the UI flip
 * is optimistic, so it proves nothing alone) and the checkbox after a reload,
 * which is the page rendering what was saved.
 */
test.describe("episodes", () => {
  test.skip(!SUPABASE, SKIP_NO_CLEANUP);

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

  test("tick an episode, then untick it", async ({ page }) => {
    await openDetail(page);

    // `li#ep-<number>` is the list's own anchor (deep links scroll to it).
    const episodeOne = page.locator("li#ep-1").getByRole("checkbox");
    await expect(
      episodeOne,
      "episode 1 should be listed (the list backfills from Jikan on a title's first view)",
    ).toBeVisible({ timeout: 30_000 });
    await expect(episodeOne).not.toBeChecked();

    // Ticking episode 1 marks "everything up to 1": just the one row.
    await episodeOne.check();
    await expect.poll(() => db.watchedEpisodes(malId), { message: "episode row written" }).toBe(1);
    await page.reload();
    await expect(episodeOne).toBeChecked();

    await episodeOne.uncheck();
    await expect(page.getByText("Episode unmarked")).toBeVisible();
    await expect.poll(() => db.watchedEpisodes(malId), { message: "episode row deleted" }).toBe(0);
    await page.reload();
    await expect(episodeOne).not.toBeChecked();
  });
});
