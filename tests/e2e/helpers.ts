import { expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

export const PASSWORD = process.env.DEMO_PASSWORD ?? process.env.E2E_PASSWORD ?? "";
if (!PASSWORD) throw new Error("Set DEMO_PASSWORD (the password used when seeding demo users) to run e2e tests");

/**
 * Switches the page to a demo user using the session stored by global-setup (which signed in
 * through the real form). Reusing sessions keeps the suite under the login rate limit.
 */
export async function login(page: Page, email: string) {
  const state = JSON.parse(fs.readFileSync(path.join(__dirname, ".auth", `${email}.json`), "utf8"));
  await page.context().clearCookies();
  await page.context().addCookies(state.cookies);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
}

export const uid = () => Date.now().toString(36).slice(-5).toUpperCase();
