import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeEscrowCall } from "@bloody-roar/shared/escrow";
import { execute, loadSchema } from "./graphql-execute";
beforeAll(loadSchema, 60_000);
const contract = "0x1111111111111111111111111111111111111111";
const client = { id: "client", role: "CLIENT", walletAddress: "0x2222222222222222222222222222222222222222" };
const dev = { id: "dev", role: "DEVELOPER", walletAddress: "0x3333333333333333333333333333333333333333" };
const outsider = { ...dev, walletAddress: "0x4444444444444444444444444444444444444444" };
function db(overrides: Record<string, unknown> = {}) {
  const projection = { issueId: "issue", escrowKey: "escrow", phase: "FUNDED", chainId: 31337, contractAddress: contract,
    client: client.walletAddress, developer: dev.walletAddress, settlementProposer: null, ...overrides };
  return { escrowProjection: { findUnique: vi.fn().mockResolvedValue(projection) }, transactionIntent: { create: vi.fn().mockResolvedValue({ id: "intent" }) } };
}
const query = (method: string, propose = false) => `mutation($issue: ID!${propose ? ", $bps: Int!" : ""}) { ${method}(issueId: $issue${propose ? ", clientBps: $bps" : ""}) { method data } }`;
const run = (method: string, actor: typeof client, database = db(), bps?: number) => execute(query(method, bps !== undefined), { user: actor, db: database }, { issue: "issue", ...(bps !== undefined ? { bps } : {}) });
beforeEach(() => { vi.stubEnv("CHAIN_ID", "31337"); vi.stubEnv("ESCROW_ADDRESS", contract); });
describe("settlement preparation", () => {
  it.each([0, 3000, 10000])("encodes proposed client share %i", async (bps) => {
    const result = await run("prepareProposeSettlement", client, db(), bps);
    expect(result.errors).toBeUndefined();
    expect(result.data?.prepareProposeSettlement).toEqual({ method: "proposeSettlement", data: encodeEscrowCall("proposeSettlement", { escrowId: "escrow", clientBps: String(bps) }) });
  });
  it("checks proposed percentage, participant, phase and duplicate", async () => {
    expect((await run("prepareProposeSettlement", client, db(), -1)).errors?.[0]?.extensions?.code).toBe("INVALID_BASIS_POINTS");
    expect((await run("prepareProposeSettlement", client, db(), 10001)).errors?.[0]?.extensions?.code).toBe("INVALID_BASIS_POINTS");
    expect((await run("prepareProposeSettlement", outsider, db(), 1)).errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    expect((await run("prepareProposeSettlement", client, db({ phase: "RESOLVED" }), 1)).errors?.[0]?.extensions?.code).toBe("INVALID_PHASE");
    expect((await run("prepareProposeSettlement", client, db({ settlementProposer: client.walletAddress }), 1)).errors?.[0]?.extensions?.code).toBe("SETTLEMENT_PENDING");
  });
  it("only allows the proposer to revoke and the other party to accept", async () => {
    const pending = db({ settlementProposer: client.walletAddress });
    expect((await run("prepareRevokeSettlement", client, pending)).errors).toBeUndefined();
    expect((await run("prepareRevokeSettlement", dev, pending)).errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    expect((await run("prepareAcceptSettlement", dev, pending)).errors).toBeUndefined();
    expect((await run("prepareAcceptSettlement", client, pending)).errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    expect((await run("prepareAcceptSettlement", client)).errors?.[0]?.extensions?.code).toBe("NO_PENDING_SETTLEMENT");
    expect((await run("prepareRevokeSettlement", client, db({ chainId: 1, settlementProposer: client.walletAddress }))).errors?.[0]?.extensions?.code).toBe("ESCROW_CHAIN_MISMATCH");
  });
});
