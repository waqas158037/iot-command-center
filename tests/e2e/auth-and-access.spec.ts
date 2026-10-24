import { expect, test } from "@playwright/test";
import { login, PASSWORD } from "./helpers";

test("unauthenticated users are sent to the login page", async ({ page }) => {
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/login/);
  const res = await page.request.get("/api/projects");
  expect(res.status()).toBe(401);
});

test("wrong passwords are rejected with a generic message", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@demo.local");
  await page.getByLabel("Password").fill(PASSWORD + "x");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText(/invalid email or password/i)).toBeVisible();
});

test("a viewer cannot open projects they are not a member of", async ({ page }) => {
  await login(page, "admin@demo.local");
  await page.goto("/projects?search=Forest");
  await page.getByRole("link", { name: /Forest Fire/ }).first().click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  const url = page.url();
  await page.context().clearCookies();

  await login(page, "viewer@demo.local");
  const res = await page.goto(url);
  expect(res?.status()).toBe(404);
  const id = url.split("/projects/")[1];
  expect((await page.request.get(`/api/projects/${id}`)).status()).toBe(404);
  // Administrative pages show an unauthorized state, and their APIs refuse.
  await page.goto("/audit-logs");
  await expect(page.getByText(/only super admins/i)).toBeVisible();
  expect((await page.request.get("/api/audit-logs")).status()).toBe(403);
});

test("a viewer sees read-only alerts without action buttons", async ({ page }) => {
  await login(page, "viewer@demo.local");
  await page.goto("/projects");
  await expect(page.getByRole("button", { name: /new project/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /new project/i })).toHaveCount(0);
});

test("signing out ends the session", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("engineer@demo.local");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.getByRole("button", { name: "Open user menu" }).click();
  await page.getByRole("menuitem", { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
