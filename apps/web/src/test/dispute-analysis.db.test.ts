// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@bloody-roar/database";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { execute, loadSchema } from "./graphql-execute";
const mock = vi.hoisted(() => ({ completeAI: vi.fn() }));
vi.mock("../ai/model-router", () => ({ completeAI: mock.completeAI }));
const hex = (n: number) => `0x${randomBytes(n).toString("hex")}`;
const query = `mutation($issue: String!) { analyzeDispute(issueId: $issue) { id status suggestedClientBps } }`;
const report = JSON.stringify({ summary: "The supplied evidence was reviewed for this dispute.", suggestedClientBps: 4000, confidenceScore: 0.5, findings: [], missingEvidence: [], reasoning: "The evidence is incomplete and a human must make the final decision." });

describe.skipIf(!process.env.TEST_DATABASE_URL)("dispute AI locking on test database", () => {
  let admin: Awaited<ReturnType<typeof prisma.user.create>>, client: typeof admin, tokenId = "", issueId = "", disputeId = "";
  beforeAll(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL); await loadSchema();
    admin = await prisma.user.create({ data: { walletAddress: hex(20), role: "ADMIN" } });
    client = await prisma.user.create({ data: { walletAddress: hex(20), role: "CLIENT" } });
    tokenId = (await prisma.token.create({ data: { name: "AI test", symbol: "AIT", address: hex(20), decimals: 6, chainId: 31337 } })).id;
    issueId = (await prisma.issue.create({ data: { title: "AI dispute", description: "Test advisory analysis", category: "BUG_FIX", status: "DISPUTED", bountyAmount: "100", tokenId, clientId: client.id, requiredSkills: [] } })).id;
    disputeId = (await prisma.dispute.create({ data: { issueId, raisedById: client.id, reason: "Evidence is disputed", aiStatus: "ANALYZING", aiStartedAt: new Date(Date.now() - 6 * 60_000) } })).id;
  }, 60_000);
  afterAll(async () => {
    await prisma.aILog.deleteMany({ where: { disputeId } });
    await prisma.dispute.deleteMany({ where: { id: disputeId } });
    await prisma.issue.deleteMany({ where: { id: issueId } });
    await prisma.token.deleteMany({ where: { id: tokenId } });
    await prisma.user.deleteMany({ where: { id: { in: [admin?.id, client?.id].filter(Boolean) } } });
    await prisma.$disconnect();
  }, 60_000);
  const run = (user: typeof admin) => execute(query, { user, db: prisma }, { issue: issueId });
  it("reclaims a stale analysis, records bps once, and keeps chain status", async () => {
    mock.completeAI.mockResolvedValue({ text: report, model: "mock", provider: "mock", status: "SUCCESS" });
    expect((await run(client)).errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    const result = await run(admin);
    expect(result.errors).toBeUndefined();
    expect(result.data?.analyzeDispute).toMatchObject({ status: "OPEN", suggestedClientBps: 4000 });
    expect(await prisma.aILog.count({ where: { disputeId } })).toBe(1);
    await prisma.dispute.update({ where: { id: disputeId }, data: { aiStatus: "ANALYZING", aiStartedAt: new Date() } });
    expect((await run(admin)).errors?.[0]?.extensions?.code).toBe("DISPUTE_ALREADY_CHANGING");
    expect(await prisma.aILog.count({ where: { disputeId } })).toBe(1);
  }, 60_000);
  it("does not let an expired run overwrite a newer result", async () => {
    await prisma.dispute.update({ where: { id: disputeId }, data: { aiStatus: "FAILED", aiStartedAt: null } });
    let release!: (value: unknown) => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    mock.completeAI.mockImplementationOnce(() => { started(); return new Promise((resolve) => { release = resolve; }); });
    mock.completeAI.mockResolvedValueOnce({ text: report, model: "mock", provider: "mock", status: "SUCCESS" });
    const old = run(admin); await entered;
    await prisma.dispute.update({ where: { id: disputeId }, data: { aiStartedAt: new Date(Date.now() - 6 * 60_000) } });
    expect((await run(admin)).errors).toBeUndefined();
    release({ text: report, model: "mock", provider: "mock", status: "SUCCESS" });
    expect((await old).errors?.[0]?.extensions?.code).toBe("DISPUTE_STATE_CHANGED");
    expect((await prisma.dispute.findUniqueOrThrow({ where: { id: disputeId } })).aiStatus).toBe("COMPLETED");
    expect(await prisma.aILog.count({ where: { disputeId } })).toBe(3);
  }, 60_000);
});
