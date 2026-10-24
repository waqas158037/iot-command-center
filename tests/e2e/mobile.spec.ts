import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("the dashboard and navigation work on a phone", async ({ page }) => {
  await login(page, "admin@demo.local");
  await expect(page.getByRole("heading", { name: "Operations overview" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Devices" }).click();
  await expect(page).toHaveURL(/\/devices/);
  await expect(page.getByRole("heading", { name: "Devices" })).toBeVisible();
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow2).toBeLessThanOrEqual(1);
});
