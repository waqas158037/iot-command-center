import { expect, test } from "@playwright/test";
import { login, uid } from "./helpers";

test.describe.configure({ mode: "serial" });

const code = `E2E-${uid()}`;
let projectUrl = "";
let deviceUrl = "";
let deviceId = "";
let secret = "";

test("a manager creates a project from a template", async ({ page }) => {
  await login(page, "manager@demo.local");
  await page.goto("/projects/new");
  await page.getByText("Real-Time Air Quality Monitoring", { exact: false }).first().click();
  await page.getByLabel("Project name").fill(`E2E air quality ${code}`);
  await page.getByLabel("Project code").fill(code);
  await page.getByLabel("Status", { exact: true }).selectOption("ACTIVE");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: `E2E air quality ${code}` })).toBeVisible();
  projectUrl = page.url();
});

test("the manager edits the project's settings", async ({ page }) => {
  await login(page, "manager@demo.local");
  await page.goto(`${projectUrl}/settings`);
  await page.getByLabel("Description").fill("Edited by the end-to-end test");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Project saved")).toBeVisible();
  await page.goto(projectUrl);
  await expect(page.getByText("Edited by the end-to-end test")).toBeVisible();
});

test("registering a device shows its secret exactly once", async ({ page }) => {
  await login(page, "manager@demo.local");
  await page.goto(`/devices/new?projectId=${projectUrl.split("/").pop()}`);
  await page.locator("#name").fill("E2E HTTP node");
  await page.locator("#protocol").selectOption("HTTP");
  await page.getByRole("button", { name: "Register device" }).click();
  const secretBox = page.getByTestId("device-secret");
  await expect(secretBox).toBeVisible();
  secret = (await secretBox.textContent())!.trim();
  expect(secret).toMatch(/^icc_dev_/);
  const identifier = (await page.locator("code").first().textContent())!.trim();
  await page.getByRole("link", { name: "Open device" }).click();
  await expect(page).toHaveURL(/\/devices\/[0-9a-f-]{36}$/);
  deviceUrl = page.url();
  deviceId = identifier;
  await expect(page.getByText("Unknown").first()).toBeVisible();
  // The secret never appears again: not in the page, not in the API.
  expect(await page.content()).not.toContain(secret);
  const api = await page.request.get(`/api/devices/${deviceUrl.split("/").pop()}`);
  expect(await api.text()).not.toContain(secret);
});

test("HTTP telemetry is stored, shown, and raises an alert", async ({ page, request }) => {
  const send = (messageId: string, pm25: number) =>
    request.post("/api/ingest/telemetry", { headers: { "X-Device-Id": deviceId, Authorization: `Bearer ${secret}` }, data: { messageId, readings: [{ sensorKey: "pm25", value: pm25 }, { sensorKey: "temperature", value: 72, unit: "°F" }] } });
  expect((await send(`${code}-1`, 210)).status()).toBe(200);
  expect((await send(`${code}-2`, 220)).status()).toBe(200);
  // The template's PM2.5 rule needs three consecutive readings above 55.4 µg/m³.
  expect((await send(`${code}-3`, 230)).status()).toBe(200);
  const dup = await send(`${code}-2`, 220);
  expect((await dup.json()).duplicates).toBeGreaterThan(0);
  expect((await request.post("/api/ingest/telemetry", { headers: { "X-Device-Id": deviceId, Authorization: "Bearer wrong" }, data: { readings: [{ sensorKey: "pm25", value: 1 }] } })).status()).toBe(401);

  await login(page, "manager@demo.local");
  await page.goto(deviceUrl);
  await expect(page.getByText("Online").first()).toBeVisible();
  await expect(page.getByText("22.2 °C").first()).toBeVisible(); // 72 °F converted
  await page.goto(`/alerts?projectId=${projectUrl.split("/").pop()}`);
  await expect(page.getByRole("link", { name: /PM2\.5/ }).first()).toBeVisible();
});

test("an engineer acknowledges and resolves the alert", async ({ page }) => {
  // Add the demo engineer to the new project first.
  await login(page, "manager@demo.local");
  await page.goto(`${projectUrl}?tab=members`);
  const userSelect = page.locator("#member-user");
  const value = await userSelect.locator("option", { hasText: "engineer@demo.local" }).getAttribute("value");
  await userSelect.selectOption(value!);
  await page.locator("#member-role").selectOption("ENGINEER");
  await page.getByRole("button", { name: "Add member" }).click();
  await expect(page.getByText("Member added")).toBeVisible();
  await page.context().clearCookies();

  await login(page, "engineer@demo.local");
  await page.goto(`/alerts?projectId=${projectUrl.split("/").pop()}`);
  await page.getByRole("link", { name: /PM2\.5/ }).first().click();
  await page.getByLabel("Notes").fill("Checked the sensor inlet");
  await page.getByRole("button", { name: "Acknowledge" }).click();
  await expect(page.getByText("Alert acknowledged")).toBeVisible();
  await expect(page.getByText("Checked the sensor inlet")).toBeVisible();
  await page.getByRole("button", { name: "Resolve" }).click();
  await expect(page.getByText("Resolved").first()).toBeVisible();
});

test("reports filter by project and export safe CSV", async ({ page }) => {
  await login(page, "manager@demo.local");
  await page.goto(`/reports/devices?projectId=${projectUrl.split("/").pop()}`);
  await expect(page.getByText("E2E HTTP node")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: /Devices CSV/ }).click();
  const file = await download;
  const text = await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("utf8"));
  expect(text).toContain("device_identifier");
  expect(text).toContain(deviceId);
});

test("simulated data is labelled and the simulator panel is available", async ({ page }) => {
  await login(page, "manager@demo.local");
  await page.goto("/projects?search=Smart%20Home%20Electricity");
  await page.getByRole("link", { name: /Smart Home Electricity/ }).first().click();
  await expect(page.getByText("SIMULATED").first()).toBeVisible();
  await page.getByRole("link", { name: "Simulation" }).click();
  await expect(page.getByText("Controlled simulator")).toBeVisible();
  await expect(page.getByRole("button", { name: /Generate/ })).toBeVisible();
});

test("the manager archives the project, which becomes read-only", async ({ page }) => {
  await login(page, "manager@demo.local");
  await page.goto(`${projectUrl}/settings`);
  await page.getByRole("button", { name: "Archive project" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText("Project archived")).toBeVisible();
  await page.goto(projectUrl);
  await expect(page.getByText(/was archived/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Register device" })).toHaveCount(0);
});
