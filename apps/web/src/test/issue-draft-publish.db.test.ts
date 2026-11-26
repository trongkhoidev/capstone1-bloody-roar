// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@bloody-roar/database";
import { ACTIVE_CHAIN_ID } from "@bloody-roar/shared";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { execute, loadSchema } from "./graphql-execute";

const hex = (n: number) => `0x${randomBytes(n).toString("hex")}`;
const createMutation = `mutation($input: CreateIssueInput!) { createIssue(input: $input) { id } }`;
const publishMutation = `mutation($id: ID!) { publishIssue(id: $id) { id } }`;
const applyMutation = `mutation($input: ApplyToIssueInput!) { applyToIssue(input: $input) { id } }`;
const listQuery = `query { issues(first: 100) { edges { node { id } } } }`;

describe.skipIf(!process.env.TEST_DATABASE_URL)("draft bounties and publishIssue on test database", () => {
  let client: Awaited<ReturnType<typeof prisma.user.create>>, developer: typeof client;
  let tokenId = "";
  const issueIds: string[] = [];

  beforeAll(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    await loadSchema();
    client = await prisma.user.create({ data: { walletAddress: hex(20), role: "CLIENT" } });
    developer = await prisma.user.create({ data: { walletAddress: hex(20), role: "DEVELOPER" } });
    tokenId = (await prisma.token.create({ data: { name: "Draft", symbol: "DRF", address: hex(20), decimals: 6, chainId: ACTIVE_CHAIN_ID } })).id;
  }, 60_000);

  afterAll(async () => {
    await prisma.application.deleteMany({ where: { issueId: { in: issueIds } } });
    await prisma.issue.deleteMany({ where: { id: { in: issueIds } } });
    if (tokenId) await prisma.token.deleteMany({ where: { id: tokenId } });
    await prisma.user.deleteMany({ where: { id: { in: [client?.id, developer?.id].filter(Boolean) } } });
    await prisma.$disconnect();
  }, 60_000);

  const as = (user: unknown, query: string, variables: Record<string, unknown>) => execute(query, { user, db: prisma }, variables);
  const listed = async () => {
    const result = await as(developer, listQuery, {});
    return (result.data?.issues as { edges: Array<{ node: { id: string } }> }).edges.map((edge) => edge.node.id);
  };
  const createIssue = async (isDraft?: boolean) => {
    const result = await as(client, createMutation, { input: {
      title: "Fix the flaky payment webhook",
      description: "The payment webhook retries forever when the signature header is missing.",
      category: "BUG_FIX",
      bountyAmount: "100",
      tokenId,
      ...(isDraft === undefined ? {} : { isDraft }),
    } });
    expect(result.errors).toBeUndefined();
    const { id } = result.data?.createIssue as { id: string };
    issueIds.push(id);
    return prisma.issue.findUniqueOrThrow({ where: { id } });
  };
  const code = (result: Awaited<ReturnType<typeof as>>) => result.errors?.[0]?.extensions?.code;

  it("publishes immediately when isDraft is omitted", async () => {
    const issue = await createIssue();
    expect(issue.isDraft).toBe(false);
    expect(issue.publishedAt).not.toBeNull();
    expect(await listed()).toContain(issue.id);
  });

  it("keeps a draft out of the marketplace and blocks applications", async () => {
    const draft = await createIssue(true);
    expect(draft.isDraft).toBe(true);
    expect(draft.publishedAt).toBeNull();
    expect(await listed()).not.toContain(draft.id);
    expect(code(await as(developer, applyMutation, { input: { issueId: draft.id } }))).toBe("NOT_FOUND");
  });

  it("lets only the owner publish a draft, once", async () => {
    const draft = await createIssue(true);
    expect(code(await as(developer, publishMutation, { id: draft.id }))).toBe("NOT_FOUND");

    const published = await as(client, publishMutation, { id: draft.id });
    expect(published.errors).toBeUndefined();
    expect(published.data?.publishIssue).toMatchObject({ id: draft.id });
    expect(await prisma.issue.findUniqueOrThrow({ where: { id: draft.id } })).toMatchObject({ isDraft: false, publishedAt: expect.any(Date) });
    expect(await listed()).toContain(draft.id);
    expect((await as(developer, applyMutation, { input: { issueId: draft.id } })).errors).toBeUndefined();

    expect(code(await as(client, publishMutation, { id: draft.id }))).toBe("ISSUE_NOT_DRAFT");
  });

  it("refuses to publish a draft that has expired", async () => {
    const draft = await createIssue(true);
    await prisma.issue.update({ where: { id: draft.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    expect(code(await as(client, publishMutation, { id: draft.id }))).toBe("ISSUE_EXPIRED");
    expect((await prisma.issue.findUniqueOrThrow({ where: { id: draft.id } })).isDraft).toBe(true);
  });
});
