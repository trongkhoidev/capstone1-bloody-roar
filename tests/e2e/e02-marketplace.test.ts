import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { rpc } from "./harness/chain";
import { gql } from "./harness/gql";
import { login } from "./harness/wallet";
let accounts: string[];
beforeAll(async () => { assertTestDatabase(process.env.TEST_DATABASE_URL); accounts = await rpc<string[]>("eth_accounts"); });
test("E2: marketplace and one view per hour per viewer", async () => {
  const client = await login(accounts[2]!), outsider = await login(accounts[7]!);
  expect(client.response.status).toBe(200); expect(outsider.response.status).toBe(200);
  const { prisma } = await import("@bloody-roar/database");
  try {
    const token = await prisma.token.findFirstOrThrow({ where: { chainId: 31337, symbol: "USDC", isActive: true } });
    const title = `E2 marketplace ${Date.now()}`;
    const created = await gql(`mutation($input: CreateIssueInput!) { createIssue(input: $input) { id status bountyAmountRaw } }`, { input: { title, description: "A local marketplace issue for end to end verification.", category: "BUG_FIX", bountyAmount: "100", tokenId: token.id, deliveryDeadline: new Date(Date.now() + 30 * 86400_000).toISOString() } }, client.cookie);
    expect(created.errors).toBeUndefined();
    const issue = created.data?.createIssue as { id: string; status: string; bountyAmountRaw: string };
    expect(issue.status).toBe("OPEN"); expect(issue.bountyAmountRaw).toBe("100000000");
    const list = await gql(`query($search: String!) { issues(search: $search) { edges { node { id } } } }`, { search: title }, outsider.cookie);
    expect(list.errors).toBeUndefined();
    expect((list.data?.issues as { edges: Array<{ node: { id: string } }> }).edges.some((edge) => edge.node.id === issue.id)).toBe(true);
    const record = () => gql(`mutation($id: ID!) { recordIssueView(issueId: $id) }`, { id: issue.id }, outsider.cookie);
    const first = await Promise.all([record(), record()]);
    expect(first.every((result) => !result.errors)).toBe(true);
    expect((await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } })).viewCount).toBe(1);
    const viewer = await prisma.user.findUniqueOrThrow({ where: { walletAddress: accounts[7]!.toLowerCase() } });
    await prisma.issueView.update({ where: { issueId_userId: { issueId: issue.id, userId: viewer.id } }, data: { viewedAt: new Date(Date.now() - 3600_001) } });
    expect((await record()).errors).toBeUndefined();
    expect((await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } })).viewCount).toBe(2);
  } finally { await prisma.$disconnect(); }
}, 120_000);
