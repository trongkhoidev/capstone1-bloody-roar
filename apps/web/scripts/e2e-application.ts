// apps/web/scripts/e2e-application.ts
// E2E Test for Application Module: Apply -> Reject -> AssignDeveloper -> Withdraw
import { PrivateKeyWallet } from "@thirdweb-dev/wallets";
import { signLoginPayload } from "@thirdweb-dev/auth";
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

const base = process.env.E2E_BASE_URL || "http://localhost:4000";

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
  return res.json();
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
  const cookie = loginRes.headers.get("set-cookie")?.split(";")[0]?.replace("bloody_token=", "") ?? "";
  const body = await loginRes.json();
  const token = body.token || cookie;
  assert(token, "Missing token");
  return { token, id: body.user.id };
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
    where: { title: { startsWith: "E2E App Test" } },
  });

  const token = await prisma.token.findFirst({
    where: { isActive: true },
  });
  assert(token, "Test token not found");

  // 0. Setup users & roles
  console.log("0. Logging in and setting roles...");
  const client = await login(TEST_CLIENT_KEY);
  const dev1 = await login(TEST_DEV1_KEY);
  const dev2 = await login(TEST_DEV2_KEY);

  await setRole(client.id, "CLIENT");
  await setRole(dev1.id, "DEVELOPER");
  await setRole(dev2.id, "DEVELOPER");

  // 1. Client creates an issue
  console.log("1. Client creates an issue...");
  const createIssueRes = await gql(
    `mutation($input: CreateIssueInput!) {
      createIssue(input: $input) { id, title, status }
    }`,
    client.token,
    {
      input: {
        title: "E2E App Test - Issue",
        description: "Need someone to solve this task urgently with complete tests.",
        category: "SMART_CONTRACT",
        bountyAmount: 100,
        tokenId: token.id,
      },
    }
  );
  if (createIssueRes.errors) console.error("createIssue errors:", JSON.stringify(createIssueRes.errors, null, 2));
  const issueId = createIssueRes.data?.createIssue?.id;
  assert(issueId, "Issue creation failed");

  // 2. Dev 1 applies
  console.log("2. Dev 1 applies...");
  const dev1AppRes = await gql(
    `mutation($input: ApplyToIssueInput!) {
      applyToIssue(input: $input) { id, status }
    }`,
    dev1.token,
    {
      input: {
        issueId,
        message: "I can fix this",
      },
    }
  );
  if (dev1AppRes.errors) console.error("applyToIssue errors:", JSON.stringify(dev1AppRes.errors, null, 2));
  assert.strictEqual(dev1AppRes.data?.applyToIssue?.status, "PENDING");
  const app1Id = dev1AppRes.data.applyToIssue.id;

  // 3. Dev 1 applies again -> Error
  console.log("3. Dev 1 applies again -> expect ALREADY_APPLIED...");
  const dev1AppRes2 = await gql(
    `mutation($input: ApplyToIssueInput!) {
      applyToIssue(input: $input) { id }
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
    "ALREADY_APPLIED",
    "Should not apply twice"
  );

  // 4. Dev 2 applies
  console.log("4. Dev 2 applies...");
  const dev2AppRes = await gql(
    `mutation($input: ApplyToIssueInput!) {
      applyToIssue(input: $input) { id, status }
    }`,
    dev2.token,
    {
      input: {
        issueId,
        message: "I am better",
      },
    }
  );
  const app2Id = dev2AppRes.data?.applyToIssue?.id;
  assert(app2Id);

  // 5. Client checks applications
  console.log("5. Client queries applications...");
  const appsRes = await gql(
    `query($issueId: String!) {
      applications(issueId: $issueId) { id status }
    }`,
    client.token,
    { issueId }
  );
  assert.strictEqual(appsRes.data?.applications?.length, 2, "Should see 2 apps");

  // 6. Client rejects Dev 2
  console.log("6. Client rejects Dev 2...");
  const rejectRes = await gql(
    `mutation($appId: ID!) {
      rejectApplication(id: $appId) { id status }
    }`,
    client.token,
    { appId: app2Id }
  );
  assert.strictEqual(rejectRes.data?.rejectApplication?.status, "REJECTED");

  // 7. Client assigns Dev 1
  console.log("7. Client assigns Dev 1...");
  const assignRes = await gql(
    `mutation($input: AssignDeveloperInput!) {
      assignDeveloper(input: $input) { 
        id
        status
        developerId
      }
    }`,
    client.token,
    { input: { issueId, applicationId: app1Id } }
  );
  assert.strictEqual(assignRes.data?.assignDeveloper?.status, "IN_PROGRESS");
  assert.strictEqual(assignRes.data?.assignDeveloper?.developerId, dev1.id);

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
