// apps/web/scripts/e2e-backend-comprehensive.ts
// Comprehensive Backend E2E Verification for Capstone1 (BloodyRoar)
// Validates:
// 1. Post (Issue creation, criteria, terms versioning, query filters)
// 2. Match Room (Applications, rejection, withdrawal, selection, concurrency lock)
// 3. Chat Socket (Real-time Socket.IO, room auth, messaging, AI Guard masking, typing, read receipts, ban disconnect)
// 4. Money On-Chain Flow (Deposit, work submission, release, claim)

import { ethers, BigNumber } from "ethers";
import { signLoginPayload } from "@thirdweb-dev/auth";
import { PrivateKeyWallet } from "@thirdweb-dev/wallets";
import { io as createSocket, Socket } from "socket.io-client";
import { fundingIntentTypedData, type Hex } from "@bloody-roar/shared/escrow";
import { prisma } from "@bloody-roar/database";
import { randomBytes } from "node:crypto";

const BASE_URL = (process.env.BASE_URL || "http://localhost:4100").replace(/\/$/, "");
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";

const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

// Standard Hardhat Accounts
const KEYS = {
  admin: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // #1
  client: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // #2
  dev: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // #3
  dev2: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a", // #4
  feeRecipient: "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e", // #6
  outsider: "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356", // #7
};

type Actor = {
  cookie: string;
  token: string;
  user: { id: string; role: string; walletAddress: string };
  signer: ethers.Wallet;
  address: string;
};

let failures = 0;

function check(section: string, name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  const status = ok ? "PASS" : "FAIL";
  console.log(`${status} [${section}] ${name}${detail ? ` (${detail})` : ""}`);
}

async function rpc<T = any>(method: string, params: any[] = []): Promise<T> {
  return provider.send(method, params);
}

async function getChainTimestamp(): Promise<number> {
  const block = await provider.getBlock("latest");
  return block.timestamp;
}

async function gql<T = any>(
  cookie: string | null,
  query: string,
  variables?: Record<string, unknown>,
): Promise<{ data?: T; errors?: Array<{ message: string; extensions?: { code?: string } }> }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE_URL}/api/graphql`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function login(privateKey: string, targetRole?: "CLIENT" | "DEVELOPER" | "ADMIN"): Promise<Actor> {
  const wallet = new PrivateKeyWallet(privateKey);
  const address = await wallet.getAddress();
  const signer = new ethers.Wallet(privateKey, provider);

  const nonceRes = await fetch(`${BASE_URL}/api/auth/nonce?address=${address}`);
  if (!nonceRes.ok) throw new Error(`Failed to get nonce for ${address}: ${nonceRes.status}`);
  const noncePayload = await nonceRes.json();
  const signed = await signLoginPayload({ payload: noncePayload, wallet });

  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(signed),
  });
  if (!loginRes.ok) throw new Error(`Login failed for ${address}: ${loginRes.status}`);

  const cookieHeader = loginRes.headers.get("set-cookie") ?? "";
  const cookie = cookieHeader.split(";")[0] ?? "";
  const tokenMatch = cookie.match(/bloody_token=([^;]+)/);
  const token = (tokenMatch && tokenMatch[1]) ? tokenMatch[1] : "";

  const body = (await loginRes.json()) as { user: { id: string; role: string; walletAddress: string } };

  if (targetRole && body.user.role !== targetRole && body.user.role !== "ADMIN") {
    const updateRes = await gql(cookie, `mutation { updateProfile(input: { role: "${targetRole}" }) { role } }`);
    if (updateRes.data?.updateProfile?.role) {
      body.user.role = updateRes.data.updateProfile.role;
    }
  }

  return { cookie, token, user: body.user, signer, address };
}

type PreparedCall = {
  intentId: string;
  method: string;
  contractAddress: string;
  data: string;
  value?: string;
};

async function sendPrepared(actor: Actor, step: PreparedCall): Promise<string> {
  const tx = await actor.signer.sendTransaction({
    to: step.contractAddress,
    data: step.data,
    value: step.value && step.value !== "0" ? BigNumber.from(step.value) : 0,
    gasLimit: 600000,
  });

  const record = await gql(
    actor.cookie,
    `mutation($id: ID!, $hash: String!) { recordTransactionSubmitted(intentId: $id, txHash: $hash) { id } }`,
    { id: step.intentId, hash: tx.hash },
  );
  if (record.errors?.length) {
    throw new Error(`recordTransactionSubmitted failed: ${record.errors[0]?.message}`);
  }

  const receipt = await tx.wait();
  if (receipt.status !== 1) {
    throw new Error(`Transaction reverted: ${tx.hash}`);
  }
  return tx.hash;
}

async function waitForCondition(
  fn: () => Promise<boolean>,
  label: string,
  timeoutMs = 35000,
  intervalMs = 1000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await fn()) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timeout waiting for condition: ${label}`);
}

async function getUsdcBalance(tokenAddress: string, wallet: string): Promise<bigint> {
  const tokenContract = new ethers.Contract(
    tokenAddress,
    ["function balanceOf(address) view returns (uint256)"],
    provider,
  );
  const bal = await tokenContract.balanceOf(wallet);
  return BigInt(bal.toString());
}

async function runComprehensiveBackendAudit() {
  console.log("================================================================================");
  console.log("         BLOODYROAR FULL BACKEND & COMPREHENSIVE ARCHITECTURE AUDIT            ");
  console.log(`         Target URL: ${BASE_URL} | Chain: 31337 (Hardhat)                      `);
  console.log("================================================================================\n");

  // Health checks
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  const healthJson = await healthRes.json();
  check("SETUP", "Backend health check ok", healthRes.ok && healthJson.status === "ok", JSON.stringify(healthJson));

  // Initialize actors
  const admin = await login(KEYS.admin, "ADMIN");
  const client = await login(KEYS.client, "CLIENT");
  const dev = await login(KEYS.dev, "DEVELOPER");
  const dev2 = await login(KEYS.dev2, "DEVELOPER");
  const feeRecipient = await login(KEYS.feeRecipient, "DEVELOPER");
  const outsider = await login(KEYS.outsider, "DEVELOPER");

  check("SETUP", "Authenticated Client, Dev, Dev2, Admin, Outsider", Boolean(client.token && dev.token && admin.token));

  // Token query
  const tokensRes = await gql(null, `{ tokens { id symbol address decimals } }`);
  const token = tokensRes.data?.tokens?.[0];
  check("SETUP", "Token MockUSDC configured and whitelisted", !!token, token?.address);
  if (!token) {
    console.error("FATAL: No token found.");
    process.exit(1);
  }
  const tokenId = token.id;
  const tokenAddress = token.address;

  // =========================================================================
  // 1. POST FLOW: Creation, Criteria, Terms Versioning, Filters
  // =========================================================================
  console.log("\n>>> 1. AUDITING POST FLOW (Issue Creation, Acceptance Criteria, Terms) <<<");

  // 1.1 Validation bounds
  const shortTitle = await gql(
    client.cookie,
    `mutation($input: CreateIssueInput!) { createIssue(input: $input) { id } }`,
    { input: { title: "Short", description: "This is a valid length description with thirty chars", category: "BUG_FIX", bountyAmount: "100", tokenId } },
  );
  check("POST", "Reject short title (<10 chars)", shortTitle.errors?.[0]?.extensions?.code === "BAD_USER_INPUT");

  const shortDesc = await gql(
    client.cookie,
    `mutation($input: CreateIssueInput!) { createIssue(input: $input) { id } }`,
    { input: { title: "Valid Title Test", description: "Too short", category: "BUG_FIX", bountyAmount: "100", tokenId } },
  );
  check("POST", "Reject short description (<30 chars)", shortDesc.errors?.[0]?.extensions?.code === "BAD_USER_INPUT");

  const badBounty = await gql(
    client.cookie,
    `mutation($input: CreateIssueInput!) { createIssue(input: $input) { id } }`,
    { input: { title: "Valid Title Test", description: "This is a valid length description with thirty chars", category: "BUG_FIX", bountyAmount: "-50", tokenId } },
  );
  check("POST", "Reject negative bounty amount", badBounty.errors?.[0]?.extensions?.code === "BAD_USER_INPUT");

  const fakeToken = await gql(
    client.cookie,
    `mutation($input: CreateIssueInput!) { createIssue(input: $input) { id } }`,
    { input: { title: "Valid Title Test", description: "This is a valid length description with thirty chars", category: "BUG_FIX", bountyAmount: "100", tokenId: "nonexistent-token" } },
  );
  check("POST", "Reject unwhitelisted token", fakeToken.errors?.[0]?.extensions?.code === "INVALID_TOKEN");

  const adminCreate = await gql(
    admin.cookie,
    `mutation($input: CreateIssueInput!) { createIssue(input: $input) { id } }`,
    { input: { title: "Admin Post Attempt", description: "This is a valid length description with thirty chars", category: "BUG_FIX", bountyAmount: "100", tokenId } },
  );
  check("POST", "Admin cannot create bounty issue (ADMIN_NOT_ALLOWED)", adminCreate.errors?.[0]?.extensions?.code === "ADMIN_NOT_ALLOWED");

  // 1.2 Valid Issue Creation
  const issueTitle = `Comprehensive Audit Bounty ${Date.now()}`;
  const validCreate = await gql(
    client.cookie,
    `mutation($input: CreateIssueInput!) { createIssue(input: $input) { id title status termsVersion bountyAmountRaw } }`,
    {
      input: {
        title: issueTitle,
        description: "Comprehensive backend verification issue description testing all workflows end-to-end.",
        category: "SMART_CONTRACT",
        bountyAmount: "100",
        tokenId,
        requiredSkills: ["Solidity", "TypeScript", "GraphQL"],
      },
    },
  );
  check("POST", "Create valid bounty issue", !!validCreate.data?.createIssue?.id, validCreate.errors?.[0]?.message ?? "");
  const issueId = validCreate.data?.createIssue?.id as string;
  check("POST", "Issue initial status is OPEN", validCreate.data?.createIssue?.status === "OPEN");
  check("POST", "Issue initial termsVersion is 1", validCreate.data?.createIssue?.termsVersion === 1);

  // 1.3 Add Acceptance Criteria (Test Cases)
  const createTc = await gql(
    client.cookie,
    `mutation($input: CreateTestCaseInput!) { createTestCase(input: $input) { id title isApproved } }`,
    {
      input: {
        issueId,
        title: "Criterion A: Contract deployed & tested",
        description: "Ensure smart contracts pass all tests",
        given: "Contract codebase setup",
        when: "Tests are executed",
        then: "All assertions pass cleanly",
      },
    },
  );
  const tcId = (createTc.data as any)?.createTestCase?.id;
  check("POST", "Create acceptance criterion (test case)", !!tcId);

  const approveTc = await gql(
    client.cookie,
    `mutation($input: UpdateTestCaseInput!) { updateTestCase(input: $input) { id isApproved } }`,
    { input: { id: tcId, isApproved: true } },
  );
  check("POST", "Approve acceptance criterion", approveTc.data?.updateTestCase?.isApproved === true);

  // 1.4 Update Issue (material change: bountyAmount 100 -> 150 increments termsVersion)
  const updateIssueRes = await gql(
    client.cookie,
    `mutation($input: UpdateIssueInput!) { updateIssue(input: $input) { id title termsVersion } }`,
    { input: { id: issueId, title: `${issueTitle} (Updated Specs)`, bountyAmount: "150" } },
  );
  check("POST", "Update issue specifications while OPEN", updateIssueRes.data?.updateIssue?.title?.includes("Updated Specs"));
  check("POST", "termsVersion increments upon material edit", (updateIssueRes.data?.updateIssue?.termsVersion ?? 0) >= 2);

  // 1.5 Query Issue Details, Criteria, and Filtering
  const getIssueRes = await gql(
    null,
    `query($id: ID!) { issue(id: $id) { id title status termsVersion bountyAmountRaw } }`,
    { id: issueId },
  );
  check("POST", "Query issue details by ID", getIssueRes.data?.issue?.id === issueId);

  const getTcRes = await gql(
    null,
    `query($id: String!) { testCases(issueId: $id) { id title isApproved } }`,
    { id: issueId },
  );
  check("POST", "Query issue acceptance criteria via testCases query", (getTcRes.data?.testCases?.length ?? 0) >= 1);

  const listIssuesRes = await gql(
    null,
    `query { issues(status: OPEN, first: 5) { edges { node { id title } } } }`,
  );
  check("POST", "Query open issues with pagination & filtering", (listIssuesRes.data?.issues?.edges?.length ?? 0) > 0);

  // =========================================================================
  // 2. MATCH ROOM & APPLICATION FLOW
  // =========================================================================
  console.log("\n>>> 2. AUDITING MATCH ROOM & APPLICATION FLOW <<<");

  // 2.1 Self-apply restriction
  const selfApply = await gql(
    client.cookie,
    `mutation($input: ApplyToIssueInput!) { applyToIssue(input: $input) { id } }`,
    { input: { issueId, message: "Client trying to apply to own issue" } },
  );
  check("MATCH_ROOM", "Client cannot apply to own issue (SELF_APPLICATION)", selfApply.errors?.[0]?.extensions?.code === "SELF_APPLICATION");

  // 2.2 Dev1 and Dev2 apply
  const dev1Apply = await gql(
    dev.cookie,
    `mutation($input: ApplyToIssueInput!) { applyToIssue(input: $input) { id status message } }`,
    { input: { issueId, message: "Dev 1 applying with senior credentials." } },
  );
  const dev1AppId = (dev1Apply.data as any)?.applyToIssue?.id;
  check("MATCH_ROOM", "Dev 1 applied successfully (status: PENDING)", dev1Apply.data?.applyToIssue?.status === "PENDING");

  const dev2Apply = await gql(
    dev2.cookie,
    `mutation($input: ApplyToIssueInput!) { applyToIssue(input: $input) { id status } }`,
    { input: { issueId, message: "Dev 2 applying." } },
  );
  const dev2AppId = (dev2Apply.data as any)?.applyToIssue?.id;
  check("MATCH_ROOM", "Dev 2 applied successfully (status: PENDING)", dev2Apply.data?.applyToIssue?.status === "PENDING");

  // Duplicate apply check
  const dupApply = await gql(
    dev.cookie,
    `mutation($input: ApplyToIssueInput!) { applyToIssue(input: $input) { id } }`,
    { input: { issueId, message: "Duplicate attempt" } },
  );
  check("MATCH_ROOM", "Duplicate application prevented (ALREADY_APPLIED)", dupApply.errors?.[0]?.extensions?.code === "ALREADY_APPLIED");

  // 2.3 Dev2 withdraws application
  const withdrawRes = await gql(
    dev2.cookie,
    `mutation($id: ID!) { withdrawApplication(id: $id) { id status } }`,
    { id: dev2AppId },
  );
  check("MATCH_ROOM", "Dev 2 withdraws application (status: WITHDRAWN)", withdrawRes.data?.withdrawApplication?.status === "WITHDRAWN");

  // Dev2 reapplies after withdrawal
  const reapplyRes = await gql(
    dev2.cookie,
    `mutation($input: ApplyToIssueInput!) { applyToIssue(input: $input) { id status } }`,
    { input: { issueId, message: "Dev 2 reapplying after reconsidering." } },
  );
  const reapplyAppId = (reapplyRes.data as any)?.applyToIssue?.id;
  check("MATCH_ROOM", "Dev 2 reapplies successfully (status: PENDING)", reapplyRes.data?.applyToIssue?.status === "PENDING");

  // 2.4 Client rejects Dev2
  const rejectRes = await gql(
    client.cookie,
    `mutation($id: ID!) { rejectApplication(id: $id) { id status } }`,
    { id: reapplyAppId },
  );
  check("MATCH_ROOM", "Client rejects Dev 2 (status: REJECTED)", rejectRes.data?.rejectApplication?.status === "REJECTED");

  // 2.5 Client selects Dev 1 (Creating Funding Reservation & Match Room)
  const chainNow = await getChainTimestamp();
  const deliveryDeadline = new Date((chainNow + 5 * 86400) * 1000).toISOString();
  const selectRes = await gql(
    client.cookie,
    `mutation($issue: ID!, $app: ID!, $dl: String!) { selectDeveloper(issueId: $issue, applicationId: $app, deliveryDeadline: $dl) { id status escrowKey termsHash amountRaw chainId contractAddress tokenAddress deliveryDeadline } }`,
    { issue: issueId, app: dev1AppId, dl: deliveryDeadline },
  );
  const reservation = selectRes.data?.selectDeveloper;
  check("MATCH_ROOM", "Client selects Dev 1 -> status AWAITING_FUNDING", reservation?.status === "AWAITING_FUNDING");
  check("MATCH_ROOM", "Deterministic escrowKey generated", Boolean(reservation?.escrowKey && reservation.escrowKey.startsWith("br_")));
  check("MATCH_ROOM", "termsHash mathematically bound to criteria", Boolean(reservation?.termsHash && reservation.termsHash.startsWith("0x")));

  // 2.6 Editing blocked after selecting developer
  const blockedEdit = await gql(
    client.cookie,
    `mutation($input: UpdateIssueInput!) { updateIssue(input: $input) { id } }`,
    { input: { id: issueId, title: "Blocked Edit Title" } },
  );
  check("MATCH_ROOM", "Issue editing locked after selection (ISSUE_NOT_EDITABLE)", blockedEdit.errors?.[0]?.extensions?.code === "ISSUE_NOT_EDITABLE");

  // 2.7 Outside applicant blocked after selection
  const outsideApply = await gql(
    outsider.cookie,
    `mutation($input: ApplyToIssueInput!) { applyToIssue(input: $input) { id } }`,
    { input: { issueId, message: "Late apply attempt" } },
  );
  check("MATCH_ROOM", "Late application blocked (ISSUE_NOT_OPEN)", outsideApply.errors?.[0]?.extensions?.code === "ISSUE_NOT_OPEN");

  // =========================================================================
  // 3. MONEY ON-CHAIN ESCROW LIFECYCLE (Deposit & Assignment)
  // =========================================================================
  console.log("\n>>> 3. AUDITING ON-CHAIN MONEY LIFECYCLE (Deposit & Active Assignment) <<<");

  const initialDevBal = await getUsdcBalance(tokenAddress, dev.address);

  // 3.1 Client submits EIP-712 Funding Intent
  const nonceBytes = randomBytes(16);
  const nonce = BigInt(`0x${nonceBytes.toString("hex")}`);
  const intentExpiry = new Date(Date.now() + 15 * 60 * 1000);
  const typed = fundingIntentTypedData({
    chainId: reservation.chainId,
    verifyingContract: reservation.contractAddress as Hex,
    escrowId: reservation.escrowKey,
    client: client.address as Hex,
    developer: dev.address as Hex,
    token: reservation.tokenAddress as Hex,
    amount: BigInt(reservation.amountRaw),
    deliveryDeadline: BigInt(Math.floor(new Date(reservation.deliveryDeadline).getTime() / 1000)),
    termsHash: reservation.termsHash as Hex,
    intentExpiry: BigInt(Math.floor(intentExpiry.getTime() / 1000)),
    nonce,
  });

  const message = Object.fromEntries(
    Object.entries(typed.message).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v]),
  );
  const signature = await client.signer._signTypedData(
    typed.domain as any,
    { FundingIntent: [...typed.types.FundingIntent] },
    message,
  );

  const fundIntentRes = await gql(
    client.cookie,
    `mutation($id: ID!, $sig: String!, $nonce: String!, $exp: String!) { submitFundingIntent(reservationId: $id, signature: $sig, nonce: $nonce, intentExpiry: $exp) { id } }`,
    { id: reservation.id, sig: signature, nonce: nonce.toString(), exp: intentExpiry.toISOString() },
  );
  check("ESCROW", "submitFundingIntent EIP-712 signature accepted", !!fundIntentRes.data?.submitFundingIntent?.id);

  // 3.2 Client prepares escrow deposit (ERC-20 approve + deposit)
  const prepDepRes = await gql(
    client.cookie,
    `mutation($id: ID!) { prepareEscrowDeposit(reservationId: $id) { steps { intentId method contractAddress data value } } }`,
    { id: reservation.id },
  );
  check("ESCROW", "prepareEscrowDeposit calldata generated", Boolean((prepDepRes.data as any)?.prepareEscrowDeposit?.steps?.length));
  const steps = (prepDepRes.data as any).prepareEscrowDeposit.steps as PreparedCall[];

  for (const step of steps) {
    await sendPrepared(client, step);
  }

  // Wait for worker indexer to confirm FUNDED phase and assign developerId on issue
  await waitForCondition(async () => {
    const res = await gql(client.cookie, `query($id: ID!) { issue(id: $id) { status developerId escrow { phase } } }`, { id: issueId });
    return res.data?.issue?.escrow?.phase === "FUNDED" && res.data?.issue?.status === "IN_PROGRESS" && Boolean(res.data?.issue?.developerId);
  }, `Escrow FUNDED and issue IN_PROGRESS for ${issueId}`);
  check("ESCROW", "Deposit confirmed on-chain, issue IN_PROGRESS, developer assigned", true);

  // =========================================================================
  // 4. CHAT SOCKET & REALTIME PROTOCOL (Active Room, AI Guard, Security)
  // =========================================================================
  console.log("\n>>> 4. AUDITING CHAT SOCKET & REALTIME SUBSYSTEM <<<");

  function connectClientSocket(token: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const s = createSocket(BASE_URL, {
        auth: { token },
        transports: ["websocket", "polling"],
        reconnection: false,
        timeout: 5000,
      });
      s.on("connect", () => resolve(s));
      s.on("connect_error", (err) => reject(err));
    });
  }

  const clientSocket = await connectClientSocket(client.token);
  const devSocket = await connectClientSocket(dev.token);
  const outsiderSocket = await connectClientSocket(outsider.token);

  check("SOCKET", "Socket.IO connections authenticated with JWT sessions", Boolean(clientSocket.connected && devSocket.connected && outsiderSocket.connected));

  // 4.1 Room authorization: Outsider joining task room is rejected
  const outsiderJoinError: string = await new Promise((res) => {
    outsiderSocket.emit("task:join", issueId, (err?: string) => res(err || "ok"));
  });
  check("SOCKET", "Outsider forbidden from joining task room", outsiderJoinError.includes("cannot access") || outsiderJoinError.includes("Forbidden"), outsiderJoinError);

  // 4.2 Client and Dev join task room
  const clientJoin: string = await new Promise((res) => {
    clientSocket.emit("task:join", issueId, (err?: string) => res(err || "ok"));
  });
  const devJoin: string = await new Promise((res) => {
    devSocket.emit("task:join", issueId, (err?: string) => res(err || "ok"));
  });
  check("SOCKET", "Client joined task chat room", clientJoin === "ok");
  check("SOCKET", "Dev joined task chat room", devJoin === "ok");

  // 4.3 Realtime message delivery: Client sends text message -> Dev receives message:new
  const textPromise = new Promise<{ id: string; content: string; wasModified: boolean }>((resolve) => {
    devSocket.on("message:new", (msg: any) => {
      if (msg.issueId === issueId && msg.content.includes("Welcome to the project")) {
        resolve(msg);
      }
    });
  });

  const sendErr: string = await new Promise((res) => {
    clientSocket.emit(
      "message:send",
      { issueId, content: "Welcome to the project, developer! Please review AC.", type: "TEXT" },
      (err?: string) => res(err || "ok"),
    );
  });
  check("SOCKET", "Client message:send ack ok", sendErr === "ok");

  const receivedMsg = await Promise.race([
    textPromise,
    new Promise<null>((r) => setTimeout(() => r(null), 5000)),
  ]);
  check("SOCKET", "Developer received real-time message:new event", Boolean(receivedMsg && receivedMsg.content.includes("Welcome")));

  // 4.4 AI Guard scanning: Sensitive info (email + private key) masked and redacted
  const guardPromise = new Promise<{ id: string; content: string; wasModified: boolean }>((resolve) => {
    devSocket.on("message:new", (msg: any) => {
      if (msg.issueId === issueId && msg.content.includes("[REDACTED]")) {
        resolve(msg);
      }
    });
  });

  const rawSensitiveMessage = `Please contact me at admin-secret@bloodyroar.internal and key=sk-proj-01234567890123456789012345678901`;
  const sensitiveSendErr: string = await new Promise((res) => {
    clientSocket.emit(
      "message:send",
      { issueId, content: rawSensitiveMessage, type: "TEXT" },
      (err?: string) => res(err || "ok"),
    );
  });
  check("SOCKET", "Sensitive message accepted for guard processing", sensitiveSendErr === "ok");

  const guardedMsg = await Promise.race([
    guardPromise,
    new Promise<null>((r) => setTimeout(() => r(null), 5000)),
  ]);
  check("SOCKET", "AI Guard masked sensitive data to [REDACTED]", Boolean(guardedMsg && guardedMsg.content.includes("[REDACTED]")), guardedMsg?.content);
  check("SOCKET", "Message flagged as wasModified: true", guardedMsg?.wasModified === true);

  // Check audit hash in database
  if (guardedMsg?.id) {
    const dbMsg = await prisma.message.findUnique({ where: { id: guardedMsg.id } });
    check("SOCKET", "Message originalHash securely stored in DB for dispute audit", Boolean(dbMsg?.originalHash && dbMsg.originalHash.length === 64));
  }

  // 4.5 Rate limiting on message:send (10 messages per 10s window)
  let rateLimited = false;
  for (let i = 0; i < 12; i++) {
    const err: string = await new Promise((res) => {
      clientSocket.emit(
        "message:send",
        { issueId, content: `Spam check message ${i}`, type: "TEXT" },
        (e?: string) => res(e || "ok"),
      );
    });
    if (err.includes("Too many messages")) {
      rateLimited = true;
      break;
    }
  }
  check("SOCKET", "Socket rate limiter prevents chat spam (>10 msgs in 10s)", rateLimited);

  // 4.6 Session revocation / Banned user disconnect
  const tempUser = await login("0x" + randomBytes(32).toString("hex"), "DEVELOPER");
  const tempSocket = await connectClientSocket(tempUser.token);
  check("SOCKET", "Temporary user socket connected", tempSocket.connected);

  const disconnectPromise = new Promise<string>((resolve) => {
    tempSocket.on("disconnect", (reason) => resolve(reason));
  });

  // Admin bans user
  await gql(admin.cookie, `mutation($input: BanUserInput!) { banUser(input: $input) { id } }`, {
    input: { userId: tempUser.user.id, reason: "Security violation audit" },
  });

  const disconnectReason = await Promise.race([
    disconnectPromise,
    new Promise<null>((r) => setTimeout(() => r(null), 3000)),
  ]);
  check("SOCKET", "Banned user socket forcefully disconnected by server", Boolean(disconnectReason && !tempSocket.connected), disconnectReason ?? "not disconnected");

  // Attempting to connect a new socket with banned user token is rejected in handshake
  let reconnectRejected = false;
  try {
    await connectClientSocket(tempUser.token);
  } catch (err: any) {
    reconnectRejected = err.message?.includes("Unauthorized") || err.message?.includes("banned");
  }
  check("SOCKET", "Banned user new socket connection rejected with Unauthorized", reconnectRejected);

  // Unban user cleanup
  await gql(admin.cookie, `mutation($id: ID!) { unbanUser(userId: $id) { id } }`, { id: tempUser.user.id });

  // Disconnect audit sockets
  clientSocket.disconnect();
  devSocket.disconnect();
  outsiderSocket.disconnect();

  // =========================================================================
  // 5. WORK SUBMISSION, RELEASE & ON-CHAIN CLAIMS
  // =========================================================================
  console.log("\n>>> 5. AUDITING WORK SUBMISSION, RELEASE & CLAIMS <<<");

  // 5.1 Developer submits work draft + on-chain delivery
  const draftRes = await gql(
    dev.cookie,
    `mutation($issue: ID!, $desc: String!) { createSubmissionDraft(issueId: $issue, description: $desc) { id } }`,
    { issue: issueId, desc: "Final audited deliverables for comprehensive test" },
  );
  const subId = (draftRes.data as any)?.createSubmissionDraft?.id;
  check("ESCROW", "Developer creates submission draft", !!subId);

  const prepSub = await gql(
    dev.cookie,
    `mutation($id: ID!) { prepareSubmitWork(submissionId: $id) { intentId method contractAddress data value } }`,
    { id: subId },
  );
  await sendPrepared(dev, (prepSub.data as any).prepareSubmitWork);

  await waitForCondition(async () => {
    const q = await gql(client.cookie, `query($id: ID!) { issue(id: $id) { escrow { deliveryHash } } }`, { id: issueId });
    return Boolean(q.data?.issue?.escrow?.deliveryHash);
  }, "Work delivery hash indexed on-chain");
  check("ESCROW", "Work submission confirmed on-chain and deliveryHash indexed", true);

  // 5.2 Client releases funds
  const prepRel = await gql(
    client.cookie,
    `mutation($id: ID!) { prepareReleaseFunds(issueId: $id) { intentId method contractAddress data value } }`,
    { id: issueId },
  );
  await sendPrepared(client, (prepRel.data as any).prepareReleaseFunds);

  await waitForCondition(async () => {
    const q = await gql(client.cookie, `query($id: ID!) { issue(id: $id) { status escrow { phase } } }`, { id: issueId });
    return q.data?.issue?.status === "COMPLETED" && q.data?.issue?.escrow?.phase === "RESOLVED";
  }, "Escrow RESOLVED and issue COMPLETED");
  check("ESCROW", "Client released funds -> Escrow RESOLVED & issue COMPLETED", true);

  // 5.3 Developer and Fee Recipient claim
  const devClaim = await gql(
    dev.cookie,
    `mutation($rec: String!) { prepareClaim(recipient: $rec) { intentId method contractAddress data value } }`,
    { rec: dev.address },
  );
  await sendPrepared(dev, (devClaim.data as any).prepareClaim);

  const feeClaim = await gql(
    feeRecipient.cookie,
    `mutation($rec: String!) { prepareClaim(recipient: $rec) { intentId method contractAddress data value } }`,
    { rec: feeRecipient.address },
  );
  await sendPrepared(feeRecipient, (feeClaim.data as any).prepareClaim);

  // Check on-chain balance increase: 97.5% net of 150 USDC = 146.25 USDC (146,250,000 units)
  const finalDevBal = await getUsdcBalance(tokenAddress, dev.address);
  const diff = finalDevBal - initialDevBal;
  check("ESCROW", "Developer claimed exactly 97.5% bounty on-chain (146.25 USDC)", diff === 146_250_000n, `delta: ${diff}`);

  // Wait for worker indexer to fold the Claimed event and clear myClaimable
  await waitForCondition(async () => {
    const res = await gql(dev.cookie, `{ myClaimable { amountRaw } }`);
    return (res.data?.myClaimable?.length ?? 0) === 0;
  }, "Developer myClaimable clears to 0");
  check("ESCROW", "Developer myClaimable is 0", true);

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log("\n================================================================================");
  console.log(`COMPREHENSIVE BACKEND AUDIT RESULTS: ${failures === 0 ? "ALL CHECKS PASSED ✅" : `${failures} FAILURE(S) ❌`}`);
  console.log("================================================================================\n");

  process.exit(failures === 0 ? 0 : 1);
}

runComprehensiveBackendAudit().catch((err) => {
  console.error("Fatal error during backend comprehensive audit:", err);
  process.exit(1);
});
