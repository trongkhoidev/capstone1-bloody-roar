// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { prisma } from "@bloody-roar/database";
import { execute, loadSchema } from "./graphql-execute";
const address = () => `0x${randomBytes(20).toString("hex")}`;
const hash = () => `0x${randomBytes(32).toString("hex")}`;
const chainId = 800000000 + Math.floor(Math.random() * 1000000), contract = address(), secondContract = address();
describe.skipIf(!process.env.TEST_DATABASE_URL)("projection analytics on PostgreSQL", () => {
  let client: Awaited<ReturnType<typeof prisma.user.create>>, developer: typeof client, admin: typeof client, issueId = "", tokenId = "";
  beforeAll(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL); await loadSchema();
    client = await prisma.user.create({ data: { walletAddress: address(), role: "CLIENT" } });
    developer = await prisma.user.create({ data: { walletAddress: address(), role: "DEVELOPER" } });
    admin = await prisma.user.create({ data: { walletAddress: address(), role: "ADMIN" } });
    tokenId = (await prisma.token.create({ data: { name: "Analytics test", symbol: "AST", address: address(), chainId, decimals: 6 } })).id;
    issueId = (await prisma.issue.create({ data: { title: "Analytics test", description: "Projection totals", category: "BUG_FIX", status: "COMPLETED", clientId: client.id, developerId: developer.id, tokenId, bountyAmount: "100", requiredSkills: [] } })).id;
    const deadline = new Date(Date.now() + 86400_000), escrowIdHash = hash();
    const common = { chainId, client: client.walletAddress, developer: developer.walletAddress, arbiter: address(), feeRecipient: address(), depositedAt: new Date(), deliveryDeadline: deadline, reviewDeadline: deadline, termsHash: hash(), phase: "RESOLVED" as const, resolutionKind: "RELEASE" as const, lastProjectedBlock: 10n };
    await prisma.escrowProjection.create({ data: { ...common, issueId, contractAddress: contract, escrowIdHash, amountRaw: "900719925474099300000", clientAmountRaw: "0", developerAmountRaw: "900719925474099200000", platformFeeRaw: "100000" } });
    await prisma.escrowProjection.create({ data: { ...common, contractAddress: secondContract, escrowIdHash: hash(), amountRaw: "200", clientAmountRaw: "50", developerAmountRaw: "145", platformFeeRaw: "5", orphan: true } });
    await prisma.claimableBalance.createMany({ data: [{ chainId, contractAddress: contract, address: developer.walletAddress, amountRaw: "765432100000000001" }, { chainId, contractAddress: secondContract, address: developer.walletAddress, amountRaw: "145" }] });
    for (const [n, name] of [[1, "DisputeRaised"], [2, "EscrowResolved"]] as const) await prisma.chainEvent.create({ data: { chainId, contractAddress: contract, txHash: hash(), logIndex: 0, blockNumber: BigInt(n), blockHash: hash(), txIndex: 0, eventName: name, escrowIdHash, decoderVersion: 1, args: { blockTimestamp: n === 1 ? "1000" : "4600" } } });
  }, 60_000);
  afterAll(async () => {
    await prisma.chainEvent.deleteMany({ where: { chainId, contractAddress: contract } });
    await prisma.claimableBalance.deleteMany({ where: { chainId, contractAddress: { in: [contract, secondContract] } } });
    await prisma.escrowProjection.deleteMany({ where: { chainId, contractAddress: { in: [contract, secondContract] } } });
    if (issueId) await prisma.issue.deleteMany({ where: { id: issueId } });
    if (tokenId) await prisma.token.deleteMany({ where: { id: tokenId } });
    await prisma.user.deleteMany({ where: { id: { in: [client.id, developer.id, admin.id] } } }); await prisma.$disconnect();
  }, 60_000);
  it("groups large integer amounts per contract and serves user stats publicly", async () => {
    const result = await execute(`query($id: ID!) { userStats(userId: $id) { assets { contractAddress developerRaw claimableRaw } } }`, { user: null, db: prisma }, { id: developer.id });
    expect(result.errors).toBeUndefined();
    const assets = (result.data?.userStats as { assets: Array<{ contractAddress: string; developerRaw: string; claimableRaw: string }> }).assets;
    expect(assets.find((x) => x.contractAddress === contract)).toMatchObject({ developerRaw: "900719925474099200000", claimableRaw: "765432100000000001" });
    expect(assets.find((x) => x.contractAddress === secondContract)).toMatchObject({ developerRaw: "145", claimableRaw: "145" });
    const stats = await execute(`{ adminStats { assets { contractAddress grossRaw developerRaw feeRaw claimableRaw } completedBounties { symbol raw } } }`, { user: admin, db: prisma });
    expect(stats.errors).toBeUndefined();
    const data = stats.data?.adminStats as { assets: Array<{ contractAddress: string; grossRaw: string; feeRaw: string }>; completedBounties: Array<{ symbol: string; raw: string }> };
    expect(data.assets.find((x) => x.contractAddress === contract)).toMatchObject({ grossRaw: "900719925474099300000", feeRaw: "100000" });
    expect(data.completedBounties.find((x) => x.symbol === "AST")).toMatchObject({ raw: "900719925474099300000" });
  }, 60_000);
});
