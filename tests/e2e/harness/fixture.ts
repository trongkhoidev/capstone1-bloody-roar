import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { rpc } from "./chain";
import { gqlAs } from "./gql";

export async function fixture() {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DIRECT_URL = process.env.TEST_DATABASE_URL;
  const { prisma } = await import("@bloody-roar/database");
  const accounts = await rpc<string[]>("eth_accounts");
  const makeUser = (index: number, role: "CLIENT" | "DEVELOPER" | "ADMIN") => prisma.user.upsert({ where: { walletAddress: accounts[index]!.toLowerCase() }, create: { walletAddress: accounts[index]!.toLowerCase(), role }, update: { role } });
  const client = await makeUser(2, "CLIENT");
  const developer = await makeUser(3, "DEVELOPER");
  const rival = await makeUser(4, "DEVELOPER");
  const admin = await makeUser(1, "ADMIN");
  const outsider = await makeUser(7, "DEVELOPER");
  const token = await prisma.token.findFirstOrThrow({ where: { chainId: 31337, symbol: "USDC", isActive: true } });
  const issueResult = await gqlAs(client, `mutation($input: CreateIssueInput!) { createIssue(input: $input) { id } }`, { input: { title: `Fixture ${crypto.randomUUID()}`, description: "An isolated bounty for local escrow integration tests.", category: "BUG_FIX", bountyAmount: "100", tokenId: token.id } });
  if (issueResult.errors?.length) throw new Error(`Create issue: ${issueResult.errors[0]?.message}`);
  const issueId = (issueResult.data?.createIssue as { id: string }).id;
  const criterion = await gqlAs(client, `mutation($input: CreateTestCaseInput!) { createTestCase(input: $input) { id } }`, { input: { issueId, title: "Acceptance criterion", description: "Check that the task is complete.", given: "a task", when: "it is completed", then: "the result is correct" } });
  if (criterion.errors?.length) throw new Error(`Create criterion: ${criterion.errors[0]?.message}`);
  const criterionId = (criterion.data?.createTestCase as { id: string }).id;
  const approval = await gqlAs(client, `mutation($input: UpdateTestCaseInput!) { updateTestCase(input: $input) { id } }`, { input: { id: criterionId, isApproved: true } });
  if (approval.errors?.length) throw new Error(`Approve criterion: ${approval.errors[0]?.message}`);
  const apply = (actor: typeof developer) => gqlAs(actor, `mutation($input: ApplyToIssueInput!) { applyToIssue(input: $input) { id status } }`, { input: { issueId, message: "I can complete this task." } });
  const a = await apply(developer);
  const b = await apply(rival);
  if (a.errors?.length || b.errors?.length) throw new Error(`Apply: ${a.errors?.[0]?.message ?? b.errors?.[0]?.message}`);
  const applicationId = (a.data?.applyToIssue as { id: string }).id, rivalApplicationId = (b.data?.applyToIssue as { id: string }).id;
  const deadline = new Date(Date.now() + 5 * 86_400_000).toISOString();
  const select = (id: string) => gqlAs(client, `mutation($issue: ID!, $application: ID!, $deadline: String!) { selectDeveloper(issueId: $issue, applicationId: $application, deliveryDeadline: $deadline) { id status escrowKey termsHash amountRaw deliveryDeadline } }`, { issue: issueId, application: id, deadline });
  return { prisma, accounts, client, developer, rival, admin, outsider, token, issueId, applicationId, rivalApplicationId, deadline, select, apply };
}
