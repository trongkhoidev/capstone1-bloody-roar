import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { encodeFunctionData } from "@bloody-roar/shared";
import { encodeErc20Approve, encodeEscrowCall, keccakUtf8, type Hex } from "@bloody-roar/shared/escrow";
import { createRpcClient } from "../../apps/worker/src/chain/client";

assertTestDatabase(process.env.TEST_DATABASE_URL);
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DIRECT_URL = process.env.TEST_DATABASE_URL;
console.log("Test database:", new URL(process.env.TEST_DATABASE_URL).pathname.slice(1));
const manifest = await Bun.file("apps/contracts/deployments/localhost.json").json() as { address: Hex; token: Hex; chainId: string; deployBlock: number };
if (manifest.chainId !== "31337") throw new Error("Expected local Hardhat chain");
const rpc = createRpcClient({ url: "http://127.0.0.1:8545" });
if (BigInt(await rpc.call<string>("eth_chainId", [])) !== 31337n) throw new Error("Unexpected RPC chain");
const accounts = await rpc.call<Hex[]>("eth_accounts", []);
const client = accounts[2], developer = accounts[3];
if (!client || !developer) throw new Error("Missing Hardhat accounts");
const { prisma } = await import("@bloody-roar/database");
const { scanOnce } = await import("../../apps/worker/src/indexer/scanner");
const { handleReorg } = await import("../../apps/worker/src/indexer/reorg");
const config = { chainId: 31337, escrowAddress: manifest.address.toLowerCase(), escrowDeployBlock: BigInt(manifest.deployBlock), rangeSize: 2000, reorgWindow: 64, finality: "latest" as const };
const suffix = randomBytes(8).toString("hex"), escrowKey = `br_e5_${suffix}`, escrowIdHash = keccakUtf8(escrowKey);
const termsHash = `0x${randomBytes(32).toString("hex")}` as Hex;
let issueId = "", tokenId = "";
let createdToken = false;
let ownsIndexerFixture = false;
const createdUsers: string[] = [];
async function user(walletAddress: Hex, role: "CLIENT" | "DEVELOPER") {
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
  if (await prisma.chainEvent.count({ where }) || await prisma.projectionCheckpoint.findUnique({ where: { chainId_contractAddress: where } })) {
    throw new Error("Scanner test requires an unused local contract address in the test database");
  }
  ownsIndexerFixture = true;
  const clientUser = await user(client, "CLIENT"), developerUser = await user(developer, "DEVELOPER");
  let token = await prisma.token.findUnique({ where: { chainId_address: { chainId: config.chainId, address: manifest.token.toLowerCase() } } });
  if (!token) {
    token = await prisma.token.create({ data: { symbol: `T${suffix}`, name: "Scanner E2E token", address: manifest.token.toLowerCase(), decimals: 6, chainId: config.chainId } });
    createdToken = true;
  }
  tokenId = token.id;
  const issue = await prisma.issue.create({ data: { title: "Scanner E2E deposit", description: "Real contract deposit creates a funded projection.", category: "BUG_FIX", status: "AWAITING_FUNDING", bountyAmount: "100", tokenId, clientId: clientUser.id, requiredSkills: [] } });
  issueId = issue.id;
  const application = await prisma.application.create({ data: { issueId, developerId: developerUser.id, status: "PENDING" } });
  const block = await rpc.call<{ timestamp: string }>("eth_getBlockByNumber", ["latest", false]);
  const deadline = BigInt(block.timestamp) + 30n * 86400n;
  await prisma.fundingReservation.create({ data: { issueId, applicationId: application.id, clientId: clientUser.id, developerId: developerUser.id, escrowKey, escrowIdHash, chainId: config.chainId, contractAddress: config.escrowAddress, tokenAddress: manifest.token.toLowerCase(), amountRaw: "100000000", deliveryDeadline: new Date(Number(deadline) * 1000), termsHash, termsVersion: 1, status: "AWAITING_FUNDING", expiresAt: new Date(Date.now() + 86400_000) } });
  const mintAbi = [{ type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] }] as const;
  await send(client, manifest.token, encodeFunctionData({ abi: mintAbi, functionName: "mint", args: [client, 100000000n] }));
  await send(client, manifest.token, encodeErc20Approve(manifest.address, "100000000"));
  const deposit = encodeEscrowCall("deposit", { escrowId: escrowKey, developer, amount: "100000000", deliveryDeadline: deadline.toString(), termsHash });
  const snapshot = await rpc.call<string>("evm_snapshot", []);
  const firstTx = await send(client, manifest.address, deposit);
  while (await scanOnce({ db: prisma, rpc, config })) { /* scan until caught up */ }
  const first = await prisma.escrowProjection.findUniqueOrThrow({ where: { escrowIdHash } });
  assert.equal(first.phase, "FUNDED");
  assert.equal(first.issueId, issueId);
  assert.equal((await prisma.issue.findUniqueOrThrow({ where: { id: issueId } })).status, "IN_PROGRESS");
  assert.equal((await prisma.fundingReservation.findUniqueOrThrow({ where: { escrowIdHash } })).status, "FUNDED");
  console.log("Real Hardhat deposit projected as FUNDED; issue IN_PROGRESS");

  assert.equal(await rpc.call<boolean>("evm_revert", [snapshot]), true);
  const replacementTx = await send(client, manifest.address, deposit, "0x510000");
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
} finally {
  if (issueId) {
    await prisma.notification.deleteMany({ where: { data: { path: ["issueId"], equals: issueId } } });
    await prisma.escrowProjection.deleteMany({ where: { escrowIdHash } });
    await prisma.fundingReservation.deleteMany({ where: { issueId } });
    await prisma.application.deleteMany({ where: { issueId } });
    await prisma.issue.deleteMany({ where: { id: issueId } });
  }
  if (createdToken) await prisma.token.deleteMany({ where: { id: tokenId } });
  if (ownsIndexerFixture) {
    await prisma.chainEvent.deleteMany({ where: { chainId: config.chainId, contractAddress: config.escrowAddress } });
    await prisma.projectionCheckpoint.deleteMany({ where: { chainId: config.chainId, contractAddress: config.escrowAddress } });
  }
  if (createdUsers.length) await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
  await prisma.$disconnect();
}
