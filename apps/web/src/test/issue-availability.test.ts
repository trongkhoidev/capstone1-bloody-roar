import { beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma } from "@bloody-roar/database";
import { execute, loadSchema } from "./graphql-execute";
beforeAll(loadSchema, 60_000);
const client = { id: "client", role: "CLIENT", walletAddress: "0x1111111111111111111111111111111111111111", isBanned: false };
const developer = { id: "developer", role: "DEVELOPER", walletAddress: "0x2222222222222222222222222222222222222222", isBanned: false };
const outsider = { id: "outsider", role: "DEVELOPER", walletAddress: "0x3333333333333333333333333333333333333333", isBanned: false };
const issue = { id: "issue", clientId: client.id, developerId: developer.id as string | null, status: "IN_PROGRESS", isDraft: false, hiddenAt: null, expiresAt: null, viewCount: 1 };
const projection = { id: "projection", issueId: "issue", escrowIdHash: "hash", escrowKey: "key", phase: "FUNDED", resolutionKind: "NONE", chainId: 31337,
  contractAddress: "0x4444444444444444444444444444444444444444", client: client.walletAddress, developer: developer.walletAddress, arbiter: outsider.walletAddress,
  feeRecipient: "0x5555555555555555555555555555555555555555", amountRaw: new Prisma.Decimal("100000000"), clientAmountRaw: null, developerAmountRaw: null, platformFeeRaw: null,
  deliveryDeadline: new Date(Date.now() + 86400_000), reviewDeadline: new Date(Date.now() + 8 * 86400_000), deliveryHash: "0xabc", externalDelivery: false,
  settlementProposer: null, settlementClientBps: null, disputeRaisedAt: null, challengedAt: null, counterpartyEvidenceHash: null, disputeRaisedBy: null, projectionVersion: 1, orphan: false };
const query = `{ issue(id: "issue") { escrow { phase amountRaw externalDelivery availableActions { action reasonDisabled } } reservation { id } latestSubmission { id status } viewerCapabilities { canApply canSelect canFund canSubmit canRelease canDispute canRequestChanges canProposeSettlement canClaimMissedDeliveryRefund canPostInitialRuling } } }`;
function fakeDb(p: Record<string, unknown> | null = projection, i = issue) {
  const submission = { id: "submission", status: "SUBMITTED" };
  return {
    issue: { findUnique: vi.fn().mockResolvedValue(i), update: vi.fn().mockResolvedValue(i) },
    escrowProjection: { findUnique: vi.fn().mockResolvedValue(p) },
    fundingReservation: { findFirst: vi.fn(async ({ where }: { where: { clientId?: string; OR?: Array<{ clientId?: string; developerId?: string }> } }) => {
      if (where.clientId === client.id || where.OR?.some((term) => term.clientId === client.id || term.developerId === developer.id))
        return { id: "reservation", clientId: client.id, developerId: developer.id, expiresAt: new Date(Date.now() + 10000) };
      return null;
    }) },
    application: { findUnique: vi.fn().mockResolvedValue(null) },
    submission: { findFirst: vi.fn().mockResolvedValue(submission) }, rulingRecord: { findFirst: vi.fn().mockResolvedValue(null) },
  };
}
const run = (user: typeof client | null, p: Record<string, unknown> | null = projection, i = issue) => execute(query, { user, db: fakeDb(p, i) });
type Result = { escrow: { phase: string; amountRaw: string; externalDelivery: boolean; availableActions: Array<{ action: string; reasonDisabled: string | null }> } | null;
  reservation: { id: string } | null; latestSubmission: { id: string } | null; viewerCapabilities: Record<string, boolean> };
describe("Issue availability", () => {
  it("exposes integer amounts, actions and client permissions", async () => {
    const result = await run(client); expect(result.errors).toBeUndefined(); const row = result.data?.issue as Result;
    expect(row.escrow).toMatchObject({ phase: "FUNDED", amountRaw: "100000000", externalDelivery: false });
    expect(row.escrow?.availableActions.find((a) => a.action === "releaseFunds")?.reasonDisabled).toBeNull();
    expect(row.viewerCapabilities).toMatchObject({ canRelease: true, canDispute: true, canSubmit: false, canRequestChanges: true, canProposeSettlement: true });
    expect(row.reservation?.id).toBe("reservation"); expect(row.latestSubmission?.id).toBe("submission");
  });
  it("grants developer submission and not client release", async () => {
    const result = await run(developer); expect(result.errors).toBeUndefined();
    expect((result.data?.issue as Result).viewerCapabilities).toMatchObject({ canSubmit: true, canRelease: false, canDispute: true, canRequestChanges: false });
  });
  it("does not leak reservation or submission to outsiders or anonymous viewers", async () => {
    for (const user of [outsider, null]) {
      const result = await run(user); expect(result.errors).toBeUndefined(); const row = result.data?.issue as Result;
      expect(row.reservation).toBeNull(); expect(row.latestSubmission).toBeNull();
      expect(row.viewerCapabilities).toMatchObject({ canSubmit: false, canRelease: false, canDispute: false, canProposeSettlement: false });
    }
  });
  it("keeps permissionless missed delivery open to an authenticated outsider", async () => {
    const p = { ...projection, deliveryHash: null, deliveryDeadline: new Date(Date.now() - 2000) };
    const result = await run(outsider, p); expect(result.errors).toBeUndefined();
    expect((result.data?.issue as Result).viewerCapabilities.canClaimMissedDeliveryRefund).toBe(true);
  });
  it("shows funding and selection only to the client in the correct state", async () => {
    const awaiting = { ...issue, status: "AWAITING_FUNDING", developerId: null };
    const result = await run(client, null, awaiting); expect(result.errors).toBeUndefined();
    expect((result.data?.issue as Result).viewerCapabilities).toMatchObject({ canFund: true, canSelect: false });
    const open = { ...issue, status: "OPEN", developerId: null };
    expect(((await run(client, null, open)).data?.issue as Result).viewerCapabilities.canSelect).toBe(true);
    expect(((await run(outsider, null, open)).data?.issue as Result).viewerCapabilities.canApply).toBe(true);
    expect(((await run({ ...outsider, role: "ADMIN" }, null, open)).data?.issue as Result).viewerCapabilities.canApply).toBe(false);
    expect(((await run({ ...outsider, isBanned: true }, null, open)).data?.issue as Result).viewerCapabilities.canApply).toBe(false);
  });
});
