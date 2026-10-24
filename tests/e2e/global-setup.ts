import { chromium, type FullConfig } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

export const AUTH_DIR = path.join(__dirname, ".auth");
export const USERS = ["admin@demo.local", "manager@demo.local", "engineer@demo.local", "viewer@demo.local"];

/** Signs each demo user in once through the real login form and stores the session cookies. */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  const password = process.env.DEMO_PASSWORD ?? process.env.E2E_PASSWORD;
  if (!password) throw new Error("Set DEMO_PASSWORD to run e2e tests");
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const browser = await chromium.launch();
  for (const email of USERS) {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
    await context.storageState({ path: path.join(AUTH_DIR, `${email}.json`) });
    await context.close();
  }
  await browser.close();
}
