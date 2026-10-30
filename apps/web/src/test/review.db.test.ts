// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@bloody-roar/database";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { execute, loadSchema } from "./graphql-execute";

const hex = (n: number) => `0x${randomBytes(n).toString("hex")}`;
const submit = `mutation($issue: ID!, $rating: Int!, $comment: String) { submitReview(issueId: $issue, rating: $rating, comment: $comment) { id rating comment } }`;
const reviewsOf = `query($user: ID!) { reviews(userId: $user) { rating } }`;

describe.skipIf(!process.env.TEST_DATABASE_URL)("reviews and reputation on test database", () => {
  let client: Awaited<ReturnType<typeof prisma.user.create>>, developer: typeof client;
  let tokenId = "";
  const issueIds: string[] = [];
  beforeAll(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    await loadSchema();
    client = await prisma.user.create({ data: { walletAddress: hex(20), role: "CLIENT" } });
    developer = await prisma.user.create({ data: { walletAddress: hex(20), role: "DEVELOPER" } });
    tokenId = (await prisma.token.create({ data: { name: "Review", symbol: "REV", address: hex(20), decimals: 6, chainId: 31337 } })).id;
  }, 60_000);
  afterAll(async () => {
    await prisma.review.deleteMany({ where: { issueId: { in: issueIds } } });
    await prisma.issue.deleteMany({ where: { id: { in: issueIds } } });
    if (tokenId) await prisma.token.deleteMany({ where: { id: tokenId } });
    await prisma.user.deleteMany({ where: { id: { in: [client?.id, developer?.id].filter(Boolean) } } });
    await prisma.$disconnect();
  }, 60_000);

  const makeIssue = async (status: "IN_PROGRESS" | "COMPLETED", outcome: "RELEASE" | "MISSED_DELIVERY_REFUND" | null = null) => {
    const issue = await prisma.issue.create({
      data: { title: `Review ${status}`, description: "Review test", category: "BUG_FIX", status, outcome, clientId: client.id, developerId: developer.id, tokenId, bountyAmount: "100" },
    });
    issueIds.push(issue.id);
    return issue.id;
  };
  const as = (user: unknown, query: string, variables: Record<string, unknown>) => execute(query, { user, db: prisma }, variables);

  it("accepts a review only from the client after completion, once per issue", async () => {
    const open = await makeIssue("IN_PROGRESS");
    expect((await as(client, submit, { issue: open, rating: 5 })).errors?.[0]?.extensions?.code).toBe("INVALID_STATE");

    const done = await makeIssue("COMPLETED", "RELEASE");
    expect((await as(developer, submit, { issue: done, rating: 5 })).errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    expect((await as(client, submit, { issue: done, rating: 6 })).errors).toBeDefined();

    const first = await as(client, submit, { issue: done, rating: 5, comment: "Solid work" });
    expect(first.errors).toBeUndefined();
    expect((await as(client, submit, { issue: done, rating: 3 })).errors?.[0]?.extensions?.code).toBe("CONFLICT");
  });

  it("recalculates the developer's average rating and completed count", async () => {
    const refund = await makeIssue("COMPLETED", "MISSED_DELIVERY_REFUND");
    expect((await as(client, submit, { issue: refund, rating: 1 })).errors).toBeUndefined();
    const second = await makeIssue("COMPLETED", "RELEASE");
    expect((await as(client, submit, { issue: second, rating: 4 })).errors).toBeUndefined();

    const profile = await prisma.user.findUniqueOrThrow({ where: { id: developer.id } });
    // Average over all three reviews (5, 1, 4), rounded to two decimals; the refund still counts as a review.
    expect(profile.reputationScore).toBe(3.33);
    expect(profile.completedTaskCount).toBe(2);

    const listed = await as(client, reviewsOf, { user: developer.id });
    expect((listed.data?.reviews as Array<{ rating: number }>).map((review) => review.rating).sort()).toEqual([1, 4, 5]);
  });
});
