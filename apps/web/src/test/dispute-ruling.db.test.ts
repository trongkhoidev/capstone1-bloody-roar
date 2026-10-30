// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@bloody-roar/database";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { computeDecisionHash, encodeEscrowCall } from "@bloody-roar/shared/escrow";
import { execute, loadSchema } from "./graphql-execute";

const clock = vi.hoisted(() => ({ now: new Date("2030-01-01T00:00:00Z") }));
vi.mock("../lib/escrow/chain-time", () => ({ readChainTime: async () => clock.now }));
const hex = (n: number) => `0x${randomBytes(n).toString("hex")}`;
const mutation = `mutation($issue: ID!, $bps: Int!, $rationale: String!, $kind: RulingDraftKind!) { draftRuling(issueId: $issue, clientBps: $bps, rationale: $rationale, kind: $kind) { draftId decisionHash safeTransactionJson } }`;
describe.skipIf(!process.env.TEST_DATABASE_URL)("ruling drafts on test database", () => {
  let admin: Awaited<ReturnType<typeof prisma.user.create>>, client: typeof admin, developer: typeof admin;
  let issueId = "", tokenId = "", escrowHash = "", escrowKey = "", contract = "", arbiter = "";
  const rationale = "The evidence supports an equal split.";
  beforeAll(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    contract = hex(20); arbiter = hex(20); vi.stubEnv("CHAIN_ID", "31337"); vi.stubEnv("ESCROW_ADDRESS", contract); await loadSchema();
    admin = await prisma.user.create({ data: { walletAddress: hex(20), role: "ADMIN" } });
    client = await prisma.user.create({ data: { walletAddress: hex(20), role: "CLIENT" } });
    developer = await prisma.user.create({ data: { walletAddress: hex(20), role: "DEVELOPER" } });
    tokenId = (await prisma.token.create({ data: { name: "Ruling", symbol: "RUL", address: hex(20), decimals: 6, chainId: 31337 } })).id;
    issueId = (await prisma.issue.create({ data: { title: "Ruling", description: "Dispute ruling test", category: "BUG_FIX", status: "DISPUTED", clientId: client.id, developerId: developer.id, tokenId, bountyAmount: "100", requiredSkills: [] } })).id;
    escrowHash = hex(32); escrowKey = `ruling-${issueId}`;
    await prisma.escrowProjection.create({ data: { issueId, escrowKey, escrowIdHash: escrowHash, chainId: 31337, contractAddress: contract, client: client.walletAddress, developer: developer.walletAddress, arbiter, feeRecipient: hex(20), amountRaw: "100000000", depositedAt: clock.now, deliveryDeadline: clock.now, reviewDeadline: clock.now, termsHash: hex(32), phase: "DISPUTED", disputeRaisedBy: client.walletAddress, disputeRaisedAt: clock.now, lastProjectedBlock: 1n } });
  }, 60_000);
  afterAll(async () => {
    await prisma.transactionIntent.deleteMany({ where: { issueId } });
    await prisma.rulingRecord.deleteMany({ where: { escrowIdHash: escrowHash } });
    await prisma.adminLog.deleteMany({ where: { targetId: issueId } });
    await prisma.rulingDraft.deleteMany({ where: { issueId } });
    await prisma.escrowProjection.deleteMany({ where: { escrowIdHash: escrowHash } });
    if (issueId) await prisma.issue.deleteMany({ where: { id: issueId } });
    if (tokenId) await prisma.token.deleteMany({ where: { id: tokenId } });
    await prisma.user.deleteMany({ where: { id: { in: [admin?.id, client?.id, developer?.id].filter(Boolean) } } });
    await prisma.$disconnect();
  }, 60_000);
  const run = (user: typeof admin, kind = "INITIAL", bps = 5000, text = rationale) => execute(mutation, { user, db: prisma }, { issue: issueId, kind, bps, rationale: text });
  it("enforces admin, values and the initial window", async () => {
    expect((await run(client)).errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    expect((await run(admin, "INITIAL", -1)).errors).toBeDefined();
    expect((await run(admin, "INITIAL", 5000, "short")).errors).toBeDefined();
    expect((await run(admin)).errors).toBeDefined();
    clock.now = new Date(clock.now.getTime() + 72 * 3600_000);
    const result = await run(admin);
    expect(result.errors).toBeUndefined();
    const draft = result.data?.draftRuling as { draftId: string; decisionHash: string; safeTransactionJson: string };
    expect(draft.decisionHash).toBe(computeDecisionHash({ issueId, escrowId: escrowKey, clientBps: 5000, rationale }));
    const safe = JSON.parse(draft.safeTransactionJson);
    expect(safe.chainId).toBe("31337"); expect(safe.meta.createdFromSafeAddress).toBe(arbiter);
    expect(safe.transactions[0].to).toBe(contract);
    expect(safe.transactions[0].data).toBe(encodeEscrowCall("postInitialRuling", { escrowId: escrowKey, clientBps: "5000", decisionHash: draft.decisionHash }));
    expect((await run(admin)).data?.draftRuling).toMatchObject({ draftId: draft.draftId, decisionHash: draft.decisionHash });
    expect(await prisma.rulingDraft.count({ where: { issueId } })).toBe(1);
    expect(await prisma.adminLog.count({ where: { targetId: issueId, action: "draft_ruling" } })).toBeGreaterThan(0);
    expect((await prisma.escrowProjection.findUniqueOrThrow({ where: { escrowIdHash: escrowHash } })).phase).toBe("DISPUTED");
    clock.now = new Date("2030-01-31T00:00:00Z");
    expect((await run(admin)).errors).toBeDefined();
  }, 60_000);
  it("validates the final window and encodes the final ruling", async () => {
    const challengedAt = new Date("2030-02-01T00:00:00Z"); clock.now = challengedAt;
    await prisma.escrowProjection.update({ where: { escrowIdHash: escrowHash }, data: { phase: "CHALLENGED", challengedAt } });
    const result = await run(admin, "FINAL", 7000);
    expect(result.errors).toBeUndefined();
    const draft = result.data?.draftRuling as { decisionHash: string; safeTransactionJson: string };
    expect(JSON.parse(draft.safeTransactionJson).transactions[0].data).toBe(encodeEscrowCall("postFinalRuling", { escrowId: escrowKey, clientBps: "7000", decisionHash: draft.decisionHash }));
    clock.now = new Date(challengedAt.getTime() + 30 * 86400_000);
    expect((await run(admin, "FINAL", 7000)).errors).toBeDefined();
  }, 60_000);
  it("prepares challenge and permissionless finalization at chain boundaries", async () => {
    const postedAt = new Date("2030-03-01T00:00:00Z"); clock.now = postedAt;
    await prisma.escrowProjection.update({ where: { escrowIdHash: escrowHash }, data: { phase: "INITIAL_RULING" } });
    const ruling = await prisma.rulingRecord.create({ data: { escrowIdHash: escrowHash, kind: "INITIAL", clientBps: 5000, decisionHash: hex(32), arbiter, postedAt, noticeEndsAt: new Date(postedAt.getTime() + 7 * 86400_000), chainEventId: hex(32) } });
    const prepare = (method: string, user: typeof admin) => execute(`mutation($issue: ID!) { ${method}(issueId: $issue) { method data } }`, { user, db: prisma }, { issue: issueId });
    expect((await prepare("prepareChallengeRuling", admin)).errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    expect((await prepare("prepareChallengeRuling", client)).errors).toBeUndefined();
    expect((await prepare("prepareChallengeRuling", developer)).errors).toBeUndefined();
    await prisma.rulingRecord.update({ where: { id: ruling.id }, data: { clientBps: 10000 } });
    expect((await prepare("prepareChallengeRuling", client)).errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    await prisma.rulingRecord.update({ where: { id: ruling.id }, data: { clientBps: 0 } });
    expect((await prepare("prepareChallengeRuling", developer)).errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    expect((await prepare("prepareFinalizeRuling", admin)).errors).toBeDefined();
    clock.now = new Date(postedAt.getTime() + 7 * 86400_000);
    expect((await prepare("prepareChallengeRuling", client)).errors).toBeDefined();
    const final = await prepare("prepareFinalizeRuling", admin);
    expect(final.errors).toBeUndefined();
    expect((final.data?.prepareFinalizeRuling as { data: string }).data).toBe(encodeEscrowCall("finalizeRuling", { escrowId: escrowKey }));
    await prisma.escrowProjection.update({ where: { escrowIdHash: escrowHash }, data: { phase: "FINAL_RULING" } });
    await prisma.rulingRecord.create({ data: { escrowIdHash: escrowHash, kind: "FINAL", clientBps: 5000, decisionHash: hex(32), arbiter, postedAt, noticeEndsAt: new Date(postedAt.getTime() + 86400_000), chainEventId: hex(32) } });
    clock.now = new Date(postedAt.getTime() + 86400_000 - 1);
    expect((await prepare("prepareFinalizeRuling", admin)).errors).toBeDefined();
    clock.now = new Date(postedAt.getTime() + 86400_000);
    expect((await prepare("prepareFinalizeRuling", admin)).errors).toBeUndefined();
    for (const phase of ["DISPUTED", "CHALLENGED"] as const) {
      await prisma.escrowProjection.update({ where: { escrowIdHash: escrowHash }, data: { phase, disputeRaisedAt: postedAt, challengedAt: postedAt } });
      clock.now = new Date(postedAt.getTime() + 30 * 86400_000 - 1);
      expect((await prepare("prepareFinalizeArbiterTimeoutSplit", admin)).errors).toBeDefined();
      clock.now = new Date(postedAt.getTime() + 30 * 86400_000);
      expect((await prepare("prepareFinalizeArbiterTimeoutSplit", admin)).errors).toBeUndefined();
    }
  }, 60_000);

});
