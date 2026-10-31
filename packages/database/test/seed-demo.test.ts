import { assertTestDatabase } from "../src/test-guard";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { prisma } from "../src/index";
import { seedDemo } from "../src/seed-demo";

beforeAll(async () => {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "notifications", "messages", "issue_comments", "reviews",
    "submissions", "applications", "escrows", "funding_reservations",
    "escrow_projections", "issues", "users" CASCADE
  `);
  await prisma.token.upsert({
    where: {
      chainId_address: {
        chainId: 31337,
        address: "0x0000000000000000000000000000000000000002",
      },
    },
    update: { isActive: true },
    create: {
      symbol: "USDC",
      name: "USD Coin",
      address: "0x0000000000000000000000000000000000000002",
      decimals: 6,
      chainId: 31337,
      isActive: true,
      sortOrder: 1,
    },
  });
});

test("seedDemo is idempotent and conforms to architecture", async () => {
  await seedDemo(prisma);
  const users1 = await prisma.user.count();
  const issues1 = await prisma.issue.count();
  const reviews1 = await prisma.review.count();

  await seedDemo(prisma);
  const users2 = await prisma.user.count();
  const issues2 = await prisma.issue.count();
  const reviews2 = await prisma.review.count();

  // Số user, issue, review không đổi giữa hai lần chạy
  expect(users1).toBe(users2);
  expect(issues1).toBe(issues2);
  expect(reviews1).toBe(reviews2);

  // Escrow table count is 0
  const [{ count: escrowCount }] = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT count(*)::bigint as count FROM "escrows"`;
  expect(Number(escrowCount)).toBe(0);

  // Không có issue nào ở IN_PROGRESS
  const inProgressCount = await prisma.issue.count({
    where: { status: "IN_PROGRESS" },
  });
  expect(inProgressCount).toBe(0);

  // Mọi issue dùng token chainId 31337
  const issues = await prisma.issue.findMany({ include: { token: true } });
  expect(issues.length).toBeGreaterThan(0);
  for (const issue of issues) {
    expect(issue.token.chainId).toBe(31337);
  }

  // reputationScore của mỗi developer có review bằng trung bình rating (làm tròn 2 chữ số)
  const reviews = await prisma.review.findMany();
  expect(reviews.length).toBeGreaterThan(0);
  const developerIds = [...new Set(reviews.map((r) => r.developerId))];
  for (const devId of developerIds) {
    const dev = await prisma.user.findUniqueOrThrow({ where: { id: devId } });
    const devReviews = reviews.filter((r) => r.developerId === devId);
    const avg = devReviews.reduce((sum, r) => sum + r.rating, 0) / devReviews.length;
    const roundedAvg = Math.round(avg * 100) / 100;
    expect(dev.reputationScore).toBe(roundedAvg);
  }

  // Với chainId 31337, user client 1 có ví 0x3c44…93bc (chữ thường)
  const client1 = await prisma.user.findFirst({
    where: { email: "alice@nexus-protocol.io" },
  });
  expect(client1?.walletAddress).toBe("0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc");

  // Không có user nào trùng ví #0, #5, #6
  const forbiddenWallets = [
    "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266", // #0 (owner)
    "0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc", // #5 (arbiter)
    "0x976ea74026e72cd555457b05e9402c7370030da7", // #6 (fee recipient)
  ];
  const allUsers = await prisma.user.findMany();
  for (const user of allUsers) {
    expect(forbiddenWallets).not.toContain(user.walletAddress.toLowerCase());
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});
