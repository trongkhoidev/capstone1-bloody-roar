import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { prisma } from "@bloody-roar/database";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { testBundleSha256 } from "@bloody-roar/shared/test-runner";
import * as sandbox from "../src/runner/sandbox";
import * as storage from "../src/storage";
import { testRunsJob } from "../src/jobs/test-runs";
import type { JobContext } from "../src/runtime/scheduler";

describe.skipIf(!process.env.TEST_DATABASE_URL)("lost worker", () => {
  const wallet = randomUUID();
  let tokenId = "";
  afterAll(async () => { await prisma.issue.deleteMany({ where: { tokenId } }); await prisma.user.deleteMany({ where: { walletAddress: wallet } }); if (tokenId) await prisma.token.delete({ where: { id: tokenId } }); await prisma.$disconnect(); });
  test("expires stale RUNNING tests and unblocks TEST_RUN_ACTIVE", async () => {
    const user = await prisma.user.create({ data: { walletAddress: wallet } });
    tokenId = (await prisma.token.create({ data: { name: "Runner", symbol: "RUN", address: wallet, chainId: 31337, decimals: 6 } })).id;
    const issue = await prisma.issue.create({ data: { title: "lost worker", description: "test", clientId: user.id, category: "BUG_FIX", bountyAmount: 1, tokenId } });
    const now = new Date();
    const stale = await prisma.testRun.create({ data: { issueId: issue.id, kind: "BASE_CHECK", bundleSha256: "test", status: "RUNNING", startedAt: new Date(now.getTime() - 21 * 60_000) } });
    const otherIssue = await prisma.issue.create({ data: { title: "fresh", description: "test", clientId: user.id, category: "BUG_FIX", bountyAmount: 1, tokenId } });
    const fresh = await prisma.testRun.create({ data: { issueId: otherIssue.id, kind: "BASE_CHECK", bundleSha256: "test", status: "RUNNING", startedAt: now } });
    await testRunsJob.run({ db: prisma, config: { testRunnerEnabled: true }, now: () => now } as JobContext);
    expect(await prisma.testRun.findUnique({ where: { id: stale.id } })).toMatchObject({ status: "ERROR", log: "worker lost", finishedAt: now });
    expect(await prisma.testRun.findUnique({ where: { id: fresh.id } })).toMatchObject({ status: "RUNNING" });
    await prisma.testRun.delete({ where: { id: fresh.id } });
    expect(await prisma.testRun.findFirst({ where: { issueId: issue.id, status: { in: ["QUEUED", "RUNNING"] } } })).toBeNull();
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("patch secret scan", () => {
  let tokenId = "", userId = "", issueId = "", submissionId = "", bundleSha256 = "", root = "";
  const warnings: unknown[] = [];
  let sandboxRun: ReturnType<typeof spyOn<typeof sandbox, "runInSandbox">>;
  let readPatch: ReturnType<typeof spyOn<typeof storage, "readAttachment">>;
  const now = new Date();
  const context = () => ({ db: prisma, config: { testRunnerEnabled: true }, now: () => now, log: { warn: (...args: unknown[]) => warnings.push(args), info() {}, error: (...args: unknown[]) => warnings.push(args) } } as unknown as JobContext);

  beforeEach(async () => {
    warnings.length = 0;
    sandboxRun = spyOn(sandbox, "runInSandbox");
    readPatch = spyOn(storage, "readAttachment");
    sandboxRun.mockResolvedValue({ status: "passed", results: [], log: "clean sandbox log" });
    root = await mkdtemp(path.join(tmpdir(), "br-secret-scan-"));
    const snapshotPath = path.join(root, "source.tar.gz"), snapshot = "pinned snapshot";
    await writeFile(snapshotPath, snapshot);
    userId = (await prisma.user.create({ data: { walletAddress: randomUUID() } })).id;
    tokenId = (await prisma.token.create({ data: { name: "Scan", symbol: "SCAN", address: randomUUID(), chainId: 31337, decimals: 6 } })).id;
    issueId = (await prisma.issue.create({ data: { title: "Patch scan", description: "test", clientId: userId, developerId: userId, category: "BUG_FIX", bountyAmount: 1, tokenId } })).id;
    await prisma.sourceSnapshot.create({ data: { issueId, status: "READY", framework: "VITEST", storagePath: snapshotPath, sha256: createHash("sha256").update(snapshot).digest("hex") } });
    const locked = await prisma.testCase.create({ data: { issueId, title: "locked", description: "test", given: "base", when: "patch", then: "pass", isApproved: true, testFilePath: "__bloodyroar__/locked.test.ts", testCode: "locked test" } });
    bundleSha256 = testBundleSha256([locked]);
    submissionId = (await prisma.submission.create({ data: { issueId, developerId: userId, status: "DRAFT" } })).id;
  });
  afterEach(async () => {
    sandboxRun.mockRestore();
    readPatch.mockRestore();
    if (issueId) await prisma.issue.delete({ where: { id: issueId } });
    if (tokenId) await prisma.token.delete({ where: { id: tokenId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await rm(root, { recursive: true, force: true });
  });
  afterAll(async () => { await prisma.$disconnect(); });

  async function queuePatch(content: string) {
    const bytes = Buffer.from(content), sha256 = createHash("sha256").update(bytes).digest("hex");
    const fileUrl = "/api/uploads?key=scan/delivery.patch";
    readPatch.mockResolvedValue(bytes);
    await prisma.attachment.create({ data: { issueId, uploaderId: userId, purpose: "DELIVERY", status: "ATTACHED", fileName: "delivery.patch", fileUrl, fileSize: bytes.length, fileMime: "text/plain", sha256 } });
    await prisma.submission.update({ where: { id: submissionId }, data: { manifest: { attachments: [{ key: fileUrl, sha256 }] } } });
    return prisma.testRun.create({ data: { issueId, submissionId, kind: "SUBMISSION", bundleSha256, patchSha256: sha256 } });
  }

  test.each([
    ["literal", "API_KEY=", ""],
    ["environment fallback", 'const API_KEY = process.env.API_KEY || "', '";'],
    ["another assignment on the same line", 'const API_KEY = process.env.API_KEY; const SECRET = "', '";'],
  ])("rejects a patch secret (%s) without sandbox execution or secret logs", async (_name, prefix, suffix) => {
    const secret = `sk-${"fake-secret-for-test".repeat(3)}`;
    const run = await queuePatch(`+${prefix}${secret}${suffix}\n`);
    await testRunsJob.run(context());
    const recorded = await prisma.testRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(recorded.status).toBe("ERROR");
    expect(recorded.log).toContain("PATCH_CONTAINS_SECRET");
    expect(JSON.stringify(recorded)).not.toContain(secret);
    expect(JSON.stringify(warnings)).toContain("PATCH_CONTAINS_SECRET");
    expect(JSON.stringify(warnings)).not.toContain(secret);
    expect(warnings).toContainEqual([{ runId: run.id, code: "PATCH_CONTAINS_SECRET", pattern: "source-privacy:credential-assignment" }, "patch rejected"]);
    expect(sandboxRun).not.toHaveBeenCalled();
  });

  test("ignores secrets in file headers, context and removed lines", async () => {
    const run = await queuePatch('diff --git a/API_KEY=filename.ts b/API_KEY=filename.ts\n--- a/API_KEY=filename.ts\n+++ b/API_KEY=filename.ts\n@@ -1,2 +1,2 @@\n const API_KEY = process.env.API_KEY;\n-const SECRET = "removed-secret";\n+export const enabled = true;\n');
    await testRunsJob.run(context());
    expect(sandboxRun).toHaveBeenCalledTimes(1);
    expect(await prisma.testRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({ status: "PASSED", log: "clean sandbox log" });
  });

  test.each(["const API_KEY = process.env.API_KEY;", "JWT_SECRET: z.string().min(32),", "OPENAI_API_KEY=", "API_KEY: process.env.API_KEY,"])("allows a clean configuration line: %s", async (line) => {
    const run = await queuePatch(`+${line}\n`);
    await testRunsJob.run(context());
    expect(sandboxRun).toHaveBeenCalledTimes(1);
    expect(await prisma.testRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({ status: "PASSED" });
  });

  test("a clean patch still runs and records its sandbox result", async () => {
    const run = await queuePatch("+export const sum = (a, b) => a + b;\n");
    await testRunsJob.run(context());
    expect(sandboxRun).toHaveBeenCalledTimes(1);
    expect(await prisma.testRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({ status: "PASSED", log: "clean sandbox log", finishedAt: now });
  });
});
