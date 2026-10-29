import { assertTestDatabase } from "@bloody-roar/database/test-guard";
// apps/web/src/test/integration/global-setup.ts
// Resets the test database before the run. Refuses any database whose name lacks "test".

import { execFileSync } from "node:child_process";
import path from "node:path";

export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  assertTestDatabase(url);
  process.stdout.write(`Test database: ${new URL(url).pathname.slice(1)}\n`);

  // DIRECT_URL is read from .env too, so point both at the throwaway database.
  execFileSync("bunx", ["prisma", "migrate", "reset", "--force", "--skip-seed", "--skip-generate"], {
    cwd: path.resolve(process.cwd(), "../../packages/database"),
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    stdio: "inherit",
  });
}
