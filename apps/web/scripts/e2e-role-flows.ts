// apps/web/scripts/e2e-role-flows.ts
// E2E Role Flow Script for Capstone1 (BloodyRoar)
// Runs scenarios S1 through S10 against the real running server at BASE_URL.

import { ethers, BigNumber } from "ethers";
import { signLoginPayload } from "@thirdweb-dev/auth";
import { PrivateKeyWallet } from "@thirdweb-dev/wallets";
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
  arbiter: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba", // #5
  feeRecipient: "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e", // #6
  outsider: "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356", // #7
};

type Actor = {
  cookie: string;
  user: { id: string; role: string; walletAddress: string };
  signer: ethers.Wallet;
  address: string;
};

let failures = 0;

function check(scenario: string, name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  const status = ok ? "PASS" : "FAIL";
  console.log(`${status} [${scenario}] ${name}${detail ? ` (${detail})` : ""}`);
}

async function rpc<T = any>(method: string, params: any[] = []): Promise<T> {
  return provider.send(method, params);
}

async function getChainTimestamp(): Promise<number> {
  const block = await provider.getBlock("latest");
  return block.timestamp;
}

async function evmAdvanceTime(seconds: number) {
  await rpc("evm_increaseTime", [seconds]);
  await rpc("evm_mine");
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
  if (!loginRes.ok) throw new Error(`Login failed for ${address}: ${loginRes.status} ${await loginRes.text()}`);

  const cookie = (loginRes.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  const body = (await loginRes.json()) as { user: { id: string; role: string; walletAddress: string } };

  if (targetRole && body.user.role !== targetRole && body.user.role !== "ADMIN") {
    const updateRes = await gql(cookie, `mutation { updateProfile(input: { role: "${targetRole}" }) { role } }`);
    if (updateRes.data?.updateProfile?.role) {
      body.user.role = updateRes.data.updateProfile.role;
    }
  }

  return { cookie, user: body.user, signer, address };
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

async function createAndFundIssue(
  client: Actor,
  dev: Actor,
  tokenId: string,
  title: string,
  bountyAmount = 100,
  daysDeadline = 5,
) {
  // 1. Create issue
  const createRes = await gql(
    client.cookie,
    `mutation($input: CreateIssueInput!) { createIssue(input: $input) { id status } }`,
    {
      input: {
        title,
        description: "Test bounty description for E2E role flow scenarios.",
        category: "BUG_FIX",
        bountyAmount: String(bountyAmount),
        tokenId,
        requiredSkills: ["Solidity", "TypeScript"],
      },
    },
  );
  if (createRes.errors?.length) throw new Error(`Create issue failed: ${createRes.errors[0]?.message}`);
  const issueId = (createRes.data as any).createIssue.id as string;

  // 2. Add approved test case (acceptance criterion)
  const tcRes = await gql(
    client.cookie,
    `mutation($input: CreateTestCaseInput!) { createTestCase(input: $input) { id } }`,
    {
      input: {
        issueId,
        title: "Acceptance Criterion 1",
        description: "Verify correct completion of task",
        given: "Task defined and requirements clear",
        when: "Developer delivers work for review",
        then: "All assertions pass successfully",
      },
    },
  );
  if (tcRes.errors?.length) throw new Error(`Create test case failed: ${tcRes.errors[0]?.message}`);
  const tcId = (tcRes.data as any).createTestCase.id;

  const appTc = await gql(
    client.cookie,
    `mutation($input: UpdateTestCaseInput!) { updateTestCase(input: $input) { id isApproved } }`,
    { input: { id: tcId, isApproved: true } },
  );
  if (appTc.errors?.length) throw new Error(`Approve test case failed: ${appTc.errors[0]?.message}`);

  // 3. Dev applies
  const applyRes = await gql(
    dev.cookie,
    `mutation($input: ApplyToIssueInput!) { applyToIssue(input: $input) { id status } }`,
    { input: { issueId, message: "I am ready to work on this task." } },
  );
  if (applyRes.errors?.length) throw new Error(`Dev apply failed: ${applyRes.errors[0]?.message}`);
  const applicationId = (applyRes.data as any).applyToIssue.id as string;

  // 4. Client selects Dev
  const chainNow = await getChainTimestamp();
  const deadline = new Date((chainNow + daysDeadline * 86400) * 1000).toISOString();
  const selectRes = await gql(
    client.cookie,
    `mutation($issue: ID!, $app: ID!, $deadline: String!) { selectDeveloper(issueId: $issue, applicationId: $app, deliveryDeadline: $deadline) { id status chainId contractAddress tokenAddress escrowKey termsHash amountRaw deliveryDeadline } }`,
    { issue: issueId, app: applicationId, deadline },
  );
  if (selectRes.errors?.length) throw new Error(`Select developer failed: ${selectRes.errors[0]?.message}`);
  const reservation = (selectRes.data as any).selectDeveloper;

  // 5. Submit funding intent
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
    Object.entries(typed.message).map(([key, value]) => [key, typeof value === "bigint" ? value.toString() : value]),
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
  if (fundIntentRes.errors?.length) throw new Error(`Submit funding intent failed: ${fundIntentRes.errors[0]?.message}`);

  // 6. Prepare escrow deposit
  const prepDepRes = await gql(
    client.cookie,
    `mutation($id: ID!) { prepareEscrowDeposit(reservationId: $id) { steps { intentId method contractAddress data value } } }`,
    { id: reservation.id },
  );
  if (prepDepRes.errors?.length) throw new Error(`Prepare deposit failed: ${prepDepRes.errors[0]?.message}`);
  const steps = (prepDepRes.data as any).prepareEscrowDeposit.steps as PreparedCall[];

  for (const step of steps) {
    await sendPrepared(client, step);
  }

  // 7. Wait for worker indexer to confirm FUNDED phase
  await waitForCondition(async () => {
    const res = await gql(client.cookie, `query($id: ID!) { issue(id: $id) { status escrow { phase } } }`, { id: issueId });
    return res.data?.issue?.escrow?.phase === "FUNDED";
  }, `Escrow FUNDED for ${issueId}`);

  return { issueId, reservationId: reservation.id, applicationId, deadline, tokenAddress: reservation.tokenAddress };
}

async function run() {
  console.log(`Starting E2E Role Flow Verification against ${BASE_URL}\n`);

  // Health checks
  const health = await fetch(`${BASE_URL}/api/health`);
  check("SETUP", "health check ok", health.ok, String(health.status));

  // Initialize actors
  const admin = await login(KEYS.admin, "ADMIN");
  const client = await login(KEYS.client, "CLIENT");
  const dev = await login(KEYS.dev, "DEVELOPER");
  const dev2 = await login(KEYS.dev2, "DEVELOPER");
  const arbiter = await login(KEYS.arbiter, "DEVELOPER");
  const feeRecipient = await login(KEYS.feeRecipient, "DEVELOPER");
  const outsider = await login(KEYS.outsider, "DEVELOPER");

  check("SETUP", "Admin role", admin.user.role === "ADMIN", admin.user.role);

  // Drain any pre-existing claimable balances on-chain from previous test runs
  for (const actor of [client, dev, dev2, arbiter, feeRecipient, outsider]) {
    try {
      const claimRes = await gql(
        actor.cookie,
        `mutation($rec: String!) { prepareClaim(recipient: $rec) { intentId method contractAddress data value } }`,
        { rec: actor.address },
      );
      if (claimRes.data?.prepareClaim) {
        await sendPrepared(actor, (claimRes.data as any).prepareClaim);
      }
    } catch {
      // Nothing to claim
    }
  }

  // Get token
  const tokensRes = await gql(null, `{ tokens { id symbol address decimals } }`);
  const token = tokensRes.data?.tokens?.[0];
  check("SETUP", "MockUSDC token available", !!token, token?.symbol ?? "none");
  if (!token) {
    console.error("FATAL: No token found. Ensure db:seed:local was executed.");
    process.exit(1);
  }
  const tokenId = token.id;
  const tokenAddress = token.address;

  // =========================================================================
  // S1: Luồng chuẩn (Standard flow)
  // =========================================================================
  console.log("\n--- Scenario S1: Luồng chuẩn ---");
  try {
    const initialDevBal = await getUsdcBalance(tokenAddress, dev.address);

    // 1. Client creates issue
    const s1IssueRes = await gql(
      client.cookie,
      `mutation($input: CreateIssueInput!) { createIssue(input: $input) { id status } }`,
      {
        input: {
          title: `S1 Standard Flow Bounty ${Date.now()}`,
          description: "Happy path role flow e2e verification",
          category: "FEATURE",
          bountyAmount: "100",
          tokenId,
          requiredSkills: ["Solidity", "TypeScript"],
        },
      },
    );
    const s1IssueId = (s1IssueRes.data as any)?.createIssue?.id;
    check("S1", "Client creates issue", !!s1IssueId);

    // Approve test case
    const s1Tc = await gql(
      client.cookie,
      `mutation($input: CreateTestCaseInput!) { createTestCase(input: $input) { id } }`,
      {
        input: {
          issueId: s1IssueId,
          title: "Criterion 1",
          description: "Verify correct completion of task",
          given: "Task defined and requirements clear",
          when: "Developer delivers work for review",
          then: "All assertions pass successfully",
        },
      },
    );
    await gql(
      client.cookie,
      `mutation($input: UpdateTestCaseInput!) { updateTestCase(input: $input) { id } }`,
      { input: { id: (s1Tc.data as any).createTestCase.id, isApproved: true } },
    );

    // 2. dev and dev2 apply
    const s1DevApply = await gql(
      dev.cookie,
      `mutation($input: ApplyToIssueInput!) { applyToIssue(input: $input) { id status } }`,
      { input: { issueId: s1IssueId, message: "Dev 1 applying" } },
    );
    const s1DevAppId = (s1DevApply.data as any)?.applyToIssue?.id;

    const s1Dev2Apply = await gql(
      dev2.cookie,
      `mutation($input: ApplyToIssueInput!) { applyToIssue(input: $input) { id status } }`,
      { input: { issueId: s1IssueId, message: "Dev 2 applying" } },
    );
    const s1Dev2AppId = (s1Dev2Apply.data as any)?.applyToIssue?.id;
    check("S1", "Dev and Dev2 applied", !!(s1DevAppId && s1Dev2AppId));

    // 3. Client rejects dev2
    const s1Reject = await gql(
      client.cookie,
      `mutation($id: ID!) { rejectApplication(id: $id) { id status } }`,
      { id: s1Dev2AppId },
    );
    check("S1", "Client rejects Dev2", (s1Reject.data as any)?.rejectApplication?.status === "REJECTED");

    // 4. Client selects dev
    const chainNow = await getChainTimestamp();
    const s1Deadline = new Date((chainNow + 5 * 86400) * 1000).toISOString();
    const s1Select = await gql(
      client.cookie,
      `mutation($issue: ID!, $app: ID!, $dl: String!) { selectDeveloper(issueId: $issue, applicationId: $app, deliveryDeadline: $dl) { id status chainId contractAddress tokenAddress escrowKey termsHash amountRaw deliveryDeadline } }`,
      { issue: s1IssueId, app: s1DevAppId, dl: s1Deadline },
    );
    const s1Res = (s1Select.data as any)?.selectDeveloper;
    check("S1", "Client selects Dev", s1Res?.status === "AWAITING_FUNDING");

    // 5. Submit funding intent & deposit
    const nonce = BigInt(`0x${randomBytes(16).toString("hex")}`);
    const intentExp = new Date(Date.now() + 15 * 60 * 1000);
    const s1Typed = fundingIntentTypedData({
      chainId: s1Res.chainId,
      verifyingContract: s1Res.contractAddress as Hex,
      escrowId: s1Res.escrowKey,
      client: client.address as Hex,
      developer: dev.address as Hex,
      token: s1Res.tokenAddress as Hex,
      amount: BigInt(s1Res.amountRaw),
      deliveryDeadline: BigInt(Math.floor(new Date(s1Res.deliveryDeadline).getTime() / 1000)),
      termsHash: s1Res.termsHash as Hex,
      intentExpiry: BigInt(Math.floor(intentExp.getTime() / 1000)),
      nonce,
    });
    const s1Msg = Object.fromEntries(
      Object.entries(s1Typed.message).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v]),
    );
    const s1Sig = await client.signer._signTypedData(
      s1Typed.domain as any,
      { FundingIntent: [...s1Typed.types.FundingIntent] },
      s1Msg,
    );

    await gql(
      client.cookie,
      `mutation($id: ID!, $sig: String!, $nonce: String!, $exp: String!) { submitFundingIntent(reservationId: $id, signature: $sig, nonce: $nonce, intentExpiry: $exp) { id } }`,
      { id: s1Res.id, sig: s1Sig, nonce: nonce.toString(), exp: intentExp.toISOString() },
    );

    const s1PrepDep = await gql(
      client.cookie,
      `mutation($id: ID!) { prepareEscrowDeposit(reservationId: $id) { steps { intentId method contractAddress data value } } }`,
      { id: s1Res.id },
    );
    const s1Steps = (s1PrepDep.data as any)?.prepareEscrowDeposit?.steps as PreparedCall[];
    for (const step of s1Steps) {
      await sendPrepared(client, step);
    }

    await waitForCondition(async () => {
      const q = await gql(client.cookie, `query($id: ID!) { issue(id: $id) { status escrow { phase } } }`, { id: s1IssueId });
      return q.data?.issue?.escrow?.phase === "FUNDED";
    }, "S1 Escrow FUNDED");
    check("S1", "Deposit confirmed on-chain and indexed", true);

    // Verify DEPOSIT_CONFIRMED notification on dev or client
    const clientNotifs = await gql(client.cookie, `{ notifications(first: 20) { type } }`);
    const devNotifs = await gql(dev.cookie, `{ notifications(first: 20) { type } }`);
    const hasDepositNotif =
      (clientNotifs.data?.notifications?.some((n: any) => n.type === "DEPOSIT_CONFIRMED") ?? false) ||
      (devNotifs.data?.notifications?.some((n: any) => n.type === "DEPOSIT_CONFIRMED") ?? false);
    check("S1", "DEPOSIT_CONFIRMED notification received", hasDepositNotif);

    // 6. Dev createSubmissionDraft + prepareSubmitWork
    const s1Draft = await gql(
      dev.cookie,
      `mutation($issue: ID!, $desc: String!) { createSubmissionDraft(issueId: $issue, description: $desc) { id } }`,
      { issue: s1IssueId, desc: "Delivery for S1 complete work" },
    );
    const s1SubId = (s1Draft.data as any)?.createSubmissionDraft?.id;

    const s1PrepSubmit = await gql(
      dev.cookie,
      `mutation($id: ID!) { prepareSubmitWork(submissionId: $id) { intentId method contractAddress data value } }`,
      { id: s1SubId },
    );
    await sendPrepared(dev, (s1PrepSubmit.data as any).prepareSubmitWork);

    await waitForCondition(async () => {
      const q = await gql(client.cookie, `query($id: ID!) { issue(id: $id) { escrow { deliveryHash } } }`, { id: s1IssueId });
      return !!q.data?.issue?.escrow?.deliveryHash;
    }, "S1 Work indexed");
    check("S1", "Dev submitted work and indexed", true);

    // Verify WORK_SUBMITTED notification
    await waitForCondition(async () => {
      const q = await gql(client.cookie, `{ notifications(first: 20) { type } }`);
      return q.data?.notifications?.some((n: any) => n.type === "WORK_SUBMITTED") ?? false;
    }, "WORK_SUBMITTED notification");
    check("S1", "WORK_SUBMITTED notification received by client", true);

    // 7. Client prepareReleaseFunds
    const s1PrepRel = await gql(
      client.cookie,
      `mutation($id: ID!) { prepareReleaseFunds(issueId: $id) { intentId method contractAddress data value } }`,
      { id: s1IssueId },
    );
    await sendPrepared(client, (s1PrepRel.data as any).prepareReleaseFunds);

    await waitForCondition(async () => {
      const q = await gql(client.cookie, `query($id: ID!) { issue(id: $id) { status escrow { phase } } }`, { id: s1IssueId });
      return q.data?.issue?.status === "COMPLETED";
    }, "S1 Issue COMPLETED");
    check("S1", "Issue status reaches COMPLETED", true);

    // Verify ESCROW_RESOLVED and FUNDS_CLAIMABLE notifications
    await waitForCondition(async () => {
      const devN = await gql(dev.cookie, `{ notifications(first: 20) { type } }`);
      const types = devN.data?.notifications?.map((n: any) => n.type) ?? [];
      return types.includes("ESCROW_RESOLVED") && types.includes("FUNDS_CLAIMABLE");
    }, "ESCROW_RESOLVED and FUNDS_CLAIMABLE notifications");
    check("S1", "ESCROW_RESOLVED and FUNDS_CLAIMABLE notifications present", true);

    // 8. Dev and FeeRecipient prepareClaim
    const s1DevClaim = await gql(
      dev.cookie,
      `mutation($rec: String!) { prepareClaim(recipient: $rec) { intentId method contractAddress data value } }`,
      { rec: dev.address },
    );
    await sendPrepared(dev, (s1DevClaim.data as any).prepareClaim);

    const s1FeeClaim = await gql(
      feeRecipient.cookie,
      `mutation($rec: String!) { prepareClaim(recipient: $rec) { intentId method contractAddress data value } }`,
      { rec: feeRecipient.address },
    );
    await sendPrepared(feeRecipient, (s1FeeClaim.data as any).prepareClaim);

    // Check myClaimable for dev is 0
    await waitForCondition(async () => {
      const q = await gql(dev.cookie, `{ myClaimable { amountRaw } }`);
      return (q.data?.myClaimable?.length ?? 0) === 0;
    }, "myClaimable reaches 0");
    check("S1", "myClaimable returns 0 / empty", true);

    // Check dev on-chain USDC increased by 97.5% (97,500,000 units)
    const finalDevBal = await getUsdcBalance(tokenAddress, dev.address);
    const diff = finalDevBal - initialDevBal;
    check("S1", "Dev received exactly 97.5% of bounty (97.5 USDC)", diff === 97_500_000n, `delta: ${diff}`);
  } catch (err: any) {
    check("S1", "Scenario S1 completed", false, err.message);
  }

  // =========================================================================
  // S2: Yêu cầu sửa (Request changes)
  // =========================================================================
  console.log("\n--- Scenario S2: Yêu cầu sửa ---");
  try {
    const f = await createAndFundIssue(client, dev, tokenId, `S2 Request Changes Bounty ${Date.now()}`);

    // Dev submits 1st work
    const d1 = await gql(dev.cookie, `mutation($i: ID!, $d: String!) { createSubmissionDraft(issueId: $i, description: $d) { id } }`, { i: f.issueId, d: "Draft 1" });
    const sub1Id = (d1.data as any).createSubmissionDraft.id;
    const prep1 = await gql(dev.cookie, `mutation($id: ID!) { prepareSubmitWork(submissionId: $id) { intentId method contractAddress data value } }`, { id: sub1Id });
    await sendPrepared(dev, (prep1.data as any).prepareSubmitWork);

    await waitForCondition(async () => {
      const q = await gql(client.cookie, `query($id: ID!) { issue(id: $id) { escrow { deliveryHash } } }`, { id: f.issueId });
      return !!q.data?.issue?.escrow?.deliveryHash;
    }, "S2 Draft 1 delivery on-chain");

    // Client requestChanges
    const reqRes = await gql(
      client.cookie,
      `mutation($id: ID!, $notes: String!) { requestChanges(submissionId: $id, notes: $notes) { changesRequested } }`,
      { id: sub1Id, notes: "Please fix error and resubmit." },
    );
    check("S2", "Client requests changes", !!(reqRes.data as any)?.requestChanges);

    // Check CHANGES_REQUESTED notification for dev
    await waitForCondition(async () => {
      const q = await gql(dev.cookie, `{ notifications(first: 20) { type } }`);
      return q.data?.notifications?.some((n: any) => n.type === "CHANGES_REQUESTED") ?? false;
    }, "CHANGES_REQUESTED notification");
    check("S2", "CHANGES_REQUESTED notification received", true);

    // Dev submits 2nd work
    const d2 = await gql(dev.cookie, `mutation($i: ID!, $d: String!) { createSubmissionDraft(issueId: $i, description: $d) { id } }`, { i: f.issueId, d: "Draft 2 revised" });
    const sub2Id = (d2.data as any).createSubmissionDraft.id;
    const prep2 = await gql(dev.cookie, `mutation($id: ID!) { prepareSubmitWork(submissionId: $id) { intentId method contractAddress data value } }`, { id: sub2Id });
    await sendPrepared(dev, (prep2.data as any).prepareSubmitWork);

    await waitForCondition(async () => {
      const q = await gql(client.cookie, `query($id: ID!) { issue(id: $id) { latestSubmission { id } } }`, { id: f.issueId });
      return q.data?.issue?.latestSubmission?.id === sub2Id;
    }, "S2 Draft 2 submitted");

    // Client releases funds for 2nd submission
    const prepRel = await gql(
      client.cookie,
      `mutation($id: ID!) { prepareReleaseFunds(issueId: $id) { intentId method contractAddress data value } }`,
      { id: f.issueId },
    );
    await sendPrepared(client, (prepRel.data as any).prepareReleaseFunds);

    await waitForCondition(async () => {
      const q = await gql(client.cookie, `query($id: ID!) { issue(id: $id) { status } }`, { id: f.issueId });
      return q.data?.issue?.status === "COMPLETED";
    }, "S2 Completed after 2nd submission");
    check("S2", "Issue released and COMPLETED after 2nd submission", true);

    // Dev and FeeRecipient claim their funds from S2 to drain claimable
    const s2DevClaim = await gql(
      dev.cookie,
      `mutation($rec: String!) { prepareClaim(recipient: $rec) { intentId method contractAddress data value } }`,
      { rec: dev.address },
    );
    await sendPrepared(dev, (s2DevClaim.data as any).prepareClaim);

    const s2FeeClaim = await gql(
      feeRecipient.cookie,
      `mutation($rec: String!) { prepareClaim(recipient: $rec) { intentId method contractAddress data value } }`,
      { rec: feeRecipient.address },
    );
    await sendPrepared(feeRecipient, (s2FeeClaim.data as any).prepareClaim);
  } catch (err: any) {
    check("S2", "Scenario S2 completed", false, err.message);
  }

  // =========================================================================
  // S3: Reservation hết hạn (Reservation expired)
  // =========================================================================
  console.log("\n--- Scenario S3: Reservation hết hạn ---");
  try {
    const s3Issue = await gql(
      client.cookie,
      `mutation($input: CreateIssueInput!) { createIssue(input: $input) { id } }`,
      { input: { title: `S3 Expiry Bounty ${Date.now()}`, description: "Expiry test description for verifying reservation timeout", category: "BUG_FIX", bountyAmount: "100", tokenId } },
    );
    if (s3Issue.errors?.length) throw new Error(`S3 createIssue failed: ${s3Issue.errors[0]?.message}`);
    const s3IssueId = (s3Issue.data as any).createIssue.id;

    const s3Tc = await gql(
      client.cookie,
      `mutation($input: CreateTestCaseInput!) { createTestCase(input: $input) { id } }`,
      {
        input: {
          issueId: s3IssueId,
          title: "Expiry Criterion",
          description: "Verify criterion holds before expiration",
          given: "Issue is awaiting funding",
          when: "Time window lapses without deposit",
          then: "Reservation expires automatically",
        },
      },
    );
    await gql(
      client.cookie,
      `mutation($input: UpdateTestCaseInput!) { updateTestCase(input: $input) { id } }`,
      { input: { id: (s3Tc.data as any).createTestCase.id, isApproved: true } },
    );

    const s3App = await gql(
      dev.cookie,
      `mutation($input: ApplyToIssueInput!) { applyToIssue(input: $input) { id } }`,
      { input: { issueId: s3IssueId, message: "Apply for S3 expiry test" } },
    );
    const s3AppId = (s3App.data as any).applyToIssue.id;

    const chainNow = await getChainTimestamp();
    const s3Deadline = new Date((chainNow + 5 * 86400) * 1000).toISOString();
    const s3Select = await gql(
      client.cookie,
      `mutation($issue: ID!, $app: ID!, $dl: String!) { selectDeveloper(issueId: $issue, applicationId: $app, deliveryDeadline: $dl) { id status } }`,
      { issue: s3IssueId, app: s3AppId, dl: s3Deadline },
    );
    if (s3Select.errors?.length) throw new Error(`S3 selectDeveloper failed: ${s3Select.errors[0]?.message}`);
    const s3ResId = (s3Select.data as any).selectDeveloper.id;
    check("S3", "Issue moved to AWAITING_FUNDING", (s3Select.data as any).selectDeveloper.status === "AWAITING_FUNDING");

    // Do NOT fund; expire the reservation in DB
    await prisma.fundingReservation.update({
      where: { id: s3ResId },
      data: { expiresAt: new Date(Date.now() - 5000) },
    });

    // Wait for the worker reservationsJob to expire it and reopen issue
    await waitForCondition(async () => {
      const q = await gql(client.cookie, `query($id: ID!) { issue(id: $id) { status } }`, { id: s3IssueId });
      return q.data?.issue?.status === "OPEN";
    }, "S3 Issue reopened to OPEN", 60000, 2000);
    check("S3", "Issue reopened to OPEN after reservation expired", true);

    // Verify RESERVATION_EXPIRED notification received by dev
    await waitForCondition(async () => {
      const q = await gql(dev.cookie, `{ notifications(first: 20) { type } }`);
      return q.data?.notifications?.some((n: any) => n.type === "RESERVATION_EXPIRED") ?? false;
    }, "RESERVATION_EXPIRED notification", 30000, 1000);
    check("S3", "RESERVATION_EXPIRED notification received by dev", true);
  } catch (err: any) {
    check("S3", "Scenario S3 completed", false, err.message);
  }

  // =========================================================================
  // S4: Dev trễ hạn (Missed delivery refund)
  // =========================================================================
  console.log("\n--- Scenario S4: Dev trễ hạn ---");
  try {
    const initialClientBal = await getUsdcBalance(tokenAddress, client.address);
    const f = await createAndFundIssue(client, dev, tokenId, `S4 Missed Delivery Bounty ${Date.now()}`, 100, 5);

    // Dev does NOT submit work. Advance time past deliveryDeadline (5 days + buffer = 6 days)
    await evmAdvanceTime(6 * 86400);

    // Client calls prepareClaimMissedDeliveryRefund
    const prepRefund = await gql(
      client.cookie,
      `mutation($id: ID!) { prepareClaimMissedDeliveryRefund(issueId: $id) { intentId method contractAddress data value } }`,
      { id: f.issueId },
    );
    if (prepRefund.errors?.length) throw new Error(`prepareClaimMissedDeliveryRefund failed: ${prepRefund.errors[0]?.message}`);
    await sendPrepared(client, (prepRefund.data as any).prepareClaimMissedDeliveryRefund);

    await waitForCondition(async () => {
      const q = await gql(client.cookie, `query($id: ID!) { issue(id: $id) { status escrow { phase } } }`, { id: f.issueId });
      return q.data?.issue?.escrow?.phase === "RESOLVED";
    }, "S4 Escrow RESOLVED for refund");

    // Client claims refund
    const prepClaim = await gql(
      client.cookie,
      `mutation($rec: String!) { prepareClaim(recipient: $rec) { intentId method contractAddress data value } }`,
      { rec: client.address },
    );
    await sendPrepared(client, (prepClaim.data as any).prepareClaim);

    const finalClientBal = await getUsdcBalance(tokenAddress, client.address);
    const refunded = finalClientBal - initialClientBal;
    // Deposited 100 USDC and claimed 100 USDC -> diff should be 0n
    check("S4", "Client claimed back 100% full refund on-chain", refunded === 0n, `delta: ${refunded}`);
  } catch (err: any) {
    check("S4", "Scenario S4 completed", false, err.message);
  }

  // =========================================================================
  // S5: Client không duyệt (Review timeout)
  // =========================================================================
  console.log("\n--- Scenario S5: Client không duyệt ---");
  try {
    const initialDevBal = await getUsdcBalance(tokenAddress, dev.address);
    const f = await createAndFundIssue(client, dev, tokenId, `S5 Review Timeout Bounty ${Date.now()}`, 100, 5);

    // Dev submits work
    const d = await gql(dev.cookie, `mutation($i: ID!, $d: String!) { createSubmissionDraft(issueId: $i, description: $d) { id } }`, { i: f.issueId, d: "Submitted work" });
    const subId = (d.data as any).createSubmissionDraft.id;
    const prepSub = await gql(dev.cookie, `mutation($id: ID!) { prepareSubmitWork(submissionId: $id) { intentId method contractAddress data value } }`, { id: subId });
    await sendPrepared(dev, (prepSub.data as any).prepareSubmitWork);

    await waitForCondition(async () => {
      const q = await gql(client.cookie, `query($id: ID!) { issue(id: $id) { escrow { deliveryHash } } }`, { id: f.issueId });
      return !!q.data?.issue?.escrow?.deliveryHash;
    }, "S5 Work delivery on-chain");

    // Advance time past review window (deliveryDeadline + 7 days = ~13 days)
    await evmAdvanceTime(13 * 86400);

    // Dev calls prepareClaimReviewTimeout
    const prepTimeout = await gql(
      dev.cookie,
      `mutation($id: ID!) { prepareClaimReviewTimeout(issueId: $id) { intentId method contractAddress data value } }`,
      { id: f.issueId },
    );
    if (prepTimeout.errors?.length) throw new Error(`prepareClaimReviewTimeout failed: ${prepTimeout.errors[0]?.message}`);
    await sendPrepared(dev, (prepTimeout.data as any).prepareClaimReviewTimeout);

    await waitForCondition(async () => {
      const q = await gql(client.cookie, `query($id: ID!) { issue(id: $id) { status escrow { phase } } }`, { id: f.issueId });
      return q.data?.issue?.escrow?.phase === "RESOLVED";
    }, "S5 Escrow RESOLVED via review timeout");

    // Dev claims
    const prepClaim = await gql(
      dev.cookie,
      `mutation($rec: String!) { prepareClaim(recipient: $rec) { intentId method contractAddress data value } }`,
      { rec: dev.address },
    );
    await sendPrepared(dev, (prepClaim.data as any).prepareClaim);

    const finalDevBal = await getUsdcBalance(tokenAddress, dev.address);
    const diff = finalDevBal - initialDevBal;
    check("S5", "Dev received 97.5% on review timeout", diff === 97_500_000n, `delta: ${diff}`);
  } catch (err: any) {
    check("S5", "Scenario S5 completed", false, err.message);
  }

  // =========================================================================
  // S6: Thương lượng (Settlement)
  // =========================================================================
  console.log("\n--- Scenario S6: Thương lượng ---");
  try {
    const f = await createAndFundIssue(client, dev, tokenId, `S6 Settlement Bounty ${Date.now()}`);

    // Client proposes 4000 bps
    const p1 = await gql(
      client.cookie,
      `mutation($id: ID!, $bps: Int!) { prepareProposeSettlement(issueId: $id, clientBps: $bps) { intentId method contractAddress data value } }`,
      { id: f.issueId, bps: 4000 },
    );
    await sendPrepared(client, (p1.data as any).prepareProposeSettlement);

    await waitForCondition(async () => {
      const q = await gql(client.cookie, `query($id: ID!) { issue(id: $id) { escrow { settlementClientBps } } }`, { id: f.issueId });
      return q.data?.issue?.escrow?.settlementClientBps === 4000;
    }, "S6 Proposal 4000 recorded");
    check("S6", "Client proposed settlement (4000 bps)", true);

    // Client revokes proposal
    const rev = await gql(
      client.cookie,
      `mutation($id: ID!) { prepareRevokeSettlement(issueId: $id) { intentId method contractAddress data value } }`,
      { id: f.issueId },
    );
    await sendPrepared(client, (rev.data as any).prepareRevokeSettlement);

    await waitForCondition(async () => {
      const q = await gql(client.cookie, `query($id: ID!) { issue(id: $id) { escrow { settlementProposer } } }`, { id: f.issueId });
      return !q.data?.issue?.escrow?.settlementProposer;
    }, "S6 Proposal revoked");
    check("S6", "Client revoked settlement proposal", true);

    // Client proposes again at 3000 bps (30% client, 70% dev)
    const p2 = await gql(
      client.cookie,
      `mutation($id: ID!, $bps: Int!) { prepareProposeSettlement(issueId: $id, clientBps: $bps) { intentId method contractAddress data value } }`,
      { id: f.issueId, bps: 3000 },
    );
    await sendPrepared(client, (p2.data as any).prepareProposeSettlement);

    await waitForCondition(async () => {
      const q = await gql(client.cookie, `query($id: ID!) { issue(id: $id) { escrow { settlementClientBps } } }`, { id: f.issueId });
      return q.data?.issue?.escrow?.settlementClientBps === 3000;
    }, "S6 Proposal 3000 recorded");

    // Dev accepts
    const acc = await gql(
      dev.cookie,
      `mutation($id: ID!) { prepareAcceptSettlement(issueId: $id) { intentId method contractAddress data value } }`,
      { id: f.issueId },
    );
    await sendPrepared(dev, (acc.data as any).prepareAcceptSettlement);

    await waitForCondition(async () => {
      const q = await gql(client.cookie, `query($id: ID!) { issue(id: $id) { status escrow { phase resolutionKind } } }`, { id: f.issueId });
      return q.data?.issue?.escrow?.phase === "RESOLVED";
    }, "S6 Escrow RESOLVED via settlement");
    check("S6", "Settlement accepted and escrow RESOLVED", true);

    // Verify split amounts
    const projection = await prisma.escrowProjection.findUnique({ where: { issueId: f.issueId } });
    check(
      "S6",
      "Client amount allocated correctly (30 USDC)",
      projection?.clientAmountRaw?.toString() === "30000000",
      `client: ${projection?.clientAmountRaw}`,
    );
    check(
      "S6",
      "Developer amount allocated correctly (68.25 USDC)",
      projection?.developerAmountRaw?.toString() === "68250000",
      `dev: ${projection?.developerAmountRaw}`,
    );
    check(
      "S6",
      "Platform fee allocated correctly (1.75 USDC)",
      projection?.platformFeeRaw?.toString() === "1750000",
      `fee: ${projection?.platformFeeRaw}`,
    );
  } catch (err: any) {
    check("S6", "Scenario S6 completed", false, err.message);
  }

  // =========================================================================
  // S7: Tranh chấp đủ vòng (Full dispute cycle)
  // =========================================================================
  console.log("\n--- Scenario S7: Tranh chấp đủ vòng ---");
  try {
    const f = await createAndFundIssue(client, dev, tokenId, `S7 Full Dispute Bounty ${Date.now()}`);

    // Dev submits work
    const d = await gql(dev.cookie, `mutation($i: ID!, $d: String!) { createSubmissionDraft(issueId: $i, description: $d) { id } }`, { i: f.issueId, d: "Submitted work" });
    const subId = (d.data as any).createSubmissionDraft.id;
    const prepSub = await gql(dev.cookie, `mutation($id: ID!) { prepareSubmitWork(submissionId: $id) { intentId method contractAddress data value } }`, { id: subId });
    await sendPrepared(dev, (prepSub.data as any).prepareSubmitWork);

    await waitForCondition(async () => {
      const q = await gql(client.cookie, `query($id: ID!) { issue(id: $id) { escrow { deliveryHash } } }`, { id: f.issueId });
      return !!q.data?.issue?.escrow?.deliveryHash;
    }, "S7 Delivery on-chain");

    // Client raises dispute with evidence
    const ev1 = await gql(
      client.cookie,
      `mutation($issue: ID!, $stmt: String!) { createEvidenceManifest(issueId: $issue, statement: $stmt) { id manifestHash } }`,
      { issue: f.issueId, stmt: "Work does not satisfy the requirements as described." },
    );
    const ev1Id = (ev1.data as any).createEvidenceManifest.id;

    const raise = await gql(
      client.cookie,
      `mutation($issue: ID!, $man: ID!) { prepareRaiseDispute(issueId: $issue, manifestId: $man) { intentId method contractAddress data value } }`,
      { issue: f.issueId, man: ev1Id },
    );
    await sendPrepared(client, (raise.data as any).prepareRaiseDispute);

    await waitForCondition(async () => {
      const q = await gql(client.cookie, `query($id: ID!) { issue(id: $id) { status escrow { phase } } }`, { id: f.issueId });
      return q.data?.issue?.escrow?.phase === "DISPUTED";
    }, "S7 Escrow DISPUTED");
    check("S7", "Client raised dispute with evidence manifest", true);

    // Dev submits counterparty evidence
    const ev2 = await gql(
      dev.cookie,
      `mutation($issue: ID!, $stmt: String!) { createEvidenceManifest(issueId: $issue, statement: $stmt) { id manifestHash } }`,
      { issue: f.issueId, stmt: "All acceptance criteria were verified and passed cleanly." },
    );
    const ev2Id = (ev2.data as any).createEvidenceManifest.id;

    const counterEv = await gql(
      dev.cookie,
      `mutation($issue: ID!, $man: ID!) { prepareSubmitCounterpartyEvidence(issueId: $issue, manifestId: $man) { intentId method contractAddress data value } }`,
      { issue: f.issueId, man: ev2Id },
    );
    await sendPrepared(dev, (counterEv.data as any).prepareSubmitCounterpartyEvidence);
    check("S7", "Counterparty evidence submitted", true);

    // Admin can read evidence files and chat during dispute
    const evFiles = await gql(admin.cookie, `query($id: ID!) { evidenceFiles(issueId: $id) { id side manifestHash } }`, { id: f.issueId });
    check("S7", "Admin reads evidence manifests", (evFiles.data?.evidenceFiles?.length ?? 0) >= 2);

    const chatMsgs = await gql(admin.cookie, `query($id: String!) { messages(issueId: $id) { edges { node { id } } } }`, { id: f.issueId });
    check("S7", "Admin queries chat messages", !chatMsgs.errors?.length);

    // Advance 72h past evidence submission window
    await evmAdvanceTime(73 * 3600);

    // Admin drafts initial ruling (clientBps = 3000)
    const draftInit = await gql(
      admin.cookie,
      `mutation($id: ID!, $kind: RulingDraftKind!, $bps: Int!, $rat: String!) { draftRuling(issueId: $id, kind: $kind, clientBps: $bps, rationale: $rat) { decisionHash safeTransactionJson } }`,
      { id: f.issueId, kind: "INITIAL", bps: 3000, rat: "Client evidence partially substantiated." },
    );
    check("S7", "Admin drafts initial ruling", !!(draftInit.data as any)?.draftRuling?.decisionHash);

    // Arbiter wallet sends tx from safeTransactionJson
    const safeTxInit = JSON.parse((draftInit.data as any).draftRuling.safeTransactionJson).transactions[0];
    const arbiterTx1 = await arbiter.signer.sendTransaction({
      to: safeTxInit.to,
      data: safeTxInit.data,
      gasLimit: 500000,
    });
    await arbiterTx1.wait();

    await waitForCondition(async () => {
      const q = await gql(client.cookie, `query($id: ID!) { issue(id: $id) { escrow { phase } } }`, { id: f.issueId });
      return q.data?.issue?.escrow?.phase === "INITIAL_RULING";
    }, "S7 Escrow in INITIAL_RULING");
    check("S7", "Arbiter posted initial ruling on-chain", true);

    // Client challenges ruling (client got only 30%, which is < 100%)
    const chal = await gql(
      client.cookie,
      `mutation($id: ID!) { prepareChallengeRuling(issueId: $id) { intentId method contractAddress data value } }`,
      { id: f.issueId },
    );
    await sendPrepared(client, (chal.data as any).prepareChallengeRuling);

    await waitForCondition(async () => {
      const d = await prisma.dispute.findUnique({ where: { issueId: f.issueId } });
      return d?.status === "CHALLENGED";
    }, "S7 Dispute CHALLENGED");
    check("S7", "Client challenged initial ruling", true);

    // Admin drafts final ruling (clientBps = 6000)
    const draftFinal = await gql(
      admin.cookie,
      `mutation($id: ID!, $kind: RulingDraftKind!, $bps: Int!, $rat: String!) { draftRuling(issueId: $id, kind: $kind, clientBps: $bps, rationale: $rat) { decisionHash safeTransactionJson } }`,
      { id: f.issueId, kind: "FINAL", bps: 6000, rat: "Final deliberation: 60/40 client/dev." },
    );
    const safeTxFinal = JSON.parse((draftFinal.data as any).draftRuling.safeTransactionJson).transactions[0];
    const arbiterTx2 = await arbiter.signer.sendTransaction({
      to: safeTxFinal.to,
      data: safeTxFinal.data,
      gasLimit: 500000,
    });
    await arbiterTx2.wait();

    await waitForCondition(async () => {
      const q = await gql(client.cookie, `query($id: ID!) { issue(id: $id) { escrow { phase } } }`, { id: f.issueId });
      return q.data?.issue?.escrow?.phase === "FINAL_RULING";
    }, "S7 Escrow in FINAL_RULING");
    check("S7", "Arbiter posted final ruling on-chain", true);

    // Advance 24h transparency window
    await evmAdvanceTime(25 * 3600);

    // Finalize ruling
    const fin = await gql(
      outsider.cookie,
      `mutation($id: ID!) { prepareFinalizeRuling(issueId: $id) { intentId method contractAddress data value } }`,
      { id: f.issueId },
    );
    await sendPrepared(outsider, (fin.data as any).prepareFinalizeRuling);

    await waitForCondition(async () => {
      const d = await prisma.dispute.findUnique({ where: { issueId: f.issueId } });
      return d?.status === "RESOLVED";
    }, "S7 Dispute RESOLVED");
    check("S7", "Ruling finalized and dispute RESOLVED", true);

    // Check split: 60% client (60 USDC), 40% dev gross -> 39 USDC dev, 1 USDC fee
    const proj = await prisma.escrowProjection.findUnique({ where: { issueId: f.issueId } });
    check("S7", "Client payout matches 6000 bps (60 USDC)", proj?.clientAmountRaw?.toString() === "60000000");
    check("S7", "Developer payout matches 4000 bps net (39 USDC)", proj?.developerAmountRaw?.toString() === "39000000");
    check("S7", "Fee payout matches 100 bps (1 USDC)", proj?.platformFeeRaw?.toString() === "1000000");
  } catch (err: any) {
    check("S7", "Scenario S7 completed", false, err.message);
  }

  // =========================================================================
  // S8: Arbiter không xử lý (Arbiter stall timeout)
  // =========================================================================
  console.log("\n--- Scenario S8: Arbiter không xử lý ---");
  try {
    const f = await createAndFundIssue(client, dev, tokenId, `S8 Arbiter Stall Bounty ${Date.now()}`);

    // Dev submits work
    const d = await gql(dev.cookie, `mutation($i: ID!, $d: String!) { createSubmissionDraft(issueId: $i, description: $d) { id } }`, { i: f.issueId, d: "Submitted" });
    const subId = (d.data as any).createSubmissionDraft.id;
    const prepSub = await gql(dev.cookie, `mutation($id: ID!) { prepareSubmitWork(submissionId: $id) { intentId method contractAddress data value } }`, { id: subId });
    await sendPrepared(dev, (prepSub.data as any).prepareSubmitWork);

    await waitForCondition(async () => {
      const q = await gql(client.cookie, `query($id: ID!) { issue(id: $id) { escrow { deliveryHash } } }`, { id: f.issueId });
      return !!q.data?.issue?.escrow?.deliveryHash;
    }, "S8 Delivery on-chain");

    // Client raises dispute
    const ev = await gql(
      client.cookie,
      `mutation($issue: ID!, $stmt: String!) { createEvidenceManifest(issueId: $issue, statement: $stmt) { id manifestHash } }`,
      { issue: f.issueId, stmt: "Unsatisfactory work submitted." },
    );
    const evId = (ev.data as any).createEvidenceManifest.id;
    const raise = await gql(
      client.cookie,
      `mutation($issue: ID!, $man: ID!) { prepareRaiseDispute(issueId: $issue, manifestId: $man) { intentId method contractAddress data value } }`,
      { issue: f.issueId, man: evId },
    );
    await sendPrepared(client, (raise.data as any).prepareRaiseDispute);

    await waitForCondition(async () => {
      const q = await gql(client.cookie, `query($id: ID!) { issue(id: $id) { escrow { phase } } }`, { id: f.issueId });
      return q.data?.issue?.escrow?.phase === "DISPUTED";
    }, "S8 Escrow DISPUTED");

    // Advance 31 days (past 30-day stall period)
    await evmAdvanceTime(31 * 86400);

    // Outsider finalizes arbiter timeout split
    const timeoutSplit = await gql(
      outsider.cookie,
      `mutation($id: ID!) { prepareFinalizeArbiterTimeoutSplit(issueId: $id) { intentId method contractAddress data value } }`,
      { id: f.issueId },
    );
    if (timeoutSplit.errors?.length) throw new Error(`prepareFinalizeArbiterTimeoutSplit failed: ${timeoutSplit.errors[0]?.message}`);
    await sendPrepared(outsider, (timeoutSplit.data as any).prepareFinalizeArbiterTimeoutSplit);

    await waitForCondition(async () => {
      const dis = await prisma.dispute.findUnique({ where: { issueId: f.issueId } });
      return dis?.status === "RESOLVED";
    }, "S8 Dispute RESOLVED via 50/50 timeout");
    check("S8", "Arbiter timeout split finalized 50/50", true);

    const proj = await prisma.escrowProjection.findUnique({ where: { issueId: f.issueId } });
    check("S8", "Client receives 50 USDC (5000 bps)", proj?.clientAmountRaw?.toString() === "50000000");
    check("S8", "Dev receives 48.75 USDC (50% minus fee)", proj?.developerAmountRaw?.toString() === "48750000");
  } catch (err: any) {
    check("S8", "Scenario S8 completed", false, err.message);
  }

  // =========================================================================
  // S9: Phân quyền (Authz Matrix & Ban)
  // =========================================================================
  console.log("\n--- Scenario S9: Phân quyền ---");
  try {
    // 1. Guest cannot call prepareClaim
    const guestCall = await gql(null, `mutation { prepareClaim(recipient: "0x1111111111111111111111111111111111111111") { intentId } }`);
    check("S9", "Guest prepareClaim rejected with UNAUTHORIZED", guestCall.errors?.[0]?.extensions?.code === "UNAUTHORIZED");

    // 2. Outsider cannot prepareReleaseFunds on someone else's issue
    const outRel = await gql(outsider.cookie, `mutation { prepareReleaseFunds(issueId: "nonexistent") { intentId } }`);
    check("S9", "Outsider prepareReleaseFunds rejected", outRel.errors?.[0]?.extensions?.code === "NOT_FOUND" || outRel.errors?.[0]?.extensions?.code === "FORBIDDEN");

    // 3. Admin cannot create issue
    const adminCreate = await gql(
      admin.cookie,
      `mutation($input: CreateIssueInput!) { createIssue(input: $input) { id } }`,
      { input: { title: "Admin attempt bounty", description: "Admin create issue attempt description with valid length", category: "BUG_FIX", bountyAmount: "100", tokenId } },
    );
    check("S9", "Admin cannot create issue (ADMIN_NOT_ALLOWED)", adminCreate.errors?.[0]?.extensions?.code === "ADMIN_NOT_ALLOWED");

    // 4. Client cannot apply to own issue
    const ownIssue = await gql(
      client.cookie,
      `mutation($input: CreateIssueInput!) { createIssue(input: $input) { id } }`,
      { input: { title: "Self apply test bounty", description: "Client attempting to apply to own issue description valid", category: "BUG_FIX", bountyAmount: "100", tokenId } },
    );
    const ownIssueId = (ownIssue.data as any)?.createIssue?.id;
    const selfApply = await gql(
      client.cookie,
      `mutation($input: ApplyToIssueInput!) { applyToIssue(input: $input) { id } }`,
      { input: { issueId: ownIssueId, message: "Self apply attempt message" } },
    );
    check("S9", "Client cannot apply to own issue (SELF_APPLICATION)", selfApply.errors?.[0]?.extensions?.code === "SELF_APPLICATION");

    // 5. Outsider prepareClaim with someone else's wallet rejected
    const badClaim = await gql(outsider.cookie, `mutation { prepareClaim(recipient: "${client.address}") { intentId } }`);
    check("S9", "Claiming someone else wallet rejected (FORBIDDEN)", badClaim.errors?.[0]?.extensions?.code === "FORBIDDEN");

    // 6. Ban user and check session loss
    const victim = await login("0x" + randomBytes(32).toString("hex"), "DEVELOPER");
    const banRes = await gql(admin.cookie, `mutation($input: BanUserInput!) { banUser(input: $input) { id } }`, { input: { userId: victim.user.id, reason: "Security violation" } });
    check("S9", "Admin bans test user", !!(banRes.data as any)?.banUser?.id);

    const bannedCall = await gql(victim.cookie, `{ myClaimable { amountRaw } }`);
    check("S9", "Banned user loses access (UNAUTHORIZED)", bannedCall.errors?.[0]?.extensions?.code === "UNAUTHORIZED");

    await gql(admin.cookie, `mutation($id: ID!) { unbanUser(userId: $id) { id } }`, { id: victim.user.id });
  } catch (err: any) {
    check("S9", "Scenario S9 completed", false, err.message);
  }

  // =========================================================================
  // S10: Rút đơn và sửa bài (Withdraw & edit issue)
  // =========================================================================
  console.log("\n--- Scenario S10: Rút đơn và sửa bài ---");
  try {
    // 1. Client creates issue in OPEN state
    const s10Issue = await gql(
      client.cookie,
      `mutation($input: CreateIssueInput!) { createIssue(input: $input) { id title status } }`,
      { input: { title: `S10 Initial Title ${Date.now()}`, description: "Initial description for testing withdraw and update issue lifecycle", category: "BUG_FIX", bountyAmount: "100", tokenId } },
    );
    if (s10Issue.errors?.length) throw new Error(`S10 createIssue failed: ${s10Issue.errors[0]?.message}`);
    const s10IssueId = (s10Issue.data as any).createIssue.id;

    // Approve test case
    const s10Tc = await gql(
      client.cookie,
      `mutation($input: CreateTestCaseInput!) { createTestCase(input: $input) { id } }`,
      {
        input: {
          issueId: s10IssueId,
          title: "S10 Criterion",
          description: "Verify criterion holds before work starts",
          given: "Task defined and requirements clear",
          when: "Developer applies to work",
          then: "Selection and assignment proceed",
        },
      },
    );
    await gql(client.cookie, `mutation($input: UpdateTestCaseInput!) { updateTestCase(input: $input) { id } }`, { input: { id: (s10Tc.data as any).createTestCase.id, isApproved: true } });

    // 2. Client updateIssue when OPEN
    const updateRes = await gql(
      client.cookie,
      `mutation($input: UpdateIssueInput!) { updateIssue(input: $input) { id title description } }`,
      { input: { id: s10IssueId, title: "S10 Updated Title", description: "Updated description text with more than thirty chars for validation" } },
    );
    check("S10", "Client updates issue when OPEN", (updateRes.data as any)?.updateIssue?.title === "S10 Updated Title");

    // 3. Dev applies
    const app1 = await gql(dev.cookie, `mutation($input: ApplyToIssueInput!) { applyToIssue(input: $input) { id status } }`, { input: { issueId: s10IssueId, message: "Apply 1" } });
    const app1Id = (app1.data as any).applyToIssue.id;

    // 4. Dev withdrawApplication
    const wRes = await gql(dev.cookie, `mutation($id: ID!) { withdrawApplication(id: $id) { id status } }`, { id: app1Id });
    check("S10", "Dev withdraws application", (wRes.data as any)?.withdrawApplication?.status === "WITHDRAWN");

    // 5. Dev applies again
    const app2 = await gql(dev.cookie, `mutation($input: ApplyToIssueInput!) { applyToIssue(input: $input) { id status } }`, { input: { issueId: s10IssueId, message: "Apply 2 after withdraw" } });
    const app2Id = (app2.data as any)?.applyToIssue?.id;
    check("S10", "Dev applies again after withdrawing", (app2.data as any)?.applyToIssue?.status === "PENDING");

    // 6. Client selects dev -> status becomes AWAITING_FUNDING
    const chainNow = await getChainTimestamp();
    const s10Deadline = new Date((chainNow + 5 * 86400) * 1000).toISOString();
    const selRes = await gql(
      client.cookie,
      `mutation($issue: ID!, $app: ID!, $dl: String!) { selectDeveloper(issueId: $issue, applicationId: $app, deliveryDeadline: $dl) { id } }`,
      { issue: s10IssueId, app: app2Id, dl: s10Deadline },
    );
    if (selRes.errors?.length) throw new Error(`S10 selectDeveloper failed: ${selRes.errors[0]?.message}`);

    // 7. Client attempts updateIssue after selecting dev -> blocked
    const lateUpdate = await gql(
      client.cookie,
      `mutation($input: UpdateIssueInput!) { updateIssue(input: $input) { id } }`,
      { input: { id: s10IssueId, title: "Blocked edit title" } },
    );
    check("S10", "updateIssue blocked after selecting developer (ISSUE_NOT_EDITABLE)", lateUpdate.errors?.[0]?.extensions?.code === "ISSUE_NOT_EDITABLE");
  } catch (err: any) {
    check("S10", "Scenario S10 completed", false, err.message);
  }

  // Summary
  console.log(`\n========================================`);
  console.log(`Results: ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  console.log(`========================================\n`);

  process.exit(failures === 0 ? 0 : 1);
}

run().catch((error) => {
  console.error("Fatal error running E2E role flows:", error);
  process.exit(1);
});
