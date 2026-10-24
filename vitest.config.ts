import { defineConfig } from "vitest/config";
import path from "node:path";
import "dotenv/config";
import { testDatabaseUrl } from "./tests/integration/db-url";

/** Only resolved when integration tests run; unit tests never need a database. */
function safeTestUrl() {
  try {
    return testDatabaseUrl();
  } catch (err) {
    return `invalid://${(err as Error).message}`;
  }
}

const alias = { "@": path.resolve(__dirname, "src") };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      { resolve: { alias }, test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" } },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          setupFiles: ["tests/integration/setup.ts"],
          env: { DATABASE_URL: safeTestUrl(), ENABLE_SIMULATOR: "true", LOG_LEVEL: "fatal", NODE_ENV: "test" },
          // One database, so files run one at a time.
          fileParallelism: false,
          // next-auth imports "next/server" without an extension; let Vite resolve it.
          server: { deps: { inline: ["next-auth"] } },
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
