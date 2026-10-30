import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { decodeFunctionResult, encodeFunctionData } from "@bloody-roar/shared";
import { fundingIntentTypedData, keccakUtf8, type Hex } from "@bloody-roar/shared/escrow";
import { createRpcClient } from "../../apps/worker/src/chain/client";
import { closeSync, openSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import "./check-env";

// Run against a fresh chain owned by this fixture; never reuse or stop another node.
if (process.env.SCANNER_MANAGED !== "1") {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(8545, "127.0.0.1", () => probe.close(() => resolve()));
  });
  const runDir = "tests/e2e/.run";
  const pidPath = `${runDir}/scanner-hardhat.pid`;
  await mkdir(runDir, { recursive: true });
  const log = openSync(`${runDir}/scanner-hardhat.log`, "w");
  const node = Bun.spawn(["sh", "-c", "ulimit -n 65536; exec bun run --cwd apps/contracts node"], { stdout: log, stderr: log });
  await writeFile(pidPath, String(node.pid));
  try {
    const deadline = Date.now() + 30_000;
    let ready = false;
    while (Date.now() < deadline && node.exitCode === null) {
      try {
        const response = await fetch("http://127.0.0.1:8545", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) });
        const body = await response.json() as { result?: string };
        if (body.result === "0x7a69") { ready = true; break; }
      } catch { /* node is starting */ }
      await Bun.sleep(250);
    }
    if (!ready) throw new Error("Hardhat failed to start; see tests/e2e/.run/scanner-hardhat.log");
    const deploy = Bun.spawn(["bun", "run", "--cwd", "apps/contracts", "deploy:local"], { stdout: "inherit", stderr: "inherit" });
    if (await deploy.exited !== 0) throw new Error("Hardhat deployment failed");
    const scanner = Bun.spawn(["bun", "run", "tests/e2e/scanner-deposit.ts"], { env: { ...process.env, SCANNER_MANAGED: "1" }, stdout: "inherit", stderr: "inherit" });
    process.exitCode = await scanner.exited;
  } finally {
    if ((await readFile(pidPath, "utf8")).trim() === String(node.pid) && node.exitCode === null) node.kill();
    await node.exited;
    await unlink(pidPath);
    closeSync(log);
  }
  process.exit(process.exitCode);
}

assertTestDatabase(process.env.TEST_DATABASE_URL);
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DIRECT_URL = process.env.TEST_DATABASE_URL;
console.log("Test database:", new URL(process.env.TEST_DATABASE_URL).pathname.slice(1));
const manifest = await Bun.file("apps/contracts/deployments/localhost.json").json() as { address: Hex; token: Hex; chainId: string; deployBlock: number };
if (manifest.chainId !== "31337") throw new Error("Expected local Hardhat chain");
const rpc = createRpcClient({ url: "http://127.0.0.1:8545" });
if (BigInt(await rpc.call<string>("eth_chainId", [])) !== 31337n) throw new Error("Unexpected RPC chain");
const accounts = await rpc.call<Hex[]>("eth_accounts", []);
const client = accounts[2], developer = accounts[3], rival = accounts[4];
if (!client || !developer || !rival) throw new Error("Missing Hardhat accounts");
process.env.CHAIN_ID = "31337";
process.env.RPC_URL = "http://127.0.0.1:8545";
process.env.ESCROW_ADDRESS = manifest.address;
const { prisma } = await import("@bloody-roar/database");
const { execute, loadSchema } = await import("../../apps/web/src/test/graphql-execute");
await loadSchema();
const { scanOnce } = await import("../../apps/worker/src/indexer/scanner");
const { handleReorg } = await import("../../apps/worker/src/indexer/reorg");
const { reconcileProjections } = await import("../../apps/worker/src/reconciler/projections");
const { reconcileIndexedIntents } = await import("../../apps/worker/src/reconciler/intents");
const config = { chainId: 31337, escrowAddress: manifest.address.toLowerCase(), escrowDeployBlock: BigInt(manifest.deployBlock), rangeSize: 2000, reorgWindow: 64, finality: "latest" as const };
const suffix = randomBytes(8).toString("hex"), escrowKey = `br_e5_${suffix}`, escrowIdHash = keccakUtf8(escrowKey);
const termsHash = `0x${randomBytes(32).toString("hex")}` as Hex;
let issueId = "", issue2Id = "", tokenId = "";
let createdToken = false;
let ownsIndexerFixture = false;
const createdUsers: string[] = [];
const fixtureIntentIds: string[] = [];
const fixturePaths: string[] = [];
async function user(walletAddress: Hex, role: "CLIENT" | "DEVELOPER" | "ADMIN") {
  const address = walletAddress.toLowerCase();
  const found = await prisma.user.findUnique({ where: { walletAddress: address } });
  if (found) return found;
  const created = await prisma.user.create({ data: { walletAddress: address, role } });
  createdUsers.push(created.id);
  return created;
}
async function send(from: Hex, to: Hex, data: Hex, gas = "0x500000") {
  const txHash = await rpc.call<Hex>("eth_sendTransaction", [{ from, to, data, gas }]);
  const receipt = await rpc.call<{ status: string } | null>("eth_getTransactionReceipt", [txHash]);
  if (!receipt || receipt.status !== "0x1") throw new Error(`Local transaction failed: ${txHash}`);
  return txHash.toLowerCase();
}
try {
  const where = { chainId: config.chainId, contractAddress: config.escrowAddress };
  if (await prisma.chainEvent.count({ where }) || await prisma.projectionCheckpoint.findUnique({ where: { chainId_contractAddress: where } }) ||
      await prisma.reconciliationFinding.count({ where: { kind: { startsWith: `chain:${config.chainId}:${config.escrowAddress}:` } } }) ||
      await prisma.claimableBalance.count({ where })) {
    throw new Error("Scanner test requires an unused local contract address in the test database");
  }
  ownsIndexerFixture = true;
  const clientUser = await user(client, "CLIENT"), developerUser = await user(developer, "DEVELOPER"), rivalUser = await user(rival, "DEVELOPER");
  let token = await prisma.token.findUnique({ where: { chainId_address: { chainId: config.chainId, address: manifest.token.toLowerCase() } } });
  if (!token) {
    token = await prisma.token.create({ data: { symbol: `T${suffix}`, name: "Scanner E2E token", address: manifest.token.toLowerCase(), decimals: 6, chainId: config.chainId } });
    createdToken = true;
  }
  tokenId = token.id;
  const issue = await prisma.issue.create({ data: { title: "Scanner E2E deposit", description: "Real contract deposit creates a funded projection.", category: "BUG_FIX", status: "AWAITING_FUNDING", bountyAmount: "100", tokenId, clientId: clientUser.id, requiredSkills: [] } });
  issueId = issue.id;
  const application = await prisma.application.create({ data: { issueId, developerId: developerUser.id, status: "PENDING" } });
  const rivalApplication = await prisma.application.create({ data: { issueId, developerId: rivalUser.id, status: "PENDING" } });
  const block = await rpc.call<{ timestamp: string }>("eth_getBlockByNumber", ["latest", false]);
  const deadline = BigInt(block.timestamp) + 30n * 86400n;
  const reservation = await prisma.fundingReservation.create({ data: { issueId, applicationId: application.id, clientId: clientUser.id, developerId: developerUser.id, escrowKey, escrowIdHash, chainId: config.chainId, contractAddress: config.escrowAddress, tokenAddress: manifest.token.toLowerCase(), amountRaw: "100000000", deliveryDeadline: new Date(Number(deadline) * 1000), termsHash, termsVersion: 1, status: "AWAITING_FUNDING", expiresAt: new Date(Date.now() + 86400_000) } });
  const mintAbi = [{ type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] }] as const;
  await send(client, manifest.token, encodeFunctionData({ abi: mintAbi, functionName: "mint", args: [client, 100000000n] }));
  const expiry = new Date(Date.now() + 10 * 60_000);
  const typed = fundingIntentTypedData({ chainId: config.chainId, verifyingContract: manifest.address, escrowId: escrowKey,
    client, developer, token: manifest.token, amount: 100000000n, deliveryDeadline: deadline, termsHash,
    intentExpiry: BigInt(Math.floor(expiry.getTime() / 1000)), nonce: 7n });
  const payload = JSON.stringify({ ...typed, types: { EIP712Domain: [
    { name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" },
  ], ...typed.types } }, (_key, value) => typeof value === "bigint" ? value.toString() : value);
  const signature = await rpc.call<string>("eth_signTypedData_v4", [client, payload]);
  async function graphql(source: string, variables: Record<string, unknown>) {
    const result = await execute(source, { db: prisma, user: clientUser }, variables);
    if (result.errors?.length) throw new Error(result.errors[0]?.message ?? "GraphQL mutation failed");
    if (!result.data) throw new Error("GraphQL returned no data");
    return result.data;
  }
  await graphql(`mutation($id: ID!, $signature: String!, $nonce: String!, $expiry: String!) {
    submitFundingIntent(reservationId: $id, signature: $signature, nonce: $nonce, intentExpiry: $expiry) { id status }
  }`, { id: reservation.id, signature, nonce: "7", expiry: expiry.toISOString() });
  const prepared = await graphql(`mutation($id: ID!) { prepareEscrowDeposit(reservationId: $id) {
    steps { intentId method contractAddress data value }
  } }`, { id: reservation.id });
  const steps = (prepared.prepareEscrowDeposit as { steps: Array<{ intentId: string; method: string; contractAddress: Hex; data: Hex }> }).steps;
  assert.deepEqual(steps.map((step) => step.method), ["approve", "deposit"]);
  const approval = steps[0]!, depositStep = steps[1]!;
  const approvalTx = await send(client, approval.contractAddress, approval.data);
  const record = (intentId: string, txHash: string) => graphql(`mutation($id: ID!, $hash: String!) {
    recordTransactionSubmitted(intentId: $id, txHash: $hash) { id status }
  }`, { id: intentId, hash: txHash });
  await record(approval.intentId, approvalTx);
  const snapshot = await rpc.call<string>("evm_snapshot", []);
  const firstTx = await send(client, depositStep.contractAddress, depositStep.data);
  await record(depositStep.intentId, firstTx);
  while (await scanOnce({ db: prisma, rpc, config })) { /* scan until caught up */ }
  const first = await prisma.escrowProjection.findUniqueOrThrow({ where: { escrowIdHash } });
  assert.equal(first.phase, "FUNDED");
  assert.equal(first.issueId, issueId);
  assert.equal((await prisma.issue.findUniqueOrThrow({ where: { id: issueId } })).status, "IN_PROGRESS");
  assert.equal((await prisma.fundingReservation.findUniqueOrThrow({ where: { escrowIdHash } })).status, "FUNDED");
  assert.equal((await prisma.transactionIntent.findUniqueOrThrow({ where: { id: depositStep.intentId } })).status, "CONFIRMED");
  assert.equal((await prisma.application.findUniqueOrThrow({ where: { id: application.id } })).status, "ACCEPTED");
  assert.equal((await prisma.application.findUniqueOrThrow({ where: { id: rivalApplication.id } })).status, "REJECTED");
  const fundingEvent = await prisma.chainEvent.findFirstOrThrow({ where: { txHash: firstTx, escrowIdHash } });
  const notifications = await prisma.notification.findMany({ where: { dedupeKey: { startsWith: `${fundingEvent.id}:` } }, select: { type: true, userId: true } });
  for (const expected of [
    { type: "DEPOSIT_CONFIRMED", userId: clientUser.id }, { type: "APPLICATION_ACCEPTED", userId: developerUser.id },
    { type: "TASK_ASSIGNED", userId: developerUser.id }, { type: "APPLICATION_REJECTED", userId: rivalUser.id },
  ]) assert.ok(notifications.some((notification) => notification.type === expected.type && notification.userId === expected.userId));
  const balanceAbi = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] }] as const;
  const balanceData = encodeFunctionData({ abi: balanceAbi, functionName: "balanceOf", args: [manifest.address] });
  const balanceResult = await rpc.call<Hex>("eth_call", [{ to: manifest.token, data: balanceData }, "latest"]);
  assert.equal(decodeFunctionResult({ abi: balanceAbi, functionName: "balanceOf", data: balanceResult }), 100000000n);
  console.log("Signed FundingIntent, prepared approval/deposit and projected real deposit as FUNDED");

  assert.equal(await rpc.call<boolean>("evm_revert", [snapshot]), true);
  const replacementTx = await send(client, depositStep.contractAddress, depositStep.data, "0x510000");
  assert.notEqual(replacementTx, firstTx);
  assert.ok(await handleReorg({ db: prisma, rpc, config }));
  while (await scanOnce({ db: prisma, rpc, config })) { /* scan until caught up */ }
  const afterReorg = await prisma.escrowProjection.findUniqueOrThrow({ where: { escrowIdHash } });
  assert.equal(afterReorg.phase, "FUNDED");
  assert.equal(afterReorg.issueId, issueId);
  assert.equal((await prisma.chainEvent.findFirstOrThrow({ where: { txHash: firstTx, escrowIdHash } })).canonical, false);
  assert.equal((await prisma.chainEvent.findFirstOrThrow({ where: { txHash: replacementTx, escrowIdHash } })).canonical, true);
  assert.equal((await prisma.fundingReservation.findUniqueOrThrow({ where: { escrowIdHash } })).status, "FUNDED");
  assert.equal((await prisma.issue.findUniqueOrThrow({ where: { id: issueId } })).status, "IN_PROGRESS");
  assert.equal((await prisma.transactionIntent.findUniqueOrThrow({ where: { id: depositStep.intentId } })).status, "SUBMITTED");
  console.log("Real Hardhat reorg replaced the orphaned deposit and restored the projection");

  await prisma.escrowProjection.update({ where: { escrowIdHash }, data: { phase: "DISPUTED" } });
  const replay = Bun.spawnSync(["bun", "run", "worker:replay", "--from", String(manifest.deployBlock)], {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, DIRECT_URL: process.env.TEST_DATABASE_URL,
      RPC_URL: "http://127.0.0.1:8545", CHAIN_ID: "31337", ESCROW_ADDRESS: manifest.address,
      ESCROW_DEPLOY_BLOCK: String(manifest.deployBlock), FINALITY: "latest" },
    stdout: "pipe", stderr: "pipe",
  });
  if (replay.exitCode !== 0) throw new Error(`Replay CLI failed with exit code ${replay.exitCode}`);
  assert.equal((await prisma.escrowProjection.findUniqueOrThrow({ where: { escrowIdHash } })).phase, "FUNDED");
  while (await scanOnce({ db: prisma, rpc, config })) { /* scan until caught up */ }
  assert.equal((await prisma.projectionCheckpoint.findUniqueOrThrow({ where: { chainId_contractAddress: { chainId: config.chainId, contractAddress: config.escrowAddress } } })).replayStatus, "IDLE");
  console.log("Replay rebuilt the canonical projection");

  const reconcile = () => reconcileProjections({ db: prisma, rpc, config, now: () => new Date() });
  const unavailable = { ...rpc, call: async <T>(method: string, params: unknown[]): Promise<T> => {
    if (method === "eth_call") throw new Error("RPC unavailable");
    return rpc.call<T>(method, params);
  } };
  await assert.rejects(reconcileProjections({ db: prisma, rpc: unavailable, config, now: () => new Date() }), /RPC unavailable/);
  assert.equal(await prisma.reconciliationFinding.count({ where: { escrowIdHash } }), 0);
  assert.equal(await reconcile(), 0);
  await prisma.escrowProjection.update({ where: { escrowIdHash }, data: { amountRaw: "100000001" } });
  assert.equal(await reconcile(), 1);
  const finding = await prisma.reconciliationFinding.findFirstOrThrow({ where: { escrowIdHash, resolvedAt: null } });
  assert.ok(finding.kind.endsWith(":amount"));
  await prisma.escrowProjection.update({ where: { escrowIdHash }, data: { amountRaw: "100000000" } });
  assert.equal(await reconcile(), 0);
  assert.ok((await prisma.reconciliationFinding.findUniqueOrThrow({ where: { id: finding.id } })).resolvedAt);
  console.log("Reconciler detected and closed a projection mismatch at the indexed block");

  await prisma.claimableBalance.create({ data: { chainId: config.chainId, contractAddress: config.escrowAddress, address: client.toLowerCase(), amountRaw: "1" } });
  assert.equal(await reconcile(), 1);
  const claimFinding = await prisma.reconciliationFinding.findFirstOrThrow({ where: { kind: { endsWith: `:claimable:${client.toLowerCase()}` }, resolvedAt: null } });
  await prisma.claimableBalance.update({ where: { chainId_contractAddress_address: { chainId: config.chainId, contractAddress: config.escrowAddress, address: client.toLowerCase() } }, data: { amountRaw: "0" } });
  assert.equal(await reconcile(), 0);
  assert.ok((await prisma.reconciliationFinding.findUniqueOrThrow({ where: { id: claimFinding.id } })).resolvedAt);

  const burnAbi = [{ type: "function", name: "burn", stateMutability: "nonpayable", inputs: [{ name: "from", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] }] as const;
  await send(client, manifest.token, encodeFunctionData({ abi: burnAbi, functionName: "burn", args: [manifest.address, 1n] }));
  assert.equal(await reconcile(), null); // do not compare an unindexed block
  assert.equal(await prisma.reconciliationFinding.count({ where: { kind: { endsWith: ":solvency" }, resolvedAt: null } }), 0);
  while (await scanOnce({ db: prisma, rpc, config })) { /* catch up to the token transaction */ }
  assert.equal(await reconcile(), 1);
  const solventFinding = await prisma.reconciliationFinding.findFirstOrThrow({ where: { kind: { endsWith: ":solvency" }, resolvedAt: null } });
  await send(client, manifest.token, encodeFunctionData({ abi: mintAbi, functionName: "mint", args: [manifest.address, 1n] }));
  while (await scanOnce({ db: prisma, rpc, config })) { /* catch up to the token transaction */ }
  assert.equal(await reconcile(), 0);
  assert.ok((await prisma.reconciliationFinding.findUniqueOrThrow({ where: { id: solventFinding.id } })).resolvedAt);
  console.log("Reconciler detected and closed claimable and solvency mismatches");

  const devGraphql = async (source: string, variables: Record<string, unknown>) => {
    const result = await execute(source, { db: prisma, user: developerUser }, variables);
    if (result.errors?.length || !result.data) throw new Error(result.errors?.[0]?.message ?? "Developer GraphQL failed");
    return result.data;
  };
  const createDraft = async (text: string) => {
    const data = await devGraphql(`mutation($issue: ID!, $text: String!) { createSubmissionDraft(issueId: $issue, description: $text) { id status } }`, { issue: issueId, text });
    return data.createSubmissionDraft as { id: string; status: string };
  };
  const prepareWork = async (id: string) => {
    const data = await devGraphql(`mutation($id: ID!) { prepareSubmitWork(submissionId: $id) { intentId contractAddress data } }`, { id });
    return data.prepareSubmitWork as { intentId: string; contractAddress: Hex; data: Hex };
  };
  const sendWork = async (step: { intentId: string; contractAddress: Hex; data: Hex }, gas = "0x500000") => {
    const txHash = await send(developer, step.contractAddress, step.data, gas);
    await devGraphql(`mutation($id: ID!, $hash: String!) { recordTransactionSubmitted(intentId: $id, txHash: $hash) { status } }`, { id: step.intentId, hash: txHash });
    while (await scanOnce({ db: prisma, rpc, config })) { /* scan until caught up */ }
    return txHash;
  };
  const draft1 = await createDraft("first delivery");
  assert.equal(draft1.status, "DRAFT");
  const step1 = await prepareWork(draft1.id);
  const editingPrepared = await execute(`mutation($issue: ID!, $id: ID!) { createSubmissionDraft(issueId: $issue, submissionId: $id, description: "changed") { id } }`, { db: prisma, user: developerUser }, { issue: issueId, id: draft1.id });
  assert.equal(editingPrepared.errors, undefined);
  assert.notEqual((editingPrepared.data?.createSubmissionDraft as { id: string }).id, draft1.id);
  const workSnapshot = await rpc.call<string>("evm_snapshot", []);
  const tx1 = await sendWork(step1);
  const submission1 = await prisma.submission.findUniqueOrThrow({ where: { id: draft1.id } });
  assert.equal(submission1.status, "SUBMITTED");
  assert.equal((await prisma.transactionIntent.findUniqueOrThrow({ where: { id: step1.intentId } })).status, "CONFIRMED");
  assert.equal((await prisma.escrowProjection.findUniqueOrThrow({ where: { escrowIdHash } })).deliveryHash, submission1.deliveryHash);
  assert.equal((await prisma.escrowProjection.findUniqueOrThrow({ where: { escrowIdHash } })).externalDelivery, false);
  assert.ok(await prisma.notification.findFirst({ where: { userId: clientUser.id, type: "WORK_SUBMITTED", data: { path: ["issueId"], equals: issueId } } }));
  assert.equal(await rpc.call<boolean>("evm_revert", [workSnapshot]), true);
  const replacementWork = await send(developer, step1.contractAddress, step1.data, "0x510000");
  assert.notEqual(replacementWork, tx1);
  assert.ok(await handleReorg({ db: prisma, rpc, config }));
  assert.equal((await prisma.submission.findUniqueOrThrow({ where: { id: draft1.id } })).status, "DRAFT");
  assert.equal((await prisma.transactionIntent.findUniqueOrThrow({ where: { id: step1.intentId } })).status, "SUBMITTED");
  while (await scanOnce({ db: prisma, rpc, config })) { /* scan replacement delivery */ }
  assert.equal((await prisma.submission.findUniqueOrThrow({ where: { id: draft1.id } })).status, "SUBMITTED");
  await graphql(`mutation($id: ID!) { requestChanges(submissionId: $id, notes: "please revise") { changesRequested } }`, { id: draft1.id });
  assert.ok(await prisma.notification.findFirst({ where: { userId: developerUser.id, type: "CHANGES_REQUESTED", data: { path: ["issueId"], equals: issueId } } }));
  const draft2 = await createDraft("revised delivery");
  const step2 = await prepareWork(draft2.id);
  await sendWork(step2);
  assert.equal((await prisma.submission.findUniqueOrThrow({ where: { id: draft1.id } })).status, "SUPERSEDED");
  assert.equal((await prisma.submission.findUniqueOrThrow({ where: { id: draft2.id } })).status, "SUBMITTED");
  const externalSnapshot = await rpc.call<string>("evm_snapshot", []);
  const unknownHash = `0x${randomBytes(32).toString("hex")}` as Hex;
  const { encodeEscrowCall } = await import("@bloody-roar/shared/escrow");
  await send(developer, manifest.address, encodeEscrowCall("submitWork", { escrowId: escrowKey, deliveryHash: unknownHash }));
  while (await scanOnce({ db: prisma, rpc, config })) { /* scan external delivery */ }
  assert.equal((await prisma.escrowProjection.findUniqueOrThrow({ where: { escrowIdHash } })).externalDelivery, true);
  assert.equal((await prisma.submission.findUniqueOrThrow({ where: { id: draft2.id } })).status, "SUPERSEDED");
  assert.equal(await rpc.call<boolean>("evm_revert", [externalSnapshot]), true);
  await rpc.call("evm_mine", []);
  assert.ok(await handleReorg({ db: prisma, rpc, config }));
  assert.equal((await prisma.escrowProjection.findUniqueOrThrow({ where: { escrowIdHash } })).externalDelivery, false);
  assert.equal((await prisma.submission.findUniqueOrThrow({ where: { id: draft2.id } })).status, "SUBMITTED");
  const feeUser = await user(accounts[6]!, "DEVELOPER");
  const release = (await graphql(`mutation($id: ID!) { prepareReleaseFunds(issueId: $id) { intentId contractAddress data } }`, { id: issueId })).prepareReleaseFunds as { intentId: string; contractAddress: Hex; data: Hex };
  const releaseSnapshot = await rpc.call<string>("evm_snapshot", []);
  const releaseHash = await send(client, release.contractAddress, release.data);
  await record(release.intentId, releaseHash);
  while (await scanOnce({ db: prisma, rpc, config })) { /* scan release */ }
  assert.equal((await prisma.issue.findUniqueOrThrow({ where: { id: issueId } })).outcome, "RELEASE");
  assert.equal((await prisma.issue.findUniqueOrThrow({ where: { id: issueId } })).status, "COMPLETED");
  assert.equal((await prisma.transactionIntent.findUniqueOrThrow({ where: { id: release.intentId } })).status, "CONFIRMED");
  const claimable = async (wallet: Hex) => (await prisma.claimableBalance.findUniqueOrThrow({ where: { chainId_contractAddress_address: { chainId: config.chainId, contractAddress: config.escrowAddress, address: wallet.toLowerCase() } } })).amountRaw.toFixed();
  assert.equal(await claimable(developer), "97500000");
  assert.equal(await claimable(accounts[6]!), "2500000");
  assert.equal(await prisma.notification.count({ where: { type: "ESCROW_RESOLVED", data: { path: ["issueId"], equals: issueId } } }), 2);
  assert.ok(await prisma.notification.findFirst({ where: { type: "FUNDS_CLAIMABLE", userId: feeUser.id, data: { path: ["issueId"], equals: issueId } } }));
  const devBalanceData = encodeFunctionData({ abi: balanceAbi, functionName: "balanceOf", args: [developer] });
  const beforeClaim = decodeFunctionResult({ abi: balanceAbi, functionName: "balanceOf", data: await rpc.call<Hex>("eth_call", [{ to: manifest.token, data: devBalanceData }, "latest"]) });
  const forbiddenClaim = await execute(`mutation($recipient: String!) { prepareClaim(recipient: $recipient) { intentId } }`, { user: developerUser, db: prisma }, { recipient: client });
  assert.equal(forbiddenClaim.errors?.[0]?.extensions?.code, "FORBIDDEN");
  const claim = (await devGraphql(`mutation($recipient: String!) { prepareClaim(recipient: $recipient) { intentId contractAddress data } }`, { recipient: developer })).prepareClaim as { intentId: string; contractAddress: Hex; data: Hex };
  fixtureIntentIds.push(claim.intentId);
  const claimSnapshot = await rpc.call<string>("evm_snapshot", []);
  const claimHash = await send(developer, claim.contractAddress, claim.data);
  while (await scanOnce({ db: prisma, rpc, config })) { /* scan claim */ }
  assert.equal((await prisma.transactionIntent.findUniqueOrThrow({ where: { id: claim.intentId } })).status, "AWAITING_SIGNATURE");
  await devGraphql(`mutation($id: ID!, $hash: String!) { recordTransactionSubmitted(intentId: $id, txHash: $hash) { status } }`, { id: claim.intentId, hash: claimHash });
  await reconcileIndexedIntents(prisma, config);
  assert.equal(await claimable(developer), "0");
  assert.equal((await prisma.transactionIntent.findUniqueOrThrow({ where: { id: claim.intentId } })).status, "CONFIRMED");
  const afterClaim = decodeFunctionResult({ abi: balanceAbi, functionName: "balanceOf", data: await rpc.call<Hex>("eth_call", [{ to: manifest.token, data: devBalanceData }, "latest"]) });
  assert.equal(afterClaim - beforeClaim, 97500000n);
  const claimEvent = await prisma.chainEvent.findFirstOrThrow({ where: { chainId: config.chainId, contractAddress: config.escrowAddress, txHash: claimHash, eventName: "Claimed" } });
  assert.ok(await prisma.notification.findFirst({ where: { userId: developerUser.id, type: "PAYMENT_RECEIVED", dedupeKey: { startsWith: `${claimEvent.id}:` } } }));
  const emptyClaim = await execute(`mutation($recipient: String!) { prepareClaim(recipient: $recipient) { intentId } }`, { user: developerUser, db: prisma }, { recipient: developer });
  assert.equal(emptyClaim.errors?.[0]?.extensions?.code, "NOTHING_TO_CLAIM");
  assert.equal(await rpc.call<boolean>("evm_revert", [claimSnapshot]), true);
  await rpc.call("evm_mine", []);
  assert.ok(await handleReorg({ db: prisma, rpc, config }));
  assert.equal(await claimable(developer), "97500000");
  assert.equal((await prisma.transactionIntent.findUniqueOrThrow({ where: { id: claim.intentId } })).status, "SUBMITTED");
  assert.equal((await prisma.chainEvent.findUniqueOrThrow({ where: { id: claimEvent.id } })).canonical, false);
  assert.equal(await prisma.notification.count({ where: { dedupeKey: { startsWith: `${claimEvent.id}:` } } }), 0);
  console.log("Real claim transferred funds, notified the recipient and was reversed by reorg");

  assert.equal(await rpc.call<boolean>("evm_revert", [releaseSnapshot]), true);
  await rpc.call("evm_mine", []);
  assert.ok(await handleReorg({ db: prisma, rpc, config }));
  assert.equal((await prisma.issue.findUniqueOrThrow({ where: { id: issueId } })).status, "IN_PROGRESS");
  assert.equal(await claimable(developer), "0");
  assert.equal(await claimable(accounts[6]!), "0");
  assert.equal((await prisma.transactionIntent.findUniqueOrThrow({ where: { id: release.intentId } })).status, "SUBMITTED");
  console.log("Real release credited payouts and reorg reversed the resolution");

  const mineToCheckpoint = async () => {
    const checkpoint = await prisma.projectionCheckpoint.findUniqueOrThrow({ where: { chainId_contractAddress: { chainId: config.chainId, contractAddress: config.escrowAddress } } });
    await rpc.call("evm_mine", []);
    while (BigInt(await rpc.call<string>("eth_blockNumber", [])) < checkpoint.lastScannedBlock) await rpc.call("evm_mine", []);
  };
  const proposalSnapshot = await rpc.call<string>("evm_snapshot", []);
  const proposal = (await graphql(`mutation($issue: ID!) { prepareProposeSettlement(issueId: $issue, clientBps: 3000) { intentId contractAddress data } }`, { issue: issueId })).prepareProposeSettlement as { intentId: string; contractAddress: Hex; data: Hex };
  const proposalHash = await send(client, proposal.contractAddress, proposal.data);
  await record(proposal.intentId, proposalHash);
  while (await scanOnce({ db: prisma, rpc, config })) { /* scan proposed settlement */ }
  const pending = await prisma.settlementProposal.findFirstOrThrow({ where: { escrowIdHash, status: "PENDING" } });
  assert.equal(pending.clientBps, 3000);
  assert.equal((await prisma.transactionIntent.findUniqueOrThrow({ where: { id: proposal.intentId } })).status, "CONFIRMED");
  assert.ok(await prisma.notification.findFirst({ where: { userId: developerUser.id, type: "SETTLEMENT_PROPOSED", data: { path: ["issueId"], equals: issueId } } }));
  const selfAccept = await execute(`mutation($issue: ID!) { prepareAcceptSettlement(issueId: $issue) { intentId } }`, { db: prisma, user: clientUser }, { issue: issueId });
  assert.equal(selfAccept.errors?.[0]?.extensions?.code, "FORBIDDEN");
  const acceptance = (await devGraphql(`mutation($issue: ID!) { prepareAcceptSettlement(issueId: $issue) { intentId contractAddress data } }`, { issue: issueId })).prepareAcceptSettlement as { intentId: string; contractAddress: Hex; data: Hex };
  const acceptanceSnapshot = await rpc.call<string>("evm_snapshot", []);
  const acceptanceHash = await send(developer, acceptance.contractAddress, acceptance.data);
  await devGraphql(`mutation($id: ID!, $hash: String!) { recordTransactionSubmitted(intentId: $id, txHash: $hash) { status } }`, { id: acceptance.intentId, hash: acceptanceHash });
  while (await scanOnce({ db: prisma, rpc, config })) { /* scan acceptance */ }
  assert.equal((await prisma.issue.findUniqueOrThrow({ where: { id: issueId } })).outcome, "SETTLEMENT");
  assert.equal((await prisma.settlementProposal.findUniqueOrThrow({ where: { id: pending.id } })).status, "ACCEPTED");
  assert.equal(await claimable(client), "30000000");
  assert.equal(await claimable(developer), "68250000");
  assert.equal(await claimable(accounts[6]!), "1750000");
  assert.equal(await rpc.call<boolean>("evm_revert", [acceptanceSnapshot]), true);
  await mineToCheckpoint();
  assert.ok(await handleReorg({ db: prisma, rpc, config }));
  assert.equal((await prisma.settlementProposal.findUniqueOrThrow({ where: { id: pending.id } })).status, "PENDING");
  const revocation = (await graphql(`mutation($issue: ID!) { prepareRevokeSettlement(issueId: $issue) { intentId contractAddress data } }`, { issue: issueId })).prepareRevokeSettlement as { intentId: string; contractAddress: Hex; data: Hex };
  const revocationHash = await send(client, revocation.contractAddress, revocation.data);
  await record(revocation.intentId, revocationHash);
  while (await scanOnce({ db: prisma, rpc, config })) { /* scan revocation */ }
  assert.equal((await prisma.settlementProposal.findUniqueOrThrow({ where: { id: pending.id } })).status, "REVOKED");
  assert.ok(await prisma.notification.findFirst({ where: { userId: developerUser.id, type: "SETTLEMENT_REVOKED", data: { path: ["issueId"], equals: issueId } } }));
  assert.equal(await rpc.call<boolean>("evm_revert", [proposalSnapshot]), true);
  await mineToCheckpoint();
  assert.ok(await handleReorg({ db: prisma, rpc, config }));
  assert.equal(await prisma.settlementProposal.findUnique({ where: { id: pending.id } }), null);
  assert.equal((await prisma.escrowProjection.findUniqueOrThrow({ where: { escrowIdHash } })).settlementProposer, null);
  console.log("E14: proposal, acceptance, revocation and their reorg undo verified");

  const outsiderAccount = accounts[7]!;
  const outsiderUser = await user(outsiderAccount, "DEVELOPER");
  const adminUser = await user(accounts[1]!, "ADMIN");
  if (adminUser.role !== "ADMIN") throw new Error("Hardhat account #1 must be an admin in the test database");
  const { localUploadPath } = await import("../../apps/web/src/lib/storage");
  const evidenceKey = `${clientUser.id}/scanner-evidence-${suffix}.txt`;
  const evidencePath = localUploadPath(evidenceKey);
  if (!evidencePath) throw new Error("Invalid evidence fixture path");
  await mkdir(path.dirname(evidencePath.destination), { recursive: true });
  await writeFile(evidencePath.destination, "scanner evidence", { flag: "wx" });
  fixturePaths.push(evidencePath.destination);
  const attachment = await prisma.attachment.create({ data: { issueId, uploaderId: clientUser.id, purpose: "EVIDENCE", status: "ATTACHED", fileName: "evidence.txt", fileUrl: `/api/uploads?key=${encodeURIComponent(evidenceKey)}`, fileMime: "text/plain", fileSize: 16, sha256: createHash("sha256").update("scanner evidence").digest("hex") } });
  const disputeGql = async (actor: typeof clientUser, source: string, variables: Record<string, unknown>) => {
    const result = await execute(source, { user: actor, db: prisma }, variables);
    if (result.errors?.length || !result.data) throw new Error(result.errors?.[0]?.message ?? "Dispute GraphQL failed");
    return result.data;
  };
  const evidenceMutation = `mutation($issue: ID!, $statement: String!, $files: [ID!]) { createEvidenceManifest(issueId: $issue, statement: $statement, attachmentIds: $files) { id manifestHash } }`;
  const callMutation = (name: string) => `mutation($issue: ID!, $manifest: ID!) { ${name}(issueId: $issue, manifestId: $manifest) { intentId contractAddress data } }`;
  const actionMutation = (name: string) => `mutation($issue: ID!) { ${name}(issueId: $issue) { intentId contractAddress data } }`;
  const sendPrepared = async (actor: typeof clientUser, wallet: Hex, step: { intentId: string; contractAddress: Hex; data: Hex }) => {
    const txHash = await send(wallet, step.contractAddress, step.data);
    await disputeGql(actor, `mutation($id: ID!, $hash: String!) { recordTransactionSubmitted(intentId: $id, txHash: $hash) { status } }`, { id: step.intentId, hash: txHash });
    while (await scanOnce({ db: prisma, rpc, config })) { /* scan dispute transaction */ }
  };
  const advance = async (seconds: number) => { await rpc.call("evm_increaseTime", [seconds]); await rpc.call("evm_mine", []); };
  const beginDispute = async (label: string) => {
    const created = await disputeGql(clientUser, evidenceMutation, { issue: issueId, statement: `Client evidence statement ${label}`, files: [attachment.id] });
    const evidence = created.createEvidenceManifest as { id: string; manifestHash: string };
    const prepared = await disputeGql(clientUser, callMutation("prepareRaiseDispute"), { issue: issueId, manifest: evidence.id });
    await sendPrepared(clientUser, client, prepared.prepareRaiseDispute as { intentId: string; contractAddress: Hex; data: Hex });
    assert.equal((await prisma.dispute.findUniqueOrThrow({ where: { issueId } })).evidenceManifestHash, evidence.manifestHash);
    return evidence;
  };
  const draftRuling = async (kind: "INITIAL" | "FINAL", bps: number) => {
    const result = await disputeGql(adminUser, `mutation($issue: ID!, $kind: RulingDraftKind!, $bps: Int!) { draftRuling(issueId: $issue, kind: $kind, clientBps: $bps, rationale: "Evidence supports this decision.") { decisionHash safeTransactionJson } }`, { issue: issueId, kind, bps });
    const draft = result.draftRuling as { decisionHash: string; safeTransactionJson: string };
    const safe = JSON.parse(draft.safeTransactionJson) as { transactions: Array<{ to: Hex; data: Hex }> };
    const tx = safe.transactions[0]!;
    assert.equal(tx.data, encodeEscrowCall(kind === "INITIAL" ? "postInitialRuling" : "postFinalRuling", { escrowId: escrowKey, clientBps: String(bps), decisionHash: draft.decisionHash }));
    await send(accounts[5]!, tx.to, tx.data);
    while (await scanOnce({ db: prisma, rpc, config })) { /* scan arbiter ruling */ }
  };
  const finishDispute = async (name: "prepareFinalizeRuling" | "prepareFinalizeArbiterTimeoutSplit") => {
    const result = await disputeGql(outsiderUser, actionMutation(name), { issue: issueId });
    await sendPrepared(outsiderUser, outsiderAccount, result[name] as { intentId: string; contractAddress: Hex; data: Hex });
    assert.equal((await prisma.dispute.findUniqueOrThrow({ where: { issueId } })).status, "RESOLVED");
    assert.equal(await prisma.notification.count({ where: { type: "DISPUTE_RESOLVED", data: { path: ["issueId"], equals: issueId } } }), 2);
    assert.equal(await prisma.notification.count({ where: { type: "ESCROW_RESOLVED", data: { path: ["issueId"], equals: issueId } } }), 0);
  };
  const rollbackDispute = async (snapshotId: string) => {
    assert.equal(await rpc.call<boolean>("evm_revert", [snapshotId]), true);
    await mineToCheckpoint();
    assert.ok(await handleReorg({ db: prisma, rpc, config }));
    assert.equal(await prisma.dispute.findUnique({ where: { issueId } }), null);
    assert.equal((await prisma.issue.findUniqueOrThrow({ where: { id: issueId } })).status, "IN_PROGRESS");
    while (await scanOnce({ db: prisma, rpc, config })) { /* catch up after dispute reorg */ }
  };
  const e15Snapshot = await rpc.call<string>("evm_snapshot", []);
  await beginDispute("E15");
  assert.ok(await prisma.notification.findFirst({ where: { userId: adminUser.id, type: "DISPUTE_RAISED", data: { path: ["issueId"], equals: issueId } } }));
  const counter = (await disputeGql(developerUser, evidenceMutation, { issue: issueId, statement: "Developer counter evidence statement", files: [] })).createEvidenceManifest as { id: string };
  const counterStep = await disputeGql(developerUser, callMutation("prepareSubmitCounterpartyEvidence"), { issue: issueId, manifest: counter.id });
  await sendPrepared(developerUser, developer, counterStep.prepareSubmitCounterpartyEvidence as { intentId: string; contractAddress: Hex; data: Hex });
  assert.ok(await prisma.notification.findFirst({ where: { userId: clientUser.id, type: "EVIDENCE_SUBMITTED", data: { path: ["issueId"], equals: issueId } } }));
  await advance(72 * 3600); await draftRuling("INITIAL", 5000); await advance(7 * 86400);
  assert.ok((await execute(actionMutation("prepareChallengeRuling"), { user: clientUser, db: prisma }, { issue: issueId })).errors?.length);
  await finishDispute("prepareFinalizeRuling");
  assert.equal(await claimable(client), "50000000"); assert.equal(await claimable(developer), "48750000"); assert.equal(await claimable(accounts[6]!), "1250000");
  await rollbackDispute(e15Snapshot);
  console.log("E15: evidence, Safe initial ruling, finalization and dispute reorg verified");

  const e16Snapshot = await rpc.call<string>("evm_snapshot", []);
  await beginDispute("E16"); await advance(72 * 3600); await draftRuling("INITIAL", 3000);
  const challenge = await disputeGql(clientUser, actionMutation("prepareChallengeRuling"), { issue: issueId });
  await sendPrepared(clientUser, client, challenge.prepareChallengeRuling as { intentId: string; contractAddress: Hex; data: Hex });
  assert.equal((await prisma.dispute.findUniqueOrThrow({ where: { issueId } })).status, "CHALLENGED");
  assert.ok(await prisma.notification.findFirst({ where: { type: "RULING_CHALLENGED", userId: developerUser.id, data: { path: ["issueId"], equals: issueId } } }));
  const challengedTimeoutSnapshot = await rpc.call<string>("evm_snapshot", []);
  const earlyChallengeTimeout = await execute(actionMutation("prepareFinalizeArbiterTimeoutSplit"), { user: outsiderUser, db: prisma }, { issue: issueId });
  assert.equal(earlyChallengeTimeout.errors?.[0]?.extensions?.code, "DEADLINE_NOT_REACHED");
  await advance(30 * 86400); await finishDispute("prepareFinalizeArbiterTimeoutSplit");
  assert.equal((await prisma.dispute.findUniqueOrThrow({ where: { issueId } })).finalClientBps, 5000);
  assert.equal(await rpc.call<boolean>("evm_revert", [challengedTimeoutSnapshot]), true);
  await mineToCheckpoint(); assert.ok(await handleReorg({ db: prisma, rpc, config }));
  assert.equal((await prisma.dispute.findUniqueOrThrow({ where: { issueId } })).status, "CHALLENGED");
  while (await scanOnce({ db: prisma, rpc, config })) { /* catch up after challenged timeout reorg */ }
  await draftRuling("FINAL", 7000); await advance(86400); await finishDispute("prepareFinalizeRuling");
  assert.equal(await claimable(client), "70000000"); assert.equal(await claimable(developer), "29250000"); assert.equal(await claimable(accounts[6]!), "750000");
  await rollbackDispute(e16Snapshot);
  console.log("E16: challenge and Safe final ruling verified");

  const e17Snapshot = await rpc.call<string>("evm_snapshot", []);
  await beginDispute("E17");
  const earlyTimeout = await execute(actionMutation("prepareFinalizeArbiterTimeoutSplit"), { user: outsiderUser, db: prisma }, { issue: issueId });
  assert.equal(earlyTimeout.errors?.[0]?.extensions?.code, "DEADLINE_NOT_REACHED");
  await advance(30 * 86400); await finishDispute("prepareFinalizeArbiterTimeoutSplit");
  assert.equal(await claimable(client), "50000000"); assert.equal((await prisma.dispute.findUniqueOrThrow({ where: { issueId } })).finalClientBps, 5000);
  await rollbackDispute(e17Snapshot);
  console.log("E17: permissionless arbiter timeout verified");

  const secondIssue = await prisma.issue.create({ data: { title: "Missed delivery E12", description: "Permissionless refund after deadline.", category: "BUG_FIX", status: "AWAITING_FUNDING", bountyAmount: "100", tokenId, clientId: clientUser.id, requiredSkills: [] } });
  issue2Id = secondIssue.id;
  const secondApplication = await prisma.application.create({ data: { issueId: issue2Id, developerId: developerUser.id, status: "PENDING" } });
  const secondKey = `br_e12_${suffix}`, secondHash = keccakUtf8(secondKey), secondTerms = `0x${randomBytes(32).toString("hex")}` as Hex;
  const latestBlock = await rpc.call<{ timestamp: string }>("eth_getBlockByNumber", ["latest", false]);
  const secondDeadline = BigInt(latestBlock.timestamp) + 30n * 86400n;
  await prisma.fundingReservation.create({ data: { issueId: issue2Id, applicationId: secondApplication.id, clientId: clientUser.id, developerId: developerUser.id,
    escrowKey: secondKey, escrowIdHash: secondHash, chainId: config.chainId, contractAddress: config.escrowAddress, tokenAddress: manifest.token.toLowerCase(), amountRaw: "100000000",
    deliveryDeadline: new Date(Number(secondDeadline) * 1000), termsHash: secondTerms, termsVersion: 1, status: "AWAITING_FUNDING", expiresAt: new Date(Date.now() + 86400_000) } });
  const { encodeErc20Approve } = await import("@bloody-roar/shared/escrow");
  await send(client, manifest.token, encodeFunctionData({ abi: mintAbi, functionName: "mint", args: [client, 100000000n] }));
  await send(client, manifest.token, encodeErc20Approve(manifest.address, "100000000"));
  await send(client, manifest.address, encodeEscrowCall("deposit", { escrowId: secondKey, developer, amount: "100000000", deliveryDeadline: secondDeadline.toString(), termsHash: secondTerms }));
  while (await scanOnce({ db: prisma, rpc, config })) { /* scan second deposit */ }
  assert.equal((await prisma.escrowProjection.findUniqueOrThrow({ where: { escrowIdHash: secondHash } })).phase, "FUNDED");
  const refundQuery = `mutation($id: ID!) { prepareClaimMissedDeliveryRefund(issueId: $id) { intentId contractAddress data } }`;
  const reviewQuery = `mutation($id: ID!) { prepareClaimReviewTimeout(issueId: $id) { intentId contractAddress data } }`;
  assert.equal((await execute(refundQuery, { user: outsiderUser, db: prisma }, { id: issue2Id })).errors?.[0]?.extensions?.code, "DEADLINE_NOT_REACHED");
  assert.equal((await execute(reviewQuery, { user: outsiderUser, db: prisma }, { id: issueId })).errors?.[0]?.extensions?.code, "REVIEW_WINDOW_NOT_REACHED");

  const lateDraft = await createDraft("draft before deadline");
  await rpc.call("evm_increaseTime", [40 * 86400]);
  await rpc.call("evm_mine", []);
  const availability = await graphql(`query($issue: ID!) { issue(id: $issue) { escrow { availableActions { action reasonDisabled } } viewerCapabilities { canClaimReviewTimeout } } }`, { issue: issueId });
  const issueAvailability = availability.issue as { escrow: { availableActions: Array<{ action: string; reasonDisabled: string | null }> }; viewerCapabilities: { canClaimReviewTimeout: boolean } };
  assert.equal(issueAvailability.viewerCapabilities.canClaimReviewTimeout, true);
  assert.equal(issueAvailability.escrow.availableActions.find((a) => a.action === "claimReviewTimeout")?.reasonDisabled, null);
  console.log("Issue availability uses advanced Hardhat block time");

  const latePreparation = await execute(`mutation($id: ID!) { prepareSubmitWork(submissionId: $id) { intentId } }`, { db: prisma, user: developerUser }, { id: lateDraft.id });
  assert.equal(latePreparation.errors?.[0]?.extensions?.code, "DEADLINE_PASSED");
  const expired = await execute(`mutation($issue: ID!) { createSubmissionDraft(issueId: $issue, description: "late") { id } }`, { db: prisma, user: developerUser }, { issue: issueId });
  assert.equal(expired.errors?.[0]?.extensions?.code, "DEADLINE_PASSED");
  const outsiderGraphql = async (source: string, variables: Record<string, unknown>) => {
    const result = await execute(source, { user: outsiderUser, db: prisma }, variables);
    if (result.errors?.length || !result.data) throw new Error(result.errors?.[0]?.message ?? "Outsider GraphQL failed");
    return result.data;
  };
  const sendOutsider = async (step: { intentId: string; contractAddress: Hex; data: Hex }) => {
    const txHash = await send(outsiderAccount, step.contractAddress, step.data);
    await outsiderGraphql(`mutation($id: ID!, $hash: String!) { recordTransactionSubmitted(intentId: $id, txHash: $hash) { status } }`, { id: step.intentId, hash: txHash });
    while (await scanOnce({ db: prisma, rpc, config })) { /* scan timeout resolution */ }
  };
  const review = (await outsiderGraphql(reviewQuery, { id: issueId })).prepareClaimReviewTimeout as { intentId: string; contractAddress: Hex; data: Hex };
  await sendOutsider(review);
  assert.equal((await prisma.issue.findUniqueOrThrow({ where: { id: issueId } })).outcome, "REVIEW_TIMEOUT");
  assert.equal(await claimable(developer), "97500000"); assert.equal(await claimable(accounts[6]!), "2500000");
  const refund = (await outsiderGraphql(refundQuery, { id: issue2Id })).prepareClaimMissedDeliveryRefund as { intentId: string; contractAddress: Hex; data: Hex };
  await sendOutsider(refund);
  assert.equal((await prisma.issue.findUniqueOrThrow({ where: { id: issue2Id } })).outcome, "MISSED_DELIVERY_REFUND");
  assert.equal(await claimable(client), "100000000");
  const clientBalanceData = encodeFunctionData({ abi: balanceAbi, functionName: "balanceOf", args: [client] });
  const beforeRefundClaim = decodeFunctionResult({ abi: balanceAbi, functionName: "balanceOf", data: await rpc.call<Hex>("eth_call", [{ to: manifest.token, data: clientBalanceData }, "latest"]) });
  const clientClaim = (await graphql(`mutation($recipient: String!) { prepareClaim(recipient: $recipient) { intentId contractAddress data } }`, { recipient: client })).prepareClaim as { intentId: string; contractAddress: Hex; data: Hex };
  fixtureIntentIds.push(clientClaim.intentId);
  const clientClaimHash = await send(client, clientClaim.contractAddress, clientClaim.data); await record(clientClaim.intentId, clientClaimHash);
  while (await scanOnce({ db: prisma, rpc, config })) { /* scan refund claim */ }
  assert.equal(await claimable(client), "0");
  const afterRefundClaim = decodeFunctionResult({ abi: balanceAbi, functionName: "balanceOf", data: await rpc.call<Hex>("eth_call", [{ to: manifest.token, data: clientBalanceData }, "latest"]) });
  assert.equal(afterRefundClaim - beforeRefundClaim, 100000000n);
  console.log("E12/E13: permissionless refund and review timeout follow chain time; client claimed refund");

  console.log("E9: draft, on-chain submit, work reorg, changes, resubmit, external hash and deadline verified");

} finally {
  if (issueId) {
    const { localUploadPath } = await import("../../apps/web/src/lib/storage");
    for (const item of await prisma.evidenceManifest.findMany({ where: { issueId }, select: { storageKey: true } })) { const file = localUploadPath(item.storageKey); if (file) await unlink(file.destination).catch(() => {}); }
    await prisma.adminLog.deleteMany({ where: { targetId: issueId } });
    await prisma.rulingDraft.deleteMany({ where: { issueId } });
    await prisma.rulingRecord.deleteMany({ where: { escrowIdHash } });
    await prisma.evidenceManifest.deleteMany({ where: { issueId } });
    await prisma.dispute.deleteMany({ where: { issueId } });
    await prisma.notification.deleteMany({ where: { data: { path: ["issueId"], equals: issueId } } });
    await prisma.transactionIntent.deleteMany({ where: { issueId } });
    await prisma.settlementProposal.deleteMany({ where: { escrowIdHash } });
    await prisma.escrowProjection.deleteMany({ where: { escrowIdHash } });
    await prisma.fundingReservation.deleteMany({ where: { issueId } });
    await prisma.application.deleteMany({ where: { issueId } });
    await prisma.issue.deleteMany({ where: { id: issueId } });
  }
  if (issue2Id) {
    await prisma.notification.deleteMany({ where: { data: { path: ["issueId"], equals: issue2Id } } });
    await prisma.transactionIntent.deleteMany({ where: { issueId: issue2Id } });
    await prisma.escrowProjection.deleteMany({ where: { issueId: issue2Id } });
    await prisma.fundingReservation.deleteMany({ where: { issueId: issue2Id } });
    await prisma.issue.deleteMany({ where: { id: issue2Id } });
  }
  if (fixtureIntentIds.length) await prisma.transactionIntent.deleteMany({ where: { id: { in: fixtureIntentIds } } });
  if (createdToken) await prisma.token.deleteMany({ where: { id: tokenId } });
  if (ownsIndexerFixture) {
    const claimEvents = await prisma.chainEvent.findMany({ where: { chainId: config.chainId, contractAddress: config.escrowAddress, eventName: "Claimed" }, select: { id: true } });
    for (const event of claimEvents) await prisma.notification.deleteMany({ where: { dedupeKey: { startsWith: `${event.id}:` } } });
    await prisma.reconciliationFinding.deleteMany({ where: { kind: { startsWith: `chain:${config.chainId}:${config.escrowAddress}:` } } });
    await prisma.claimableBalance.deleteMany({ where: { chainId: config.chainId, contractAddress: config.escrowAddress } });
    await prisma.chainEvent.deleteMany({ where: { chainId: config.chainId, contractAddress: config.escrowAddress } });
    await prisma.projectionCheckpoint.deleteMany({ where: { chainId: config.chainId, contractAddress: config.escrowAddress } });
  }
  for (const file of fixturePaths) await unlink(file).catch(() => {});
  if (createdUsers.length) await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
  await prisma.$disconnect();
}
