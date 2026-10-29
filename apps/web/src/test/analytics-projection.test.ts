import { beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma } from "@bloody-roar/database";
import { execute, loadSchema } from "./graphql-execute";
beforeAll(loadSchema, 60_000);
const contract = "0x1111111111111111111111111111111111111111";
const wallet = "0x2222222222222222222222222222222222222222";
const amount = "900719925474099300000";
const dec = (v: string) => new Prisma.Decimal(v);
const user = { id: "user", walletAddress: wallet, role: "DEVELOPER", isBanned: false };
const admin = { id: "admin", walletAddress: "0x3333333333333333333333333333333333333333", role: "ADMIN", isBanned: false };
function fakeDb() {
  const paid = { chainId: 31337, contractAddress: contract, _sum: { amountRaw: dec(amount), developerAmountRaw: dec("900719925474099200000"), clientAmountRaw: dec("50"), platformFeeRaw: dec("99950") } };
  const group = { chainId: 31337, contractAddress: contract, _sum: { amountRaw: dec("765432100000000001") } };
  const projection = { chainId: 31337, contractAddress: contract, escrowIdHash: "0xhash" };
  return {
    user: { findUnique: vi.fn().mockResolvedValue(user), count: vi.fn().mockResolvedValue(1) },
    issue: { count: vi.fn().mockResolvedValue(1), findMany: vi.fn().mockResolvedValue([{ id: "issue", token: { id: "token", symbol: "USDC", decimals: 6 } }]) },
    application: { count: vi.fn().mockResolvedValue(2) },
    escrowProjection: { count: vi.fn().mockResolvedValue(1), groupBy: vi.fn().mockResolvedValue([paid]), findMany: vi.fn(async ({ select }: { select: { issueId?: boolean } }) => select.issueId ? [{ issueId: "issue", amountRaw: dec(amount) }] : [projection]) },
    claimableBalance: { groupBy: vi.fn().mockResolvedValue([group]) },
    chainEvent: { findMany: vi.fn().mockResolvedValue([{ ...projection, eventName: "DisputeRaised", args: { blockTimestamp: "1000" } }, { ...projection, eventName: "EscrowResolved", args: { blockTimestamp: "4600" } }]) },
  };
}
const query = `query($id: ID) { userStats(userId: $id) { postedTasks workingTasks completedTasks completedPayouts assets { chainId contractAddress developerRaw claimableRaw } } }`;
describe("projection-based analytics", () => {
  it("allows public userStats and preserves integer precision", async () => {
    const db = fakeDb(); const result = await execute(query, { user: null, db }, { id: user.id });
    expect(result.errors).toBeUndefined();
    expect(result.data?.userStats).toMatchObject({ assets: [{ chainId: 31337, contractAddress: contract, developerRaw: "900719925474099200000", claimableRaw: "765432100000000001" }] });
    expect(db.escrowProjection.groupBy).toHaveBeenCalled(); expect(db.claimableBalance.groupBy).toHaveBeenCalled();
  });
  it("requires authentication if no userId is supplied", async () => {
    const result = await execute(query, { user: null, db: fakeDb() });
    expect(result.errors?.[0]?.extensions?.code).toBe("UNAUTHORIZED");
  });
  it("uses canonical resolution amounts and dispute timings for admin statistics", async () => {
    const db = fakeDb();
    const result = await execute(`{ adminStats { assets { chainId contractAddress grossRaw developerRaw clientRaw feeRaw claimableRaw } completedBounties { raw symbol decimals } disputeRateBps meanDisputeResolutionSeconds } }`, { user: admin, db });
    expect(result.errors).toBeUndefined();
    expect(result.data?.adminStats).toMatchObject({ assets: [{ grossRaw: amount, developerRaw: "900719925474099200000", clientRaw: "50", feeRaw: "99950", claimableRaw: "765432100000000001" }],
      completedBounties: [{ raw: amount, symbol: "USDC", decimals: 6 }], disputeRateBps: 10000, meanDisputeResolutionSeconds: "3600" });
    expect(db.chainEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ canonical: true }) }));
  });
  it("does not expose admin statistics to other users", async () => {
    const result = await execute("{ adminStats { users } }", { user, db: fakeDb() });
    expect(result.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
  });
});
