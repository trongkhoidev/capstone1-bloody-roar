// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@bloody-roar/database";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { execute, loadSchema } from "./graphql-execute";

const hex = (n: number) => `0x${randomBytes(n).toString("hex")}`;
const hideMutation = `mutation($issue: ID!, $reason: String!) { adminHideIssue(issueId: $issue, reason: $reason) }`;
const unhideMutation = `mutation($issue: ID!) { adminUnhideIssue(issueId: $issue) }`;
const issueQuery = `query($id: ID!) { issue(id: $id) { id } }`;
const listQuery = `query { issues(first: 100) { edges { node { id } } } }`;

describe.skipIf(!process.env.TEST_DATABASE_URL)("issue hiding on test database", () => {
  let admin: Awaited<ReturnType<typeof prisma.user.create>>, client: typeof admin, developer: typeof admin, outsider: typeof admin;
  let issueId = "", tokenId = "";
  beforeAll(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    await loadSchema();
    admin = await prisma.user.create({ data: { walletAddress: hex(20), role: "ADMIN" } });
    client = await prisma.user.create({ data: { walletAddress: hex(20), role: "CLIENT" } });
    developer = await prisma.user.create({ data: { walletAddress: hex(20), role: "DEVELOPER" } });
    outsider = await prisma.user.create({ data: { walletAddress: hex(20), role: "DEVELOPER" } });
    tokenId = (await prisma.token.create({ data: { name: "Hide", symbol: "HID", address: hex(20), decimals: 6, chainId: 31337 } })).id;
    issueId = (await prisma.issue.create({ data: { title: "Hide me", description: "Hidden issue test", category: "BUG_FIX", status: "OPEN", isDraft: false, clientId: client.id, developerId: developer.id, tokenId, bountyAmount: "100" } })).id;
  }, 60_000);
  afterAll(async () => {
    await prisma.adminLog.deleteMany({ where: { targetId: issueId } });
    if (issueId) await prisma.issue.deleteMany({ where: { id: issueId } });
    if (tokenId) await prisma.token.deleteMany({ where: { id: tokenId } });
    await prisma.user.deleteMany({ where: { id: { in: [admin?.id, client?.id, developer?.id, outsider?.id].filter(Boolean) } } });
    await prisma.$disconnect();
  }, 60_000);

  const as = (user: unknown, query: string, variables: Record<string, unknown>) => execute(query, { user, db: prisma }, variables);
  const listed = async (user: unknown) => {
    const result = await as(user, listQuery, {});
    return ((result.data?.issues as { edges: Array<{ node: { id: string } }> }).edges).map((edge) => edge.node.id);
  };

  it("counts one view per viewer per hour, even with concurrent requests", async () => {
    const record = () => as(developer, `mutation($id: ID!) { recordIssueView(issueId: $id) }`, { id: issueId });
    const results = await Promise.all([record(), record()]);
    for (const result of results) expect(result.errors).toBeUndefined();
    expect(results.map((result) => result.data?.recordIssueView).sort()).toEqual([false, true]);
    await prisma.issueView.updateMany({ where: { issueId, userId: developer.id }, data: { viewedAt: new Date(Date.now() - 3_660_000) } });
    expect((await record()).data?.recordIssueView).toBe(true);
    expect((await prisma.issue.findUniqueOrThrow({ where: { id: issueId } })).viewCount).toBe(2);
  });

  it("records a draft view only for its owner", async () => {
    const record = (user: typeof client) => as(user, `mutation($id: ID!) { recordIssueView(issueId: $id) }`, { id: issueId });
    await prisma.issue.update({ where: { id: issueId }, data: { isDraft: true } });
    try {
      for (const user of [developer, admin, outsider]) {
        expect((await record(user)).errors?.[0]?.extensions?.code).toBe("NOT_FOUND");
      }
      expect((await record(client)).data?.recordIssueView).toBe(true);
    } finally {
      await prisma.issue.update({ where: { id: issueId }, data: { isDraft: false } });
    }
  });

  it("hides an issue from the marketplace and records the admin action", async () => {
    expect((await as(outsider, issueQuery, { id: issueId })).data?.issue).toMatchObject({ id: issueId });
    expect(await listed(outsider)).toContain(issueId);

    expect((await as(client, hideMutation, { issue: issueId, reason: "spam listing" })).errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    expect((await as(admin, hideMutation, { issue: issueId, reason: "no" })).errors).toBeDefined();
    const hidden = await as(admin, hideMutation, { issue: issueId, reason: "spam listing" });
    expect(hidden.errors).toBeUndefined();

    expect(await listed(outsider)).not.toContain(issueId);
    expect((await as(outsider, issueQuery, { id: issueId })).data?.issue).toBeNull();
    expect((await as(client, issueQuery, { id: issueId })).data?.issue).toMatchObject({ id: issueId });
    expect((await as(developer, issueQuery, { id: issueId })).data?.issue).toMatchObject({ id: issueId });
    expect((await as(admin, issueQuery, { id: issueId })).data?.issue).toMatchObject({ id: issueId });
    expect(await prisma.adminLog.count({ where: { action: "hide_issue", targetId: issueId, details: { path: ["reason"], equals: "spam listing" } } })).toBe(1);
  });

  it("restores visibility when unhidden and logs the action", async () => {
    expect((await as(client, unhideMutation, { issue: issueId })).errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    expect((await as(admin, unhideMutation, { issue: issueId })).errors).toBeUndefined();

    expect(await listed(outsider)).toContain(issueId);
    expect(await prisma.adminLog.count({ where: { action: "unhide_issue", targetId: issueId } })).toBe(1);
  });
});
