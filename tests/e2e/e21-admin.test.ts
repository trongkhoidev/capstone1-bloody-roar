import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { fixture } from "./harness/fixture";
import { fund } from "./harness/funding";
import { gqlAs } from "./harness/gql";
import { submitWork, releaseFunds } from "./harness/work";

beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));

test("E21: admin stats match the projection, bans cancel open work, role changes and hides are guarded and logged", async () => {
  const f = await fixture();
  const ops = (query: string, variables: Record<string, unknown> = {}) => gqlAs(f.admin, query, variables);

  const stats = await ops(`query { adminStats { openTasks } }`);
  expect(stats.data?.adminStats).toMatchObject({
    openTasks: await f.prisma.issue.count({ where: { status: "OPEN", isDraft: false, hiddenAt: null } }),
  });

  // A user with an open bounty and a pending application: banning them cancels the bounty and rejects the application.
  const target = await f.prisma.user.upsert({ where: { walletAddress: f.accounts[10]!.toLowerCase() }, create: { walletAddress: f.accounts[10]!.toLowerCase(), role: "CLIENT" }, update: {} });
  const openIssue = await f.prisma.issue.create({ data: { title: "Ban cancels this", description: "Open bounty of a banned user", category: "BUG_FIX", status: "OPEN", bountyAmount: "10", tokenId: f.token.id, clientId: target.id, requiredSkills: [] } });
  const pending = await f.prisma.application.create({ data: { issueId: f.issueId, developerId: target.id, status: "PENDING" } });
  try {
    const banned = await ops(`mutation($input: BanUserInput!) { banUser(input: $input) { id } }`, { input: { userId: target.id, reason: "Harness ban check" } });
    expect(banned.errors).toBeUndefined();
    expect((await f.prisma.issue.findUniqueOrThrow({ where: { id: openIssue.id } })).status).toBe("CANCELLED");
    expect((await f.prisma.application.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("REJECTED");
  } finally {
    await ops(`mutation($userId: ID!) { unbanUser(userId: $userId) { id } }`, { userId: target.id });
  }

  const selfDemote = await ops(`mutation($userId: ID!, $role: String!) { setUserRole(userId: $userId, role: $role) { id } }`, { userId: f.admin.id, role: "CLIENT" });
  expect(selfDemote.errors?.[0]?.extensions?.code).toBe("SELF_DEMOTION");

  const hidden = await ops(`mutation($issue: ID!, $reason: String!) { adminHideIssue(issueId: $issue, reason: $reason) }`, { issue: f.issueId, reason: "Harness hide check" });
  expect(hidden.errors).toBeUndefined();
  expect(await ops(`mutation($issue: ID!) { adminUnhideIssue(issueId: $issue) }`, { issue: f.issueId })).toMatchObject({ data: { adminUnhideIssue: true } });
  const logs = (await ops(`query { adminLogs(first: 100) { action } }`)).data?.adminLogs as Array<{ action: string }>;
  expect(logs.map((log) => log.action)).toEqual(expect.arrayContaining(["ban_user", "hide_issue"]));

  expect(((await ops(`query { indexerStatus { chainId lagSeconds } }`)).data?.indexerStatus as unknown[]).length).toBeGreaterThan(0);
  expect(Array.isArray((await ops(`query { contractConfig { chainId } }`)).data?.contractConfig)).toBe(true);
  expect(Array.isArray((await ops(`query { reconciliationFindings(status: "OPEN") { id } }`)).data?.reconciliationFindings)).toBe(true);
  expect(Array.isArray((await ops(`query { stuckIntents { id } }`)).data?.stuckIntents)).toBe(true);

  // Reviews: refused before completion, then the developer's average reflects the new rating.
  const review = `mutation($issue: ID!, $rating: Int!) { submitReview(issueId: $issue, rating: $rating) { id } }`;
  await fund(f);
  await submitWork(f, "Work to review");
  expect((await gqlAs(f.client, review, { issue: f.issueId, rating: 4 })).errors?.[0]?.extensions?.code).toBe("INVALID_STATE");
  await releaseFunds(f);
  expect((await gqlAs(f.client, review, { issue: f.issueId, rating: 4 })).errors).toBeUndefined();
  const reviews = await f.prisma.review.findMany({ where: { developerId: f.developer.id }, select: { rating: true } });
  const average = Math.round((reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length) * 100) / 100;
  expect((await f.prisma.user.findUniqueOrThrow({ where: { id: f.developer.id } })).reputationScore).toBe(average);
}, 240_000);
