// apps/web/scripts/e2e-application.ts
// E2E test cho Module Application:
// 1. Login Client, tạo 1 Issue.
// 2. Login Dev, apply (createApplication).
// 3. Dev apply lại lần 2 -> lỗi BAD_REQUEST (đã apply).
// 4. Login Dev 2, apply.
// 5. Client check applications cho Issue -> thấy 2 apps.
// 6. Client reject Dev 2 -> Dev 2 bị REJECTED.
// 7. Client accept Dev 1 -> Dev 1 ACCEPTED, Issue IN_PROGRESS, các Dev khác bị REJECTED.
// 8. Dọn dẹp.

import { signLoginPayload } from "@thirdweb-dev/auth";
import { PrivateKeyWallet } from "@thirdweb-dev/wallets";
import { prisma } from "@bloody-roar/database";
import assert from "node:assert";

import "../src/lib/env";

const TEST_CLIENT_KEY =
  process.env.TEST_CLIENT_KEY ||
  "0x0000000000000000000000000000000000000000000000000000000000000001";
const TEST_DEV1_KEY =
  process.env.TEST_DEV1_KEY ||
  "0x0000000000000000000000000000000000000000000000000000000000000002";
const TEST_DEV2_KEY =
  process.env.TEST_DEV2_KEY ||
  "0x0000000000000000000000000000000000000000000000000000000000000003";
  
const base = "http://localhost:3000";

async function gql<T = any>(
  query: string,
  token?: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${base}/api/graphql`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, ...(variables ? { variables } : {}) }),
  });
  const data = await res.json();
  return data;
}

async function login(privateKey: string): Promise<{ token: string; id: string }> {
  const wallet = new PrivateKeyWallet(privateKey);
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
  const { token, user } = await loginRes.json();
  assert(token, "Missing token");
  return { token, id: user.id };
}

async function setRole(userId: string, role: "CLIENT" | "DEVELOPER") {
  await prisma.user.update({
    where: { id: userId },
    data: { role },
  });
}

async function run() {
  console.log("🩸 Starting E2E Application Module Test...");

  // Dọn issue test sót từ lần chạy trước
  await prisma.issue.deleteMany({
    where: { title: { startsWith: "E2E app test bounty" } },
  });

  const usdc = await prisma.token.findFirst({ where: { symbol: "USDC" } });
  assert(usdc, "USDC token not found — run `bun run db:seed` first");

  console.log("0. Logging in and setting roles...");
  const client = await login(TEST_CLIENT_KEY);
  await setRole(client.id, "CLIENT");
  
  const dev1 = await login(TEST_DEV1_KEY);
  await setRole(dev1.id, "DEVELOPER");
  
  const dev2 = await login(TEST_DEV2_KEY);
  await setRole(dev2.id, "DEVELOPER");

  // 1. Create Issue (Client)
  console.log("1. Client creates an issue...");
  const createIssueRes = await gql(
    `mutation($input: CreateIssueInput!) {
      createIssue(input: $input) { id, status }
    }`,
    client.token,
    {
      input: {
        title: "E2E app test bounty",
        description: "Testing application flow for the new module. This description is now longer than 30 characters.",
        category: "BUG_FIX",
        bountyAmount: 500,
        tokenId: usdc.id,
      },
    }
  );
  if (createIssueRes.errors) console.error("createIssue errors:", JSON.stringify(createIssueRes.errors, null, 2));
  const issueId = createIssueRes.data?.createIssue?.id;
  assert(issueId, "Issue creation failed");

  // 2. Dev 1 applies
  console.log("2. Dev 1 applies...");
  const dev1AppRes = await gql(
    `mutation($input: MutationCreateApplicationInput!) {
      createApplication(input: $input) { id, status }
    }`,
    dev1.token,
    {
      input: {
        issueId,
        message: "I can fix this",
      },
    }
  );
  if (dev1AppRes.errors) console.error("createApplication errors:", JSON.stringify(dev1AppRes.errors, null, 2));
  assert.strictEqual(dev1AppRes.data?.createApplication?.status, "PENDING");
  const app1Id = dev1AppRes.data.createApplication.id;

  // 3. Dev 1 applies again -> Error
  console.log("3. Dev 1 applies again -> expect BAD_REQUEST...");
  const dev1AppRes2 = await gql(
    `mutation($input: MutationCreateApplicationInput!) {
      createApplication(input: $input) { id }
    }`,
    dev1.token,
    {
      input: {
        issueId,
        message: "Second try",
      },
    }
  );
  assert.strictEqual(
    dev1AppRes2.errors?.[0]?.extensions?.code,
    "BAD_REQUEST",
    "Should not apply twice"
  );

  // 4. Dev 2 applies
  console.log("4. Dev 2 applies...");
  const dev2AppRes = await gql(
    `mutation($input: MutationCreateApplicationInput!) {
      createApplication(input: $input) { id, status }
    }`,
    dev2.token,
    {
      input: {
        issueId,
        message: "I am better",
      },
    }
  );
  const app2Id = dev2AppRes.data.createApplication.id;
  assert(app2Id);

  // 5. Client checks applications
  console.log("5. Client queries applications...");
  const appsRes = await gql(
    `query($issueId: ID!) {
      applications(issueId: $issueId) { id }
    }`,
    client.token,
    { issueId }
  );
  assert.strictEqual(appsRes.data.applications.length, 2, "Should see 2 apps");

  // 6. Client rejects Dev 2
  console.log("6. Client rejects Dev 2...");
  const rejectRes = await gql(
    `mutation($appId: ID!) {
      rejectApplication(applicationId: $appId) { status }
    }`,
    client.token,
    { appId: app2Id }
  );
  assert.strictEqual(rejectRes.data.rejectApplication.status, "REJECTED");

  // 7. Client accepts Dev 1
  console.log("7. Client accepts Dev 1...");
  const acceptRes = await gql(
    `mutation($appId: ID!) {
      acceptApplication(applicationId: $appId) { 
        status
        issue { status }
      }
    }`,
    client.token,
    { appId: app1Id }
  );
  assert.strictEqual(acceptRes.data.acceptApplication.status, "ACCEPTED");
  assert.strictEqual(acceptRes.data.acceptApplication.issue.status, "IN_PROGRESS");

  console.log("8. Clean up...");
  await prisma.issue.delete({ where: { id: issueId } });

  console.log("✅ E2E Application test passed!");
}

run()
  .catch((e) => {
    console.error("❌ E2E Application test failed:", e);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
