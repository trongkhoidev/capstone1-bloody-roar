// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@bloody-roar/database";
import { ACTIVE_CHAIN_ID } from "@bloody-roar/shared";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { encodeEscrowCall } from "@bloody-roar/shared/escrow";
import { execute, loadSchema } from "./graphql-execute";

const hex = (n: number) => `0x${randomBytes(n).toString("hex")}`;
const RELEASE = `mutation($issueId: ID!, $deliveryHash: String!) {
  prepareReleaseFunds(issueId: $issueId, deliveryHash: $deliveryHash) { method data args { name value } }
}`;

describe.skipIf(!process.env.TEST_DATABASE_URL)("prepareReleaseFunds against the delivered hash (real database)", () => {
  let client: Awaited<ReturnType<typeof prisma.user.create>>, developer: typeof client;
  let issueId = "", tokenId = "", escrowHash = "", escrowKey = "";
  const deliveryA = `0x${"aa".repeat(32)}`;
  const deliveryB = `0x${"bb".repeat(32)}`;

  beforeAll(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    const contract = hex(20);
    vi.stubEnv("CHAIN_ID", String(ACTIVE_CHAIN_ID));
    vi.stubEnv("ESCROW_ADDRESS", contract);
    await loadSchema();
    client = await prisma.user.create({ data: { walletAddress: hex(20), role: "CLIENT" } });
    developer = await prisma.user.create({ data: { walletAddress: hex(20), role: "DEVELOPER" } });
    tokenId = (await prisma.token.create({ data: { name: "Release", symbol: "REL", address: hex(20), decimals: 6, chainId: ACTIVE_CHAIN_ID } })).id;
    issueId = (await prisma.issue.create({ data: { title: "Release", description: "Release hash test", category: "BUG_FIX", status: "IN_PROGRESS", clientId: client.id, developerId: developer.id, tokenId, bountyAmount: "100", requiredSkills: [] } })).id;
    escrowHash = hex(32);
    escrowKey = `release-${issueId}`;
    const now = new Date();
    await prisma.escrowProjection.create({ data: { issueId, escrowKey, escrowIdHash: escrowHash, chainId: ACTIVE_CHAIN_ID, contractAddress: contract, client: client.walletAddress, developer: developer.walletAddress, arbiter: hex(20), feeRecipient: hex(20), amountRaw: "100000000", depositedAt: now, deliveryDeadline: now, reviewDeadline: now, termsHash: hex(32), deliveryHash: deliveryB, phase: "FUNDED", lastProjectedBlock: 1n } });
  }, 60_000);

  afterAll(async () => {
    await prisma.transactionIntent.deleteMany({ where: { issueId } });
    await prisma.escrowProjection.deleteMany({ where: { escrowIdHash: escrowHash } });
    if (issueId) await prisma.issue.deleteMany({ where: { id: issueId } });
    if (tokenId) await prisma.token.deleteMany({ where: { id: tokenId } });
    await prisma.user.deleteMany({ where: { id: { in: [client?.id, developer?.id].filter(Boolean) } } });
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  }, 60_000);

  it("refuses with DELIVERY_CHANGED when the reviewed hash is stale", async () => {
    const result = await execute(RELEASE, { user: client, db: prisma }, { issueId, deliveryHash: deliveryA });

    expect(result.errors?.[0]?.extensions?.code).toBe("DELIVERY_CHANGED");
  }, 60_000);

  it("prepares releaseFunds bound to the current hash, ignoring case", async () => {
    const result = await execute(RELEASE, { user: client, db: prisma }, { issueId, deliveryHash: deliveryB.toUpperCase().replace("0X", "0x") });

    expect(result.errors).toBeUndefined();
    expect(result.data?.prepareReleaseFunds).toEqual({
      method: "releaseFunds",
      data: encodeEscrowCall("releaseFunds", { escrowId: escrowKey, expectedDeliveryHash: deliveryB }),
      args: [{ name: "escrowId", value: escrowKey }, { name: "expectedDeliveryHash", value: deliveryB }],
    });
  }, 60_000);
});
