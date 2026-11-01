// apps/web/vitest.integration.config.ts
// Runs against a real Postgres. global-setup resets DATABASE_URL first, so it must be a throwaway database.

import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/test/integration/**/*.test.ts"],
    globalSetup: ["./src/test/integration/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@bloody-roar/shared": resolve(__dirname, "../../packages/shared/src"),
      "@bloody-roar/database": resolve(__dirname, "../../packages/database/src"),
    },
  },
});
