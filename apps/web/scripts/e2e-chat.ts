import { signLoginPayload } from "@thirdweb-dev/auth";
import { PrivateKeyWallet } from "@thirdweb-dev/wallets";
import { prisma } from "@bloody-roar/database";
import assert from "node:assert";
import { io } from "socket.io-client";

import "../src/lib/env";

const base = "http://localhost:4000";

const TEST_CLIENT_KEY = "0x0000000000000000000000000000000000000000000000000000000000000001";
const TEST_DEV_KEY = "0x0000000000000000000000000000000000000000000000000000000000000002";
const TEST_STRANGER_KEY = "0x0000000000000000000000000000000000000000000000000000000000000003";

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

async function login(privateKey: string): Promise<string> {
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
  const cookie = loginRes.headers.get("set-cookie")?.split(";")[0] ?? "";
  assert(cookie.startsWith("bloody_token="), "Missing HttpOnly session cookie");
  return cookie;
}

function connectSocket(cookie?: string) {
  return new Promise<any>((resolve, reject) => {
    const socket = io(base, { extraHeaders: cookie ? { Cookie: cookie } : {} });
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", (err) => reject(err));
  });
}

async function run() {
  console.log("🩸 Starting E2E Chat Test...");

  // Dọn dẹp test cũ
  await prisma.issue.deleteMany({
    where: { title: "E2E Chat Test Issue" },
  });

  const clientWallet = new PrivateKeyWallet(TEST_CLIENT_KEY);
  const devWallet = new PrivateKeyWallet(TEST_DEV_KEY);
  const strangerWallet = new PrivateKeyWallet(TEST_STRANGER_KEY);
  const fixtureAddresses = await Promise.all(
    [clientWallet, devWallet, strangerWallet].map(async (wallet) =>
      (await wallet.getAddress()).toLowerCase()
    )
  );
  const originalRoles = await prisma.user.findMany({
    where: { walletAddress: { in: fixtureAddresses } },
    select: { walletAddress: true, role: true },
  });

  // 1. Login 3 ví
  console.log("1. Logging in...");
  const clientToken = await login(TEST_CLIENT_KEY);
  const devToken = await login(TEST_DEV_KEY);
  const strangerToken = await login(TEST_STRANGER_KEY);
  console.log("   ✓ Tokens generated");

  // The seeded test client wallet defaults to DEVELOPER. Switch roles through
  // the same profile mutation used by the UI, then restore fixture roles below.
  for (const [cookie, role] of [[clientToken, "CLIENT"], [devToken, "DEVELOPER"], [strangerToken, "DEVELOPER"]] as const) {
    const result = await gql(
      `mutation($input: UpdateProfileInput!) { updateProfile(input: $input) { role } }`,
      cookie,
      { input: { role } }
    );
    assert.strictEqual(result.data?.updateProfile?.role, role, `Could not set test account role to ${role}`);
  }

  // Tạo Issue để test
  const usdc = await prisma.token.findFirst({ where: { symbol: "USDC" } });
  assert(usdc, "USDC token not found");

  const created = await gql(
    `mutation($input: CreateIssueInput!) {
      createIssue(input: $input) { id }
    }`,
    clientToken,
    {
      input: {
        title: "E2E Chat Test Issue",
        description: "Test chat functionality. This description is long enough.",
        category: "UI_UX",
        bountyAmount: 100,
        tokenId: usdc.id,
      },
    }
  );
  
  assert(created.data?.createIssue?.id, `createIssue failed: ${JSON.stringify(created.errors ?? created)}`);
  const issueId = created.data.createIssue.id;

  const devAddress = await devWallet.getAddress();
  const devUser = await prisma.user.findUnique({ where: { walletAddress: devAddress.toLowerCase() } });
  assert(devUser, "Dev user not found");

  // Apply from both developers and let the client choose exactly one.
  const devApplication = await gql(
    `mutation($input: ApplyToIssueInput!) { applyToIssue(input: $input) { id status developerId } }`,
    devToken,
    { input: { issueId, message: "I can complete this task." } }
  );
  const strangerApplication = await gql(
    `mutation($input: ApplyToIssueInput!) { applyToIssue(input: $input) { id status developerId } }`,
    strangerToken,
    { input: { issueId, message: "I would also like to work on this." } }
  );
  assert.strictEqual(devApplication.data?.applyToIssue?.status, "PENDING");
  assert.strictEqual(strangerApplication.data?.applyToIssue?.status, "PENDING");

  const assignment = await gql(
    `mutation($input: AssignDeveloperInput!) { assignDeveloper(input: $input) { id status developerId } }`,
    clientToken,
    { input: { issueId, applicationId: devApplication.data.applyToIssue.id } }
  );
  assert.strictEqual(assignment.data?.assignDeveloper?.status, "IN_PROGRESS");
  assert.strictEqual(assignment.data?.assignDeveloper?.developerId, devUser.id);
  const finalApplications = await gql(
    `query($issueId: String!) { applications(issueId: $issueId) { id status developerId } }`,
    clientToken,
    { issueId }
  );
  assert.strictEqual(finalApplications.data?.applications?.find((application: any) => application.id === devApplication.data.applyToIssue.id)?.status, "ACCEPTED");
  assert.strictEqual(finalApplications.data?.applications?.find((application: any) => application.id === strangerApplication.data.applyToIssue.id)?.status, "REJECTED");

  // -------------------------------------------------------------------
  // D-4: GraphQL messages()
  // -------------------------------------------------------------------
  console.log("2. Testing GraphQL D-4...");
  
  const noAuth = await gql(`{ messages(issueId: "${issueId}") { edges { node { id } } } }`);
  assert.strictEqual(noAuth.errors?.[0]?.extensions?.code, "UNAUTHORIZED");

  const strangerAuth = await gql(`{ messages(issueId: "${issueId}") { edges { node { id } } } }`, strangerToken);
  assert.strictEqual(strangerAuth.errors?.[0]?.extensions?.code, "FORBIDDEN");

  const clientAuth = await gql(`{ messages(issueId: "${issueId}") { edges { node { id } } } }`, clientToken);
  assert(!clientAuth.errors, "Client should be able to read messages");

  // -------------------------------------------------------------------
  // D-1/D-2: Socket.io auth và join
  // -------------------------------------------------------------------
  console.log("3. Testing Socket auth D-1/D-2...");
  
  try {
    await connectSocket();
    assert.fail("Should not connect without token");
  } catch (err: any) {
    assert.strictEqual(err.message, "Unauthorized");
  }

  const clientSocket = await connectSocket(clientToken);
  const devSocket = await connectSocket(devToken);
  const strangerSocket = await connectSocket(strangerToken);

  await new Promise<void>((resolve, reject) => {
    strangerSocket.emit("task:join", issueId, (err?: string) => {
      if (err === "You cannot access this task room") resolve();
      else reject(new Error("Stranger should be Forbidden"));
    });
  });

  await new Promise<void>((resolve, reject) => {
    clientSocket.emit("task:join", issueId, (err?: string) => {
      if (err) reject(new Error(err));
      else resolve();
    });
  });

  await new Promise<void>((resolve, reject) => {
    devSocket.emit("task:join", issueId, (err?: string) => {
      if (err) reject(new Error(err));
      else resolve();
    });
  });

  console.log("   ✓ Socket connected and joined rooms");

  // -------------------------------------------------------------------
  // D-3: Send message và Idempotency
  // -------------------------------------------------------------------
  console.log("4. Testing Message Send D-3 (Realtime + Idempotency)...");

  const clientMessageId = "unique-msg-123";

  // Set up listener on clientSocket (Realtime receipt AC)
  const realtimePromise = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout waiting for realtime message")), 5000);
    clientSocket.on("message:new", (msg: any) => {
      if (msg.content === "Hello from dev") {
        clearTimeout(timer);
        try {
          assert.strictEqual(msg.content, "Hello from dev");
          assert.strictEqual(msg.issueId, issueId);
          assert.strictEqual(msg.senderId, devUser.id);
          resolve();
        } catch (e) {
          reject(e);
        }
      }
    });
  });

  // Dev send message
  await new Promise<void>((resolve, reject) => {
    devSocket.emit("message:send", {
      content: "Hello from dev",
      type: "TEXT",
      issueId,
      clientMessageId
    }, (err?: string) => {
      if (err) reject(new Error(err));
      else resolve();
    });
  });

  await realtimePromise;
  console.log("   ✓ Realtime receipt verified");

  // Replay exactly same message
  await new Promise<void>((resolve, reject) => {
    devSocket.emit("message:send", {
      content: "Hello from dev (again)", // DB content won't update
      type: "TEXT",
      issueId,
      clientMessageId
    }, (err?: string) => {
      if (err) reject(new Error(err));
      else resolve();
    });
  });

  // Check DB for duplicates
  const messagesInDb = await prisma.message.findMany({ where: { clientMessageId } });
  assert.strictEqual(messagesInDb.length, 1, "Idempotency failed: duplicated message");
  assert(messagesInDb[0], "Message not found");
  assert.strictEqual(messagesInDb[0].content, "Hello from dev", "Content should be from first attempt");

  console.log("   ✓ Idempotency verified");

  console.log("5. Testing Unread / readAt reset (D-4)...");
  const readRes = await gql(`{ messages(issueId: "${issueId}") { edges { node { id readAt } } } }`, clientToken);
  const msgNodes = readRes.data.messages.edges.map((e: any) => e.node);
  const receivedMsg = msgNodes.find((n: any) => n.id);
  assert(receivedMsg.readAt, "Message readAt should not be null after fetching");

  // Check DB to ensure readAt was updated asynchronously
  await new Promise(r => setTimeout(r, 500));
  const readInDb = await prisma.message.findFirst({
    where: { issueId, senderId: devUser.id, readAt: { not: null } }
  });
  assert(readInDb, "Message readAt should be updated in DB");
  console.log("   ✓ readAt reset verified");

  // Cleanup
  console.log("6. Cleaning up...");
  clientSocket.disconnect();
  devSocket.disconnect();
  strangerSocket.disconnect();

  await prisma.issue.delete({ where: { id: issueId } });
  await prisma.notification.deleteMany({ where: { link: `/issues/${issueId}` } });
  await Promise.all(originalRoles.map(({ walletAddress, role }) =>
    prisma.user.update({ where: { walletAddress }, data: { role } })
  ));
  await Promise.all([clientToken, devToken, strangerToken].map((cookie) =>
    fetch(`${base}/api/auth/logout`, { method: "POST", headers: { Cookie: cookie } })
  ));
  await prisma.$disconnect();

  console.log("\n✅ All E2E Chat Module assertions passed!");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ E2E Chat Test Failed:", err);
  process.exit(1);
});
