// apps/web/scripts/e2e-issue.ts
// E2E test cho Homepage backend (B-1 · B-2 · B-3):
// 1. Login bằng ví test
// 2. B-3 createIssue: hợp lệ / thiếu auth / sai validate / sai tokenId
// 3. B-2 issue(id): chi tiết + viewCount tăng
// 4. B-1 issues: filter + sort + cursor pagination
// 5. Dọn dẹp: xoá issue vừa tạo

import { signLoginPayload } from "@thirdweb-dev/auth";
import { PrivateKeyWallet } from "@thirdweb-dev/wallets";
import { prisma } from "@bloody-roar/database";
import assert from "node:assert";

import "../src/lib/env";

const TEST_CLIENT_KEY =
  process.env.TEST_CLIENT_KEY ||
  "0x0000000000000000000000000000000000000000000000000000000000000001";
const base = "http://localhost:4000";

async function gql<T = any>(
  query: string,
  cookie?: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${base}/api/graphql`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, ...(variables ? { variables } : {}) }),
  });
  return res.json();
}

async function login(): Promise<string> {
  const wallet = new PrivateKeyWallet(TEST_CLIENT_KEY);
  const address = await wallet.getAddress();
  const nonceRes = await fetch(`${base}/api/auth/nonce?address=${address}`);
  assert(nonceRes.ok, "Failed to fetch nonce");
  const payload = await nonceRes.json();
  const signed = await signLoginPayload({ payload, wallet });
  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify(signed),
    headers: { "Content-Type": "application/json" },
  });
  assert.strictEqual(loginRes.status, 200, "Login failed");
  const cookie = loginRes.headers.get("set-cookie")?.split(";")[0] ?? "";
  assert(cookie.startsWith("bloody_token="), "Missing HttpOnly session cookie");
  return cookie;
}

async function run() {
  console.log("🩸 Starting E2E Issue Module Test...");

  // Dọn issue test sót từ lần chạy trước (script fail giữa chừng)
  await prisma.issue.deleteMany({
    where: { title: { startsWith: "E2E test bounty" } },
  });

  // Lấy 1 token USDC từ seed
  const usdc = await prisma.token.findFirst({ where: { symbol: "USDC" } });
  assert(usdc, "USDC token not found — run `bun run db:seed` first");

  console.log("0. Logging in...");
  const token = await login();
  const clientAddress = (await new PrivateKeyWallet(TEST_CLIENT_KEY).getAddress()).toLowerCase();
  const client = await prisma.user.findUnique({ where: { walletAddress: clientAddress }, select: { role: true } });
  assert(client, "Test client account was not created");
  const originalRole = client.role;
  const switchedRole = await gql(
    `mutation($input: UpdateProfileInput!) { updateProfile(input: $input) { role } }`,
    token,
    { input: { role: "CLIENT" } }
  );
  assert.strictEqual(switchedRole.data?.updateProfile?.role, "CLIENT");

  // -------------------------------------------------------------------
  // B-3.1 — createIssue KHÔNG auth → UNAUTHORIZED
  // -------------------------------------------------------------------
  console.log("1. createIssue without auth → expect UNAUTHORIZED...");
  const noAuth = await gql(
    `mutation($input: CreateIssueInput!) {
      createIssue(input: $input) { id }
    }`,
    undefined,
    {
      input: {
        title: "Should not be created at all",
        description: "This description is long enough for validation.",
        category: "BUG_FIX",
        bountyAmount: 100,
        tokenId: usdc.id,
      },
    }
  );
  assert.strictEqual(
    noAuth.errors?.[0]?.extensions?.code,
    "UNAUTHORIZED",
    "Expected UNAUTHORIZED without auth"
  );

  // -------------------------------------------------------------------
  // B-3.2 — createIssue input SAI validate → BAD_USER_INPUT
  // -------------------------------------------------------------------
  console.log("2. createIssue with short title → expect BAD_USER_INPUT...");
  const badInput = await gql(
    `mutation($input: CreateIssueInput!) {
      createIssue(input: $input) { id }
    }`,
    token,
    {
      input: {
        title: "short", // < 10 ký tự
        description: "This description is long enough for validation.",
        category: "BUG_FIX",
        bountyAmount: 100,
        tokenId: usdc.id,
      },
    }
  );
  assert.strictEqual(
    badInput.errors?.[0]?.extensions?.code,
    "BAD_USER_INPUT",
    "Expected BAD_USER_INPUT for short title"
  );

  // -------------------------------------------------------------------
  // B-3.3 — createIssue với tokenId rác → INVALID_TOKEN
  // -------------------------------------------------------------------
  console.log("3. createIssue with bad tokenId → expect INVALID_TOKEN...");
  const badToken = await gql(
    `mutation($input: CreateIssueInput!) {
      createIssue(input: $input) { id }
    }`,
    token,
    {
      input: {
        title: "Valid title for this test",
        description: "This description is long enough for validation.",
        category: "BUG_FIX",
        bountyAmount: 100,
        tokenId: "nonexistent-token-id",
      },
    }
  );
  assert.strictEqual(
    badToken.errors?.[0]?.extensions?.code,
    "INVALID_TOKEN",
    "Expected INVALID_TOKEN for unknown token"
  );

  // -------------------------------------------------------------------
  // B-3.4 — createIssue HỢP LỆ → tạo thành công
  // -------------------------------------------------------------------
  console.log("4. createIssue valid input → expect success...");
  const created = await gql(
    `mutation($input: CreateIssueInput!) {
      createIssue(input: $input) {
        id title status category bountyAmount
        requiredSkills difficulty timeEstimate
        client { walletAddress }
        token { symbol }
        applicationCount
        isDraft
      }
    }`,
    token,
    {
      input: {
        title: "E2E test bounty — build login page UI",
        description:
          "This is an E2E test bounty created by scripts/e2e-issue.ts. Safe to delete.",
        category: "UI_UX",
        bountyAmount: 250,
        tokenId: usdc.id,
        requiredSkills: ["React", "Next.js"],
        difficulty: "Medium",
        timeEstimate: "2-3 days",
      },
    }
  );
  const createdIssue = created.data?.createIssue;
  assert(createdIssue?.id, "createIssue should return the created issue");
  assert.strictEqual(createdIssue.status, "OPEN");
  assert.strictEqual(createdIssue.category, "UI_UX");
  assert.strictEqual(createdIssue.bountyAmount, 250);
  assert.strictEqual(createdIssue.isDraft, false);
  assert.deepStrictEqual(createdIssue.requiredSkills, ["React", "Next.js"]);
  assert.strictEqual(createdIssue.token.symbol, "USDC");
  assert.strictEqual(createdIssue.applicationCount, 0);
  console.log(`   ✓ Created: ${createdIssue.id}`);
  const createdId = createdIssue.id;

  // -------------------------------------------------------------------
  // B-2 — issue(id): chi tiết + viewCount tăng dần
  // -------------------------------------------------------------------
  console.log("5. issue(id) detail + viewCount increment...");
  const view1 = await gql(
    `query($id: ID!) { issue(id: $id) { id viewCount title client { name } token { symbol } } }`,
    undefined,
    { id: createdId }
  );
  const view2 = await gql(
    `query($id: ID!) { issue(id: $id) { id viewCount } }`,
    undefined,
    { id: createdId }
  );
  assert.strictEqual(view1.data.issue.viewCount, 1, "viewCount should be 1 on first view");
  assert.strictEqual(view2.data.issue.viewCount, 2, "viewCount should increment");

  const notFound = await gql(`query { issue(id: "does-not-exist") { id } }`);
  assert.strictEqual(notFound.data.issue, null, "issue(id) should be null if not found");

  // -------------------------------------------------------------------
  // B-1 — issues: filter + search + sort + pagination
  // -------------------------------------------------------------------
  console.log("6. issues filter by category UI_UX...");
  const byCategory = await gql(
    `{ issues(category: UI_UX) { totalCount edges { node { id category } } } }`
  );
  assert(
    byCategory.data.issues.edges.every(
      (e: any) => e.node.category === "UI_UX"
    ),
    "All filtered issues should be UI_UX"
  );
  assert(
    byCategory.data.issues.totalCount >= 2,
    "Should include the new UI_UX issue + seed issue"
  );

  console.log("7. issues search 'E2E test bounty'...");
  const bySearch = await gql(
    `{ issues(search: "E2E test bounty") { totalCount edges { node { id } } } }`
  );
  assert.strictEqual(
    bySearch.data.issues.totalCount,
    1,
    "Search should match exactly the new issue"
  );

  console.log("8. issues sort by BOUNTY_AMOUNT ASC...");
  const byBounty = await gql(
    `{ issues(sortBy: BOUNTY_AMOUNT, sortOrder: ASC, first: 100) { edges { node { id bountyAmount } } } }`
  );
  const bounties = byBounty.data.issues.edges.map((e: any) => e.node.bountyAmount);
  const sorted = [...bounties].sort((a: number, b: number) => a - b);
  assert.deepStrictEqual(bounties, sorted, "Bounties should be sorted ASC");

  console.log("9. issues cursor pagination (first: 2 → page 2)...");
  const page1 = await gql(
    `{ issues(first: 2, sortBy: BOUNTY_AMOUNT, sortOrder: ASC) { edges { node { id bountyAmount } } pageInfo { hasNextPage endCursor } } }`
  );
  assert.strictEqual(page1.data.issues.edges.length, 2, "Page 1 should have 2 items");
  assert.strictEqual(page1.data.issues.pageInfo.hasNextPage, true, "Page 1 should have next");
  const cursor = page1.data.issues.pageInfo.endCursor;
  assert(cursor, "endCursor should exist");

  const page2 = await gql(
    `query($after: String) { issues(first: 2, after: $after, sortBy: BOUNTY_AMOUNT, sortOrder: ASC) { edges { node { id bountyAmount } } pageInfo { hasNextPage hasPreviousPage } } }`,
    undefined,
    { after: cursor }
  );
  const p1Last =
    page1.data.issues.edges[page1.data.issues.edges.length - 1].node.bountyAmount;
  const p2First = page2.data.issues.edges[0]?.node?.bountyAmount;
  assert(
    p2First >= p1Last,
    "Page 2 first bounty should be >= page 1 last bounty (không trùng lặp)"
  );
  assert.strictEqual(
    page2.data.issues.pageInfo.hasPreviousPage,
    true,
    "Page 2 should have previous"
  );

  // -------------------------------------------------------------------
  // Dọn dẹp — xoá issue test
  // -------------------------------------------------------------------
  console.log("10. Cleaning up test issue...");
  await prisma.issue.delete({ where: { id: createdId } }).catch(() => {});
  const afterCleanup = await prisma.issue.findUnique({ where: { id: createdId } });
  assert(!afterCleanup, "Test issue should be deleted");
  await prisma.user.update({ where: { walletAddress: clientAddress }, data: { role: originalRole } });
  await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { Cookie: token } });
  await prisma.$disconnect();

  console.log("\n✅ All E2E Issue Module assertions passed!");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ E2E Issue Test Failed:", err);
  process.exit(1);
});
