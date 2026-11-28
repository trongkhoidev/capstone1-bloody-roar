// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildTestgenContext, readArchiveFile } from "../lib/source-archive";
import { schema } from "../graphql/schema";
import { client } from "./helpers/users";

const { completeAI } = vi.hoisted(() => ({ completeAI: vi.fn() }));
vi.mock("../ai/model-router", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("../ai/model-router")),
  completeAI,
}));

let dir: string, archive: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "br-testgen-context-"));
  const work = path.join(dir, "work");
  await mkdir(path.join(work, "src"), { recursive: true });
  await writeFile(path.join(work, "src/cart.ts"), "export const total = (a: number, b: number) => a + b;\n");
  await writeFile(path.join(work, "package.json"), '{"name":"cart","devDependencies":{"vitest":"1"}}');
  archive = path.join(dir, "source.tar.gz");
  execFileSync("python3", ["-c", "import sys,tarfile; t=tarfile.open(sys.argv[1],'w:gz'); t.add(sys.argv[2],arcname='.'); t.close()", archive, work]);
  vi.stubEnv("SNAPSHOT_DIR", dir);
});
afterAll(async () => { await rm(dir, { recursive: true, force: true }); vi.unstubAllEnvs(); });

describe("buildTestgenContext (US-45)", () => {
  const base = "src/cart.ts\nsrc/other.ts\n\n--- src/other.ts ---\nexport const other = 1;";

  it("puts focus files first, then the manifest, then the stored context", () => {
    const context = buildTestgenContext({ focus: [{ path: "src/cart.ts", content: "cart code" }], manifest: { path: "package.json", content: "{}" }, base });
    expect(context.startsWith("--- src/cart.ts ---\ncart code")).toBe(true);
    expect(context.indexOf("--- package.json ---")).toBeGreaterThan(context.indexOf("cart code"));
    expect(context.indexOf("export const other")).toBeGreaterThan(context.indexOf("--- package.json ---"));
  });

  it("drops a selected file that holds a secret or is binary", () => {
    const context = buildTestgenContext({ focus: [{ path: ".env", content: "PRIVATE_KEY=chosen-secret" }, { path: "config.ts", content: 'export const API_KEY = "chosen-secret";' }, { path: "img.bin", content: "a\0b" }], base });
    expect(context).not.toContain("chosen-secret");
    expect(context).not.toContain("img.bin ---");
  });

  it("cuts a large selected file to exactly 20 KiB and keeps the total under 80,000 characters", () => {
    const big = "x".repeat(50_000);
    const context = buildTestgenContext({ focus: ["a.ts", "b.ts", "c.ts"].map((file) => ({ path: file, content: big })), manifest: { path: "package.json", content: big }, base: "y".repeat(80_000) });
    const first = context.split("--- a.ts ---\n")[1]!.split("\n\n--- ")[0]!;
    expect(first).toHaveLength(20 * 1024);
    expect(context.length).toBeLessThanOrEqual(80_000);
  });
});

describe("readArchiveFile (US-45)", () => {
  it("reads one member of a real snapshot archive", async () => {
    expect(await readArchiveFile(archive, "src/cart.ts")).toBe("export const total = (a: number, b: number) => a + b;\n");
  });
});

it("generateTestCases sends selected files first when focusFiles is given (US-45)", async () => {
  completeAI.mockRejectedValueOnce(new Error("stop after inspecting prompt"));
  const db = {
    issue: { findUnique: async () => ({ id: "issue-1", clientId: client.id, status: "OPEN", title: "Cart", description: "Cart totals", requiredSkills: [] }) },
    sourceSnapshot: { findUnique: async () => ({ status: "READY", framework: "VITEST", storagePath: archive, context: "src/cart.ts\npackage.json", fileTree: [{ path: "src/cart.ts", size: 55 }, { path: "package.json", size: 48 }] }) },
  };
  const field = schema.getMutationType()!.getFields().generateTestCases!;
  await expect(field.resolve!({} as never, { issueId: "issue-1", focusFiles: ["src/cart.ts"] }, { db, user: client } as never, {} as never)).rejects.toThrow();
  const context = JSON.parse(completeAI.mock.calls[0]![0].messages[1].content as string).context as string;
  expect(context.startsWith("--- src/cart.ts ---\nexport const total")).toBe(true);
  expect(context).toContain('--- package.json ---\n{"name":"cart"');
});
