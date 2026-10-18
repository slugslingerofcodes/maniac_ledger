import { expect, test } from "@playwright/test";

import { measureHorizontalOverflow } from "./layout";

/**
 * Signed-out behaviour: needs no account and writes nothing, so this file
 * runs everywhere — including a fresh clone with only `npm run dev`.
 */

test("protected pages send a signed-out visitor to sign in", async ({ page }) => {
  for (const path of ["/", "/library", "/search"]) {
    await page.goto(path);
    await expect(page, `${path} should redirect`).toHaveURL(/\/login(\?.*)?$/);
  }
  await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test("wrong credentials get the one generic message", async ({ page }) => {
  await page.goto("/login");
  // An address that can't exist, so this never counts against a real account.
  await page.getByLabel("Username", { exact: true }).fill(`e2e-nobody-${Date.now()}@example.invalid`);
  await page.getByLabel("Password", { exact: true }).fill("not-the-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page.getByRole("status")).toHaveText("Incorrect username or password.");
  await expect(page).toHaveURL(/\/login/);
});

test.describe("at 375px", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the sign-in page doesn't scroll sideways", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    const overflow = await measureHorizontalOverflow(page);
    expect(overflow.scrollWidth, JSON.stringify(overflow, null, 2)).toBeLessThanOrEqual(overflow.viewport);
  });
});
