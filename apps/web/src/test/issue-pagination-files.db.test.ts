// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@bloody-roar/database";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { execute, loadSchema } from "./graphql-execute";
const address = () => `0x${randomBytes(20).toString("hex")}`;
const prefix = `Pagination${randomBytes(6).toString("hex")}`;
const MY = `query($first: Int!, $after: String) { myIssues(first: $first, after: $after) { id cursor } }`;
const APPS = `query($issue: String!, $first: Int!, $after: String) { applications(issueId: $issue, first: $first, after: $after) { id cursor } }`;
const ATTACH = `mutation($issue: ID!, $attachment: ID!) { attachIssueFile(issueId: $issue, attachmentId: $attachment) { id } }`;
describe.skipIf(!process.env.TEST_DATABASE_URL)("issue pagination and attachments on PostgreSQL", () => {
  let owner: Awaited<ReturnType<typeof prisma.user.create>>, outsider: typeof owner, tokenId = "";
  const users: string[] = [], issues: string[] = [], applications: string[] = [];
  beforeAll(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL); await loadSchema();
    owner = await prisma.user.create({ data: { walletAddress: address(), role: "CLIENT" } }); users.push(owner.id);
    outsider = await prisma.user.create({ data: { walletAddress: address(), role: "DEVELOPER" } }); users.push(outsider.id);
    tokenId = (await prisma.token.create({ data: { symbol: "PAG", name: "Pagination token", address: address(), decimals: 6, chainId: 31337 } })).id;
    for (let n = 0; n < 4; n++) {
      const issue = await prisma.issue.create({ data: { title: `${prefix} issue ${n}`, description: "Test cursor and file ownership", category: "BUG_FIX", clientId: n === 3 ? outsider.id : owner.id, tokenId, bountyAmount: "100", requiredSkills: [] } });
      issues.push(issue.id);
    }
    for (let n = 0; n < 3; n++) {
      const dev = await prisma.user.create({ data: { walletAddress: address(), role: "DEVELOPER" } }); users.push(dev.id);
      applications.push((await prisma.application.create({ data: { issueId: issues[0]!, developerId: dev.id } })).id);
    }
    applications.push((await prisma.application.create({ data: { issueId: issues[1]!, developerId: outsider.id } })).id);
  }, 60_000);
  afterAll(async () => {
    await prisma.attachment.deleteMany({ where: { uploaderId: { in: users } } });
    await prisma.issue.deleteMany({ where: { id: { in: issues } } });
    if (tokenId) await prisma.token.deleteMany({ where: { id: tokenId } });
    await prisma.user.deleteMany({ where: { id: { in: users } } }); await prisma.$disconnect();
  }, 60_000);
  it("paginates marketplace, owned issues and applications without crossing scope", async () => {
    const market = `query($search: String!, $after: String) { issues(first: 2, search: $search, sortBy: CREATED_AT, sortOrder: ASC, after: $after) { edges { node { id } cursor } pageInfo { endCursor hasNextPage } } }`;
    const first = await execute(market, { user: null, db: prisma }, { search: prefix }); expect(first.errors).toBeUndefined();
    const firstPage = first.data?.issues as { edges: Array<{ node: { id: string } }>; pageInfo: { endCursor: string; hasNextPage: boolean } };
    expect(firstPage.edges).toHaveLength(2); expect(firstPage.pageInfo.hasNextPage).toBe(true);
    const second = await execute(market, { user: null, db: prisma }, { search: prefix, after: firstPage.pageInfo.endCursor }); expect(second.errors).toBeUndefined();
    const secondPage = second.data?.issues as typeof firstPage; expect(secondPage.edges).toHaveLength(2);
    expect(new Set([...firstPage.edges, ...secondPage.edges].map((e) => e.node.id)).size).toBe(4);
    const mine1 = await execute(MY, { user: owner, db: prisma }, { first: 2 }); expect(mine1.errors).toBeUndefined();
    const rows1 = mine1.data?.myIssues as Array<{ id: string; cursor: string }>; expect(rows1).toHaveLength(2);
    const mine2 = await execute(MY, { user: owner, db: prisma }, { first: 2, after: rows1[1]!.cursor }); expect(mine2.errors).toBeUndefined();
    const rows2 = mine2.data?.myIssues as typeof rows1; expect(rows2).toHaveLength(1); expect(new Set([...rows1, ...rows2].map((r) => r.id)).size).toBe(3);
    const foreign = Buffer.from(issues[3]!).toString("base64");
    expect((await execute(MY, { user: owner, db: prisma }, { first: 2, after: foreign })).errors?.[0]?.extensions?.code).toBe("INVALID_CURSOR");
    const a1 = await execute(APPS, { user: owner, db: prisma }, { issue: issues[0], first: 2 }); expect(a1.errors).toBeUndefined();
    const apps1 = a1.data?.applications as Array<{ id: string; cursor: string }>; expect(apps1).toHaveLength(2);
    const a2 = await execute(APPS, { user: owner, db: prisma }, { issue: issues[0], first: 2, after: apps1[1]!.cursor }); expect(a2.errors).toBeUndefined();
    const apps2 = a2.data?.applications as typeof apps1; expect(apps2).toHaveLength(1); expect(new Set([...apps1, ...apps2].map((a) => a.id)).size).toBe(3);
    expect((await execute(APPS, { user: owner, db: prisma }, { issue: issues[0], first: 2, after: Buffer.from(applications[3]!).toString("base64") })).errors?.[0]?.extensions?.code).toBe("INVALID_CURSOR");
    expect((await execute(APPS, { user: outsider, db: prisma }, { issue: issues[0], first: 2 })).errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
  }, 60_000);
  it("only attaches verified issue images owned by the issue owner", async () => {
    const data = { uploaderId: owner.id, fileName: "picture.png", fileUrl: "local/picture.png", fileSize: 20, fileMime: "image/png", purpose: "ISSUE_IMAGE" as const };
    const valid = await prisma.attachment.create({ data: { ...data, status: "ATTACHED" } });
    const pending = await prisma.attachment.create({ data: { ...data, status: "PENDING" } });
    const wrong = await prisma.attachment.create({ data: { ...data, status: "ATTACHED", purpose: "EVIDENCE" } });
    for (const attachment of [pending, wrong]) expect((await execute(ATTACH, { user: owner, db: prisma }, { issue: issues[0], attachment: attachment.id })).errors?.[0]?.extensions?.code).toBe("INVALID_ATTACHMENT");
    expect((await execute(ATTACH, { user: outsider, db: prisma }, { issue: issues[0], attachment: valid.id })).errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
    expect((await execute(ATTACH, { user: owner, db: prisma }, { issue: issues[0], attachment: valid.id })).errors).toBeUndefined();
    expect((await execute(ATTACH, { user: owner, db: prisma }, { issue: issues[0], attachment: valid.id })).errors).toBeUndefined();
    expect((await execute(ATTACH, { user: owner, db: prisma }, { issue: issues[1], attachment: valid.id })).errors?.[0]?.extensions?.code).toBe("INVALID_ATTACHMENT");
    const result = await execute(`query($id: ID!) { issue(id: $id) { attachments { id } } }`, { user: null, db: prisma }, { id: issues[0] });
    expect(result.errors).toBeUndefined(); expect((result.data?.issue as { attachments: Array<{ id: string }> }).attachments.map((a) => a.id)).toEqual([valid.id]);
  }, 60_000);
});
