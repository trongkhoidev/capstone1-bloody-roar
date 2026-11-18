import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { prisma } from "@bloody-roar/database";
import { randomUUID } from "node:crypto";
import { alertsJob } from "../src/alerts";
import { health, healthSnapshot } from "../src/runtime/health";
import type { JobContext } from "../src/runtime/scheduler";

describe.skipIf(!process.env.TEST_DATABASE_URL)("queued test run alerts", () => {
  let userId = "", tokenId = "";
  const issueIds: string[] = [];
  afterAll(async () => {
    await prisma.issue.deleteMany({ where: { id: { in: issueIds } } });
    if (tokenId) await prisma.token.delete({ where: { id: tokenId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  test("alerts once for a run older than 15 minutes across three polls and a restart", async () => {
    const now = new Date("2026-11-18T10:00:00Z");
    userId = (await prisma.user.create({ data: { walletAddress: randomUUID() } })).id;
    tokenId = (await prisma.token.create({ data: { name: "Alert", symbol: "ALERT", address: randomUUID(), chainId: 31337, decimals: 6 } })).id;
    const runs = [];
    for (const minutes of [16, 14, 15]) {
      const issue = await prisma.issue.create({ data: { title: "Queue alert", description: "test", clientId: userId, category: "BUG_FIX", bountyAmount: 1, tokenId } });
      issueIds.push(issue.id);
      runs.push(await prisma.testRun.create({ data: { issueId: issue.id, kind: "BASE_CHECK", bundleSha256: "test", createdAt: new Date(now.getTime() - minutes * 60_000) } }));
    }
    const warnings: unknown[] = [], posts: Array<{ alerts: string[] }> = [];
    const webhook = spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      posts.push(JSON.parse(String(init?.body)));
      return new Response("ok");
    });
    const previous = { ...health };
    try {
      Object.assign(health, { lastSafeBlock: null, lastScannedBlock: null, rpcErrorStreak: 0 });
      const ctx = { db: prisma, config: { alertWebhookUrl: "https://hooks.example/alerts" }, now: () => now, log: { warn: (...args: unknown[]) => warnings.push(args), error() {} } } as unknown as JobContext;
      await alertsJob.run(ctx);
      await alertsJob.run(ctx);
      await alertsJob.run(ctx);
      expect(posts).toHaveLength(1);
      expect(posts[0]?.alerts).toEqual([`QUEUED_RUN_OVERDUE ${runs[0]!.id}`]);
      expect(warnings).toHaveLength(1);
      expect(healthSnapshot(health, now.getTime()).queuedTestRuns).toBe(3);
      expect((await prisma.testRun.findMany({ where: { issueId: { in: issueIds } } })).every((run) => run.status === "QUEUED")).toBe(true);

      const restarted = await import(`../src/alerts.ts?restart=${randomUUID()}`);
      await restarted.alertsJob.run(ctx);
      expect(posts).toHaveLength(1);
      expect(warnings).toHaveLength(1);
    } finally {
      webhook.mockRestore();
      Object.assign(health, previous);
    }
  });
});
