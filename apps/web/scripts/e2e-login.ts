import { signLoginPayload } from "@thirdweb-dev/auth";
import { PrivateKeyWallet } from "@thirdweb-dev/wallets";
import { prisma } from "@bloody-roar/database";
import { createHash } from "node:crypto";
import assert from "node:assert";

// Load environment variables for DB connection in the script
import "../src/lib/env";

const TEST_CLIENT_KEY = process.env.TEST_CLIENT_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";
const base = "http://localhost:3000";

async function gql(query: string, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  
  const res = await fetch(`${base}/api/graphql`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query: `{ ${query} { walletAddress } }` })
  });
  return res.json();
}

async function gqlRaw<T = any>(
  query: string,
  token?: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  
  const res = await fetch(`${base}/api/graphql`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, ...(variables ? { variables } : {}) })
  });
  return res.json();
}

async function run() {
  console.log("🩸 Starting E2E Login Test...");
  const wallet = new PrivateKeyWallet(TEST_CLIENT_KEY);
  const walletAddress = await wallet.getAddress();
  console.log(`Wallet address: ${walletAddress}`);

  // 1. nonce
  console.log("1. Fetching nonce...");
  const nonceRes = await fetch(`${base}/api/auth/nonce?address=${walletAddress}`);
  assert(nonceRes.ok, "Failed to fetch nonce");
  const payload = await nonceRes.json();
  
  assert(payload.nonce, "Nonce is missing");
  assert.strictEqual(payload.domain, "localhost:3000", "Domain does not match localhost:3000");

  // 2. sign
  console.log("2. Signing login payload...");
  const signed = await signLoginPayload({ payload, wallet });

  // 3. login
  console.log("3. Logging in...");
  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify(signed),
    headers: { "Content-Type": "application/json" }
  });
  
  assert.strictEqual(loginRes.status, 200, `Login failed with status ${loginRes.status}`);
  const { token, user } = await loginRes.json();
  
  assert(token, "Missing token in login response");
  assert(user, "Missing user in login response");
  assert.strictEqual(user.walletAddress.toLowerCase(), walletAddress.toLowerCase(), "Wallet address mismatch in user response");
  assert(!user.email, "User response should not contain sensitive data like email");
  
  // 4. me with JWT
  console.log("4. Fetching me with JWT...");
  const meRes = await gql("me", token);
  assert(meRes.data?.me?.walletAddress, "Failed to fetch me with JWT");
  assert.strictEqual(meRes.data.me.walletAddress.toLowerCase(), walletAddress.toLowerCase(), "Wallet address mismatch in me response");

  // 4b. Test updateProfile
  console.log("4b. Testing updateProfile...");
  const updateRes = await gqlRaw(`
    mutation($input: UpdateProfileInput!) {
      updateProfile(input: $input) { name }
    }
  `, token, { input: { name: "E2E Updated" } });
  assert.strictEqual(updateRes.data?.updateProfile?.name, "E2E Updated", "updateProfile failed");

  const updateNoAuth = await gqlRaw(`
    mutation($input: UpdateProfileInput!) {
      updateProfile(input: $input) { name }
    }
  `, undefined, { input: { name: "Hacked" } });
  assert.strictEqual(updateNoAuth.errors?.[0]?.extensions?.code, "UNAUTHORIZED", "updateProfile should be UNAUTHORIZED without token");

  // 5. replay -> 401
  console.log("5. Replaying login payload (should fail)...");
  const replayRes = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify(signed),
    headers: { "Content-Type": "application/json" }
  });
  assert.strictEqual(replayRes.status, 401, "Replay attack should fail with 401");

  // 6. token rác / không token -> me = null
  console.log("6. Fetching me with no token and garbage token...");
  const meNoTokenRes = await gql("me");
  assert.strictEqual(meNoTokenRes.data?.me, null, "Me should be null without token");
  
  const meGarbageRes = await gql("me", "garbage_token_here");
  assert.strictEqual(meGarbageRes.data?.me, null, "Me should be null with garbage token");
  
  // 7. DB assertions: sessions
  console.log("7. Checking DB assertions...");
  const refreshHash = createHash("sha256").update(token).digest("hex");
  const session = await prisma.session.findUnique({
    where: { nonce: payload.nonce }
  });
  
  assert(session, "Session not found in DB");
  assert.strictEqual(session.refreshHash, refreshHash, "Refresh hash mismatch in DB");

  // 8. DB assertions: users
  const dbUser = await prisma.user.findUnique({
    where: { walletAddress: walletAddress.toLowerCase() }
  });
  assert(dbUser, "User not found in DB");

  console.log("✅ All E2E Login assertions passed!");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ E2E Login Test Failed:", err);
  process.exit(1);
});
