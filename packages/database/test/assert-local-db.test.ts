import { describe, expect, test } from "bun:test";
import { isAllowedDatabase } from "../scripts/assert-local-db";
import { mkdtemp, mkdir, copyFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

describe("local database guard", () => {
  test.each(["db:migrate", "db:push", "db:reset"])("%s checks the package .env before Prisma", async (name) => {
    const root = await mkdtemp(path.join(tmpdir(), "br-env-"));
    const dir = path.join(root, "packages/database");
    try {
      await mkdir(path.join(dir, "scripts"), { recursive: true });
      await copyFile(path.resolve(import.meta.dir, "../scripts/assert-local-db.ts"), path.join(dir, "scripts/assert-local-db.ts"));
      await writeFile(path.join(root, ".env"), "DATABASE_URL=postgresql://localhost/db\n");
      await writeFile(path.join(dir, ".env"), "DATABASE_URL=postgresql://db.supabase.com/db\n");
      await writeFile(path.join(dir, "prisma"), "#!/bin/sh\necho PRISMA_INVOKED\n", { mode: 0o755 });
      const { scripts } = await Bun.file(new URL("../package.json", import.meta.url)).json();
      await writeFile(path.join(dir, "package.json"), JSON.stringify({ scripts }));
      const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, ALLOW_REMOTE_DB: "0" };
      delete env.DATABASE_URL; delete env.DIRECT_URL;
      const result = Bun.spawnSync(["sh", "-c", scripts[name]], { cwd: dir, env });
      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).not.toContain("PRISMA_INVOKED");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  test("allows localhost and loopback", () => {
    expect(isAllowedDatabase("postgresql://localhost/db")).toBe(true);
    expect(isAllowedDatabase("postgresql://127.0.0.1/db")).toBe(true);
  });
  test("rejects remote and invalid URLs unless explicitly overridden", () => {
    expect(isAllowedDatabase("postgresql://db.supabase.com/db")).toBe(false);
    expect(isAllowedDatabase(undefined)).toBe(false);
    expect(isAllowedDatabase("postgresql://db.supabase.com/db", "1")).toBe(true);
  });
  test.each([
    ["postgresql://db.supabase.com/db", "postgresql://localhost/db", "DATABASE_URL"],
    ["postgresql://localhost/db", "postgresql://db.supabase.com/db", "DIRECT_URL"],
    ["postgresql://localhost/db", "invalid", "DIRECT_URL"],
    ["postgresql://localhost/db", "", "DIRECT_URL"],
  ])("db:migrate guards DATABASE_URL=%s and DIRECT_URL=%s before invoking Prisma", async (databaseUrl, directUrl, rejected) => {
    const dir = await mkdtemp(path.join(tmpdir(), "br-migrate-"));
    try {
      await writeFile(path.join(dir, "prisma"), "#!/bin/sh\necho PRISMA_INVOKED\n", { mode: 0o755 });
      const { scripts } = await Bun.file(new URL("../package.json", import.meta.url)).json();
      const result = Bun.spawnSync(["sh", "-c", scripts["db:migrate"]], {
        cwd: path.resolve(import.meta.dir, ".."),
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, DATABASE_URL: databaseUrl, DIRECT_URL: directUrl, ALLOW_REMOTE_DB: "0" },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain(`${rejected} must point to localhost`);
      expect(result.stdout.toString()).not.toContain("PRISMA_INVOKED");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
