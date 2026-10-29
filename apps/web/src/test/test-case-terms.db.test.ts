// @vitest-environment node
import { randomBytes, createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { prisma } from "@bloody-roar/database";
import { computeTermsHash, keccakUtf8, type Hex } from "@bloody-roar/shared/escrow";
import { execute, loadSchema } from "./graphql-execute";
const mock = vi.hoisted(() => ({ token: "" }));
vi.mock("../lib/escrow/token", () => ({ readEscrowToken: async () => mock.token }));
const address = () => `0x${randomBytes(20).toString("hex")}`;
const UPDATE = `mutation($input: UpdateTestCaseInput!) { updateTestCase(input: $input) { id isApproved given } }`;
const DELETE = `mutation($id: ID!) { deleteTestCase(id: $id) }`;
const SELECT = `mutation($issue: ID!, $application: ID!, $deadline: String!) { selectDeveloper(issueId: $issue, applicationId: $application, deliveryDeadline: $deadline) { id termsVersion termsHash } }`;
describe.skipIf(!process.env.TEST_DATABASE_URL)("acceptance criteria terms on the test database", () => {
  let client: Awaited<ReturnType<typeof prisma.user.create>>, developer: typeof client, issueId = "", tokenId = "", applicationId = "";
  beforeAll(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    vi.stubEnv("CHAIN_ID", "31337"); vi.stubEnv("ESCROW_ADDRESS", address()); await loadSchema();
    client = await prisma.user.create({ data: { walletAddress: address(), role: "CLIENT" } });
    developer = await prisma.user.create({ data: { walletAddress: address(), role: "DEVELOPER" } });
    const token = await prisma.token.create({ data: { name: "Terms test", symbol: "TRM", address: address(), decimals: 6, chainId: 31337 } }); tokenId = token.id; mock.token = token.address;
    const issue = await prisma.issue.create({ data: { title: "Test terms", description: "Verify acceptance criteria terms", category: "BUG_FIX", clientId: client.id, tokenId, bountyAmount: "100", requiredSkills: [] } }); issueId = issue.id;
    applicationId = (await prisma.application.create({ data: { issueId, developerId: developer.id, status: "PENDING" } })).id;
  }, 60_000);
  afterAll(async () => {
    if (issueId) {
      await prisma.notification.deleteMany({ where: { userId: { in: [client.id, developer.id] } } });
      await prisma.fundingReservation.deleteMany({ where: { issueId } });
      await prisma.issue.deleteMany({ where: { id: issueId } });
    }
    if (tokenId) await prisma.token.deleteMany({ where: { id: tokenId } });
    await prisma.user.deleteMany({ where: { id: { in: [client.id, developer.id] } } });
    await prisma.$disconnect();
  }, 60_000);
  it("versions approved changes, rejects active reservations and prevents stale selected terms", async () => {
    const data = { issueId, title: "Valid test", description: "A meaningful test case", given: "given input", when: "when action", then: "then result" };
    const criterion = await prisma.testCase.create({ data });
    const run = (query: string, vars: Record<string, unknown>) => execute(query, { user: client, db: prisma }, vars);
    expect((await run(UPDATE, { input: { id: criterion.id, given: "unapproved draft change" } })).errors).toBeUndefined();
    expect((await prisma.issue.findUniqueOrThrow({ where: { id: issueId } })).termsVersion).toBe(1);
    expect((await run(UPDATE, { input: { id: criterion.id, isApproved: true } })).errors).toBeUndefined();
    expect((await prisma.issue.findUniqueOrThrow({ where: { id: issueId } })).termsVersion).toBe(2);
    expect((await run(UPDATE, { input: { id: criterion.id, clientNotes: "note only" } })).errors).toBeUndefined();
    expect((await prisma.issue.findUniqueOrThrow({ where: { id: issueId } })).termsVersion).toBe(2);
    expect((await run(UPDATE, { input: { id: criterion.id, given: "given revised input", isApproved: true } })).errors).toBeUndefined();
    expect((await prisma.issue.findUniqueOrThrow({ where: { id: issueId } })).termsVersion).toBe(3);
    expect((await run(DELETE, { id: criterion.id })).errors).toBeUndefined();
    expect((await prisma.issue.findUniqueOrThrow({ where: { id: issueId } })).termsVersion).toBe(4);
    const replacement = await prisma.testCase.create({ data: { ...data, isApproved: true } });
    const deadline = new Date(Date.now() + 30 * 86400_000);
    const key = `reservation-${issueId}`;
    const active = await prisma.fundingReservation.create({ data: { issueId, applicationId, clientId: client.id, developerId: developer.id, escrowKey: key,
      escrowIdHash: keccakUtf8(key), chainId: 31337, contractAddress: process.env.ESCROW_ADDRESS!, tokenAddress: mock.token, amountRaw: "100000000", deliveryDeadline: deadline,
      termsHash: `0x${"ab".repeat(32)}`, termsVersion: 4, expiresAt: new Date(Date.now() + 3600_000), status: "AWAITING_FUNDING" } });
    expect((await run(UPDATE, { input: { id: replacement.id, given: "blocked change", isApproved: true } })).errors?.[0]?.extensions?.code).toBe("ISSUE_NOT_EDITABLE");
    expect((await run(DELETE, { id: replacement.id })).errors?.[0]?.extensions?.code).toBe("ISSUE_NOT_EDITABLE");
    expect((await run(`mutation($input: CreateTestCaseInput!) { createTestCase(input: $input) { id } }`, { input: data })).errors?.[0]?.extensions?.code).toBe("ISSUE_NOT_EDITABLE");
    await prisma.fundingReservation.delete({ where: { id: active.id } });
    const [updated, selected] = await Promise.all([
      run(UPDATE, { input: { id: replacement.id, given: "concurrent updated input", isApproved: true } }),
      run(SELECT, { issue: issueId, application: applicationId, deadline: deadline.toISOString() }),
    ]);
    expect(!updated.errors || !selected.errors).toBe(true);
    const reservation = await prisma.fundingReservation.findFirst({ where: { issueId, status: "AWAITING_FUNDING" } });
    if (reservation) {
      const issue = await prisma.issue.findUniqueOrThrow({ where: { id: issueId } });
      const current = await prisma.testCase.findUniqueOrThrow({ where: { id: replacement.id } });
      expect(reservation.termsVersion).toBe(issue.termsVersion);
      expect(reservation.termsHash).toBe(computeTermsHash({ issueId, termsVersion: issue.termsVersion, title: issue.title,
        descriptionSha256: createHash("sha256").update(issue.description).digest("hex"), category: issue.category,
        acceptanceCriteria: [{ id: current.id, text: `Given ${current.given}, when ${current.when}, then ${current.then}`, approved: current.isApproved }],
        token: mock.token as Hex, amountRaw: "100000000", deliveryDeadline: String(Math.floor(deadline.getTime() / 1000)), githubRepo: "" }));
    }
  }, 60_000);
});
