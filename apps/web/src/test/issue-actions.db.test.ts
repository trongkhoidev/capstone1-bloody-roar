// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@bloody-roar/database";
import { ACTIVE_CHAIN_ID } from "@bloody-roar/shared";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { execute, loadSchema } from "./graphql-execute";

const hex = (n: number) => `0x${randomBytes(n).toString("hex")}`;
const actionsQuery = `query($id: ID!) { issue(id: $id) { availableActions { action reasonDisabled } } }`;
const mutations = {
  withdrawApplication: `mutation($applicationId: ID!) { withdrawApplication(id: $applicationId) { id } }`,
  editCriteria: `mutation($issueId: String!) { createTestCase(input: { issueId: $issueId, title: "Rejects empty input", description: "Empty input is rejected", given: "an empty form", when: "it is submitted", then: "an error shows" }) { id } }`,
  setSource: `mutation($issueId: ID!) { setIssueSource(issueId: $issueId, repoUrl: "https://github.com/example/repo") { id } }`,
  publish: `mutation($issueId: ID!) { publishIssue(id: $issueId) { id } }`,
} as const;
type Action = keyof typeof mutations;

describe.skipIf(!process.env.TEST_DATABASE_URL)("issue availableActions match mutation errors on test database", () => {
  let client: Awaited<ReturnType<typeof prisma.user.create>>, developer: typeof client, outsider: typeof client;
  let tokenId = "";
  const issueIds: string[] = [];

  beforeAll(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    await loadSchema();
    client = await prisma.user.create({ data: { walletAddress: hex(20), role: "CLIENT" } });
    developer = await prisma.user.create({ data: { walletAddress: hex(20), role: "DEVELOPER" } });
    outsider = await prisma.user.create({ data: { walletAddress: hex(20), role: "DEVELOPER" } });
    tokenId = (await prisma.token.create({ data: { name: "Act", symbol: "ACT", address: hex(20), decimals: 6, chainId: ACTIVE_CHAIN_ID } })).id;
  }, 60_000);

  afterAll(async () => {
    await prisma.fundingReservation.deleteMany({ where: { issueId: { in: issueIds } } });
    await prisma.sourceSnapshot.deleteMany({ where: { issueId: { in: issueIds } } });
    await prisma.testCase.deleteMany({ where: { issueId: { in: issueIds } } });
    await prisma.application.deleteMany({ where: { issueId: { in: issueIds } } });
    await prisma.issue.deleteMany({ where: { id: { in: issueIds } } });
    if (tokenId) await prisma.token.deleteMany({ where: { id: tokenId } });
    await prisma.user.deleteMany({ where: { id: { in: [client?.id, developer?.id, outsider?.id].filter(Boolean) } } });
    await prisma.$disconnect();
  }, 60_000);

  const as = (user: unknown, query: string, variables: Record<string, unknown>) => execute(query, { user, db: prisma }, variables);

  async function makeIssue(data: { status?: "OPEN" | "AWAITING_FUNDING" | "IN_PROGRESS"; isDraft?: boolean; expiresAt?: Date; reserved?: boolean }) {
    const issue = await prisma.issue.create({ data: { title: "Availability issue", description: "Checks available actions", category: "BUG_FIX",
      status: data.status ?? "OPEN", isDraft: data.isDraft ?? false, expiresAt: data.expiresAt ?? null, clientId: client.id, tokenId, bountyAmount: "100" } });
    issueIds.push(issue.id);
    const application = await prisma.application.create({ data: { issueId: issue.id, developerId: developer.id } });
    if (data.reserved) await prisma.fundingReservation.create({ data: { issueId: issue.id, applicationId: application.id, clientId: client.id, developerId: developer.id,
      escrowKey: hex(16), escrowIdHash: hex(32), chainId: ACTIVE_CHAIN_ID, contractAddress: hex(20), tokenAddress: hex(20), amountRaw: "100000000", deliveryDeadline: new Date(Date.now() + 86_400_000),
      termsHash: hex(32), termsVersion: 1, expiresAt: new Date(Date.now() + 3_600_000), status: "AWAITING_FUNDING" } });
    return { issueId: issue.id, applicationId: application.id };
  }

  async function reasons(user: unknown, issueId: string) {
    const result = await as(user, actionsQuery, { id: issueId });
    expect(result.errors).toBeUndefined();
    const actions = (result.data?.issue as { availableActions: Array<{ action: Action; reasonDisabled: string | null }> }).availableActions;
    return Object.fromEntries(actions.map((a) => [a.action, a.reasonDisabled])) as Record<Action, string | null>;
  }

  async function expectMatchesMutations(user: { id: string }, ids: { issueId: string }) {
    const advertised = await reasons(user, ids.issueId);
    const own = await prisma.application.findUnique({ where: { issueId_developerId: { issueId: ids.issueId, developerId: user.id } }, select: { id: true } });
    for (const action of ["withdrawApplication", "editCriteria", "setSource", "publish"] as const) {
      const result = await as(user, mutations[action], { issueId: ids.issueId, applicationId: own?.id ?? "no-application" });
      expect({ action, code: result.errors?.[0]?.extensions?.code ?? null }).toEqual({ action, code: advertised[action] });
    }
  }

  it("matches mutations for the owner of a draft", async () => {
    const ids = await makeIssue({ isDraft: true });
    expect(await reasons(client, ids.issueId)).toMatchObject({ editCriteria: null, setSource: null, publish: null, withdrawApplication: "NOT_FOUND" });
    await expectMatchesMutations(client, ids);
  });

  it("matches mutations for an applicant on an open bounty", async () => {
    const ids = await makeIssue({});
    expect(await reasons(developer, ids.issueId)).toMatchObject({ withdrawApplication: null, editCriteria: "FORBIDDEN", publish: "NOT_FOUND" });
    await expectMatchesMutations(developer, ids);
  });

  it("matches mutations while funding is reserved", async () => {
    const ids = await makeIssue({ status: "AWAITING_FUNDING", reserved: true });
    expect(await reasons(developer, ids.issueId)).toMatchObject({ withdrawApplication: "APPLICATION_NOT_WITHDRAWABLE" });
    expect(await reasons(client, ids.issueId)).toMatchObject({ editCriteria: "ISSUE_NOT_EDITABLE", setSource: "ISSUE_NOT_EDITABLE", publish: "ISSUE_NOT_DRAFT" });
    await expectMatchesMutations(developer, ids);
    await expectMatchesMutations(client, ids);
  });

  it("matches mutations for an expired draft and for an outsider", async () => {
    const expired = await makeIssue({ isDraft: true, expiresAt: new Date(Date.now() - 60_000) });
    expect((await reasons(client, expired.issueId)).publish).toBe("ISSUE_EXPIRED");
    await expectMatchesMutations(client, expired);
    const ids = await makeIssue({});
    await expectMatchesMutations(outsider, ids);
  });

  it("reports UNAUTHORIZED to anonymous viewers", async () => {
    const ids = await makeIssue({});
    expect(Object.values(await reasons(null, ids.issueId))).toEqual(["UNAUTHORIZED", "UNAUTHORIZED", "UNAUTHORIZED", "UNAUTHORIZED"]);
  });
});
