// apps/web/src/test/integration/global-setup.ts
// Resets the test database before the run. Refuses any database whose name lacks "test".

import { execFileSync } from "node:child_process";
import path from "node:path";

export default function setup() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL to a throwaway database whose name contains "test"');

  const name = new URL(url).pathname.slice(1);
  if (!name.includes("test")) {
    throw new Error(`Refusing to reset database "${name}": its name must contain "test"`);
  }

  // DIRECT_URL is read from .env too, so point both at the throwaway database.
  execFileSync("bunx", ["prisma", "migrate", "reset", "--force", "--skip-seed", "--skip-generate"], {
    cwd: path.resolve(process.cwd(), "../../packages/database"),
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    stdio: "inherit",
  });
}
