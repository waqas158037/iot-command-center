/**
 * Applies migrations to the integration-test database. Refuses to touch any database whose
 * name does not contain "test", so a misconfigured URL can never wipe development or production data.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { testDatabaseUrl } from "../tests/integration/db-url";

const url = testDatabaseUrl();
execFileSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
