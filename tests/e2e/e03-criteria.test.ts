import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { rpc } from "./harness/chain";
import { gql } from "./harness/gql";
import { login } from "./harness/wallet";
let accounts: string[];
beforeAll(async () => { assertTestDatabase(process.env.TEST_DATABASE_URL); accounts = await rpc<string[]>("eth_accounts"); });
test("E3: mock AI criteria, approval, edits and manual deletion", async () => {
  const client = await login(accounts[2]!);
  expect(client.response.status).toBe(200);
  const role = await gql(`mutation { updateProfile(input: { role: "CLIENT" }) { role } }`, {}, client.cookie);
  expect(role.errors).toBeUndefined();
  const { prisma } = await import("@bloody-roar/database");
  try {
    const token = await prisma.token.findFirstOrThrow({ where: { chainId: 31337, symbol: "USDC" } });
    const created = await gql(`mutation($input: CreateIssueInput!) { createIssue(input: $input) { id } }`, { input: { title: "E3 acceptance criteria", description: "A task used to verify AI generated acceptance criteria.", category: "BUG_FIX", bountyAmount: "100", tokenId: token.id } }, client.cookie);
    expect(created.errors).toBeUndefined();
    const issueId = (created.data?.createIssue as { id: string }).id;
    const generated = await gql(`mutation($issue: String!) { generateTestCases(issueId: $issue) { id isApproved source } }`, { issue: issueId }, client.cookie);
    expect(generated.errors).toBeUndefined();
    const cases = generated.data?.generateTestCases as Array<{ id: string; isApproved: boolean }>;
    expect(cases.length).toBeGreaterThanOrEqual(3); expect(cases.every((item) => !item.isApproved)).toBe(true);
    const update = (input: Record<string, unknown>) => gql(`mutation($input: UpdateTestCaseInput!) { updateTestCase(input: $input) { id isApproved } }`, { input }, client.cookie);
    expect((await update({ id: cases[0]!.id, isApproved: true })).errors).toBeUndefined();
    const before = await prisma.issue.findUniqueOrThrow({ where: { id: issueId } });
    expect((await update({ id: cases[0]!.id, title: "Revised approved criterion" })).errors).toBeUndefined();
    expect((await prisma.issue.findUniqueOrThrow({ where: { id: issueId } })).termsVersion).toBe(before.termsVersion + 1);
    const manual = await gql(`mutation($input: CreateTestCaseInput!) { createTestCase(input: $input) { id } }`, { input: { issueId, title: "Manual criterion", description: "A manual acceptance criterion", given: "a valid user", when: "they submit work", then: "the result is checked" } }, client.cookie);
    expect(manual.errors).toBeUndefined();
    const id = (manual.data?.createTestCase as { id: string }).id;
    expect((await gql(`mutation($id: ID!) { deleteTestCase(id: $id) }`, { id }, client.cookie)).data?.deleteTestCase).toBe(true);
    expect(await prisma.aILog.count({ where: { issueId, task: "TESTGEN" } })).toBe(1);
  } finally { await prisma.$disconnect(); }
}, 120_000);
