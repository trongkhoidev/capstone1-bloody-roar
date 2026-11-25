// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACTIVE_CHAIN_ID } from "@bloody-roar/shared";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { prisma, type ReservationStatus } from "@bloody-roar/database";
import { execute, loadSchema } from "./graphql-execute";

const WITHDRAW = `mutation($id: ID!) { withdrawApplication(id: $id) { id status } }`;

const randomHex = (bytes: number) => `0x${randomBytes(bytes).toString("hex")}`;

describe.skipIf(!process.env.TEST_DATABASE_URL)("withdrawApplication with funding reservations (real database)", () => {
  const userIds: string[] = [];
  const issueIds: string[] = [];
  let tokenId = "";
  let clientId = "";

  beforeAll(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    await loadSchema();
    const client = await prisma.user.create({ data: { walletAddress: randomHex(20), role: "CLIENT" } });
    clientId = client.id;
    userIds.push(client.id);
    const token = await prisma.token.create({
      data: { symbol: "WDR", name: "Withdraw test token", address: randomHex(20), decimals: 6, chainId: ACTIVE_CHAIN_ID },
    });
    tokenId = token.id;
  }, 60_000);

  afterAll(async () => {
    await prisma.fundingReservation.deleteMany({ where: { issueId: { in: issueIds } } });
    await prisma.application.deleteMany({ where: { issueId: { in: issueIds } } });
    await prisma.issue.deleteMany({ where: { id: { in: issueIds } } });
    if (tokenId) await prisma.token.deleteMany({ where: { id: tokenId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }, 60_000);

  async function seed(reservationStatuses: ReservationStatus[]) {
    const developer = await prisma.user.create({ data: { walletAddress: randomHex(20), role: "DEVELOPER" } });
    userIds.push(developer.id);
    const issue = await prisma.issue.create({
      data: {
        title: "Withdraw lock test bounty",
        description: "A developer tries to withdraw while the client is funding the escrow.",
        category: "BUG_FIX",
        bountyAmount: "100",
        tokenId,
        clientId,
        requiredSkills: [],
      },
    });
    issueIds.push(issue.id);
    const application = await prisma.application.create({
      data: { issueId: issue.id, developerId: developer.id, status: "PENDING" },
    });
    for (const [n, status] of reservationStatuses.entries()) {
      await prisma.fundingReservation.create({
        data: {
          issueId: issue.id,
          applicationId: application.id,
          clientId,
          developerId: developer.id,
          escrowKey: `br_${issue.id}_${n}`,
          escrowIdHash: randomHex(32),
          chainId: ACTIVE_CHAIN_ID,
          contractAddress: randomHex(20),
          tokenAddress: randomHex(20),
          amountRaw: "100000000",
          deliveryDeadline: new Date(Date.now() + 30 * 86_400_000),
          termsHash: randomHex(32),
          termsVersion: 1,
          status,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
    }
    return { developer, application };
  }

  it.each<ReservationStatus>(["AWAITING_FUNDING", "FUNDED"])(
    "refuses to withdraw while a reservation is %s",
    async (status) => {
      const { developer, application } = await seed([status]);

      const res = await execute(WITHDRAW, { user: developer, db: prisma }, { id: application.id });

      expect(res.errors?.[0]?.extensions?.code).toBe("APPLICATION_NOT_WITHDRAWABLE");
      const after = await prisma.application.findUniqueOrThrow({ where: { id: application.id } });
      expect(after.status).toBe("PENDING");
    },
    60_000,
  );

  it.each<[string, ReservationStatus[]]>([
    ["no reservation", []],
    ["only expired, cancelled and mismatched reservations", ["EXPIRED", "CANCELLED", "MISMATCHED"]],
  ])(
    "withdraws with %s",
    async (_label, statuses) => {
      const { developer, application } = await seed(statuses);

      const res = await execute(WITHDRAW, { user: developer, db: prisma }, { id: application.id });

      expect(res.errors).toBeUndefined();
      expect(res.data).toEqual({ withdrawApplication: { id: application.id, status: "WITHDRAWN" } });
    },
    60_000,
  );
});
