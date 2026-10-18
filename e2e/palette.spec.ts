import { expect, test } from "@playwright/test";

import { ACCOUNT, SKIP_NO_ACCOUNT } from "./env";

test.skip(!ACCOUNT, SKIP_NO_ACCOUNT);

/**
 * Flow: the ⌘K palette returns results.
 *
 * "naruto" matches no page label, so any option at all means title search
 * came back (library hits first, then catalog / live results).
 */
test("Ctrl/⌘+K opens the palette and a title search returns results", async ({ page }) => {
  await page.goto("/library");

  const palette = page.getByRole("dialog", { name: "Command palette" });
  // The shortcut is bound after hydration; a press that lands before it does
  // nothing, so retry until one opens the palette.
  await expect(async () => {
    if (!(await palette.isVisible())) await page.keyboard.press("ControlOrMeta+k");
    await expect(palette).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });

  const input = palette.getByRole("combobox", { name: "Command palette search" });
  await expect(input).toBeFocused();
  await input.fill("naruto");

  await expect(palette.getByRole("option", { name: /naruto/i }).first()).toBeVisible({
    timeout: 30_000,
  });

  await input.press("Escape");
  await expect(palette).toBeHidden();
});
