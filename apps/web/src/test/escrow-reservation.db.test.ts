// @vitest-environment node
// Chạy trên database thật (DATABASE_URL). Bỏ qua khi không có DATABASE_URL.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ACTIVE_CHAIN_ID } from "@bloody-roar/shared";
import { prisma } from "@bloody-roar/database";
import { execute, loadSchema } from "./graphql-execute";

const SELECT = `mutation($issueId: ID!, $applicationId: ID!, $deliveryDeadline: String!) {
  selectDeveloper(issueId: $issueId, applicationId: $applicationId, deliveryDeadline: $deliveryDeadline) {
    id status escrowKey
  }
}`;

const randomHex = (bytes: number) => `0x${randomBytes(bytes).toString("hex")}`;

describe.skipIf(!process.env.DATABASE_URL)("selectDeveloper under concurrency (real database)", () => {
  const ids: { users: string[]; tokenId?: string } = { users: [] };
  let issueId = "";
  let client: Awaited<ReturnType<typeof prisma.user.create>>;
  const applicationIds: string[] = [];

  beforeAll(async () => {
    vi.stubEnv("ESCROW_CONTRACT_ADDRESS", randomHex(20));
    vi.stubEnv("ESCROW_CHAIN_ID", String(ACTIVE_CHAIN_ID));
    await loadSchema();

    client = await prisma.user.create({
      data: { walletAddress: randomHex(20), role: "CLIENT" },
    });
    ids.users.push(client.id);
    const token = await prisma.token.create({
      data: {
        symbol: "RACE",
        name: "Race test token",
        address: randomHex(20),
        decimals: 6,
        chainId: ACTIVE_CHAIN_ID,
      },
    });
    ids.tokenId = token.id;
    const issue = await prisma.issue.create({
      data: {
        title: "Race test bounty for the escrow flow",
        description: "Two developers apply and the client selects one of them at the same time.",
        category: "BUG_FIX",
        bountyAmount: "100",
        tokenId: token.id,
        clientId: client.id,
        requiredSkills: [],
      },
    });
    issueId = issue.id;
    await prisma.testCase.create({
      data: {
        title: "Release pays the developer",
        description: "Release moves the funds to the developer.",
        given: "the client approves the work",
        when: "the client releases the funds",
        then: "the developer receives the payout",
        isApproved: true,
        issueId: issue.id,
      },
    });
    for (let i = 0; i < 2; i++) {
      const developer = await prisma.user.create({
        data: { walletAddress: randomHex(20), role: "DEVELOPER" },
      });
      ids.users.push(developer.id);
      const application = await prisma.application.create({
        data: { issueId: issue.id, developerId: developer.id, status: "PENDING" },
      });
      applicationIds.push(application.id);
    }
  }, 60_000);

  afterAll(async () => {
    if (issueId) {
      await prisma.notification.deleteMany({ where: { userId: { in: ids.users } } });
      await prisma.fundingReservation.deleteMany({ where: { issueId } });
      await prisma.testCase.deleteMany({ where: { issueId } });
      await prisma.application.deleteMany({ where: { issueId } });
      await prisma.issue.deleteMany({ where: { id: issueId } });
    }
    if (ids.tokenId) await prisma.token.deleteMany({ where: { id: ids.tokenId } });
    await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
    await prisma.$disconnect();
  }, 60_000);

  it("lets exactly one of two parallel selections win", async () => {
    const deliveryDeadline = new Date(Date.now() + 30 * 86_400_000).toISOString();

    const runs = await Promise.all(
      applicationIds.map((applicationId) =>
        execute(
          SELECT,
          { user: client, db: prisma },
          { issueId, applicationId, deliveryDeadline },
        ),
      ),
    );

    const winners = runs.filter((run) => !run.errors);
    const losers = runs.filter((run) => run.errors);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0]?.errors?.[0]?.extensions?.code).toMatch(
      /^(ISSUE_NOT_OPEN|ISSUE_ALREADY_RESERVED)$/,
    );
    expect(await prisma.fundingReservation.count({ where: { issueId } })).toBe(1);
    const issue = await prisma.issue.findUniqueOrThrow({ where: { id: issueId } });
    expect(issue.status).toBe("AWAITING_FUNDING");
  }, 60_000);
});
