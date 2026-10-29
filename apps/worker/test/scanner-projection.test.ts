import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { prisma } from "@bloody-roar/database";
import { encodeAbiParameters, encodeEventTopics } from "@bloody-roar/shared";
import { ESCROW_ABI, keccakUtf8, type Hex } from "@bloody-roar/shared/escrow";
import { scanOnce } from "../src/indexer/scanner";
import { handleReorg } from "../src/indexer/reorg";
import { requestReplay } from "../src/indexer/replay";
import { cleanupChain, fakeRpc, newChain, rawLog, testConfig } from "./helpers";

const config = testConfig();
const address = () => `0x${randomBytes(20).toString("hex")}` as Hex;
const hash = () => `0x${randomBytes(32).toString("hex")}` as Hex;
const escrowKey = `br_scanner_${randomBytes(8).toString("hex")}`;
const escrowIdHash = keccakUtf8(escrowKey);
const timestamp = 0x6aaa0000n;
const deadline = timestamp + 30n * 86400n;
const termsHash = hash();
const deliveryHash = hash();
const arbiter = address();
const feeRecipient = address();
let clientId = "", developerId = "", issueId = "", tokenId = "", applicationId = "";
let clientAddress: Hex, developerAddress: Hex;

beforeAll(async () => {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  clientAddress = address(); developerAddress = address();
  clientId = (await prisma.user.create({ data: { walletAddress: clientAddress, role: "CLIENT" } })).id;
  developerId = (await prisma.user.create({ data: { walletAddress: developerAddress, role: "DEVELOPER" } })).id;
  tokenId = (await prisma.token.create({ data: { symbol: "TST", name: "Test", address: address(), decimals: 6, chainId: config.chainId } })).id;
  issueId = (await prisma.issue.create({ data: { title: "Scanner deposit test", description: "Verify the deposit projection path.", category: "BUG_FIX", status: "AWAITING_FUNDING", bountyAmount: "100", tokenId, clientId, requiredSkills: [] } })).id;
  applicationId = (await prisma.application.create({ data: { issueId, developerId, status: "PENDING" } })).id;
  await prisma.fundingReservation.create({ data: { issueId, applicationId, clientId, developerId, escrowKey, escrowIdHash,
    chainId: config.chainId, contractAddress: config.escrowAddress, tokenAddress: address(), amountRaw: "100000000",
    deliveryDeadline: new Date(Number(deadline) * 1000), termsHash, termsVersion: 1, expiresAt: new Date(Date.now() + 86400_000), status: "AWAITING_FUNDING" } });
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: [clientId, developerId] } } });
  await prisma.escrowProjection.deleteMany({ where: { escrowIdHash } });
  await prisma.fundingReservation.deleteMany({ where: { issueId } });
  await prisma.application.deleteMany({ where: { issueId } });
  await prisma.issue.deleteMany({ where: { id: issueId } });
  await prisma.token.deleteMany({ where: { id: tokenId } });
  await prisma.user.deleteMany({ where: { id: { in: [clientId, developerId] } } });
  await cleanupChain(prisma, config);
  await prisma.$disconnect();
});

test("scanner orders deposit and delivery, folds state, applies effects and is idempotent", async () => {
  const chain = newChain(); chain.safe = 100n; chain.blockHash.set(99n, "0xabc99"); chain.blockHash.set(100n, "0xabc100");
  const deposit = rawLog({ address: config.escrowAddress, block: 100, blockHash: "0xabc100", tx: "0xdeposit", txIndex: 0, logIndex: 0 });
  deposit.topics = [...encodeEventTopics({ abi: ESCROW_ABI, eventName: "Deposited", args: { escrowId: escrowKey, client: clientAddress, developer: developerAddress } })];
  deposit.data = encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes32" }], [arbiter, feeRecipient, 100000000n, deadline, termsHash]);
  const work = rawLog({ address: config.escrowAddress, block: 100, blockHash: "0xabc100", tx: "0xwork", txIndex: 1, logIndex: 1 });
  work.topics = [...encodeEventTopics({ abi: ESCROW_ABI, eventName: "WorkSubmitted", args: { escrowId: escrowKey, developer: developerAddress } })];
  work.data = encodeAbiParameters([{ type: "bytes32" }], [deliveryHash]);
  chain.logs = [work, deposit];
  expect(await scanOnce({ db: prisma, rpc: fakeRpc(chain), config })).toMatchObject({ events: 2 });
  expect(await prisma.fundingReservation.findUniqueOrThrow({ where: { escrowIdHash } })).toMatchObject({ status: "FUNDED" });
  expect(await prisma.issue.findUniqueOrThrow({ where: { id: issueId } })).toMatchObject({ status: "IN_PROGRESS", developerId });
  expect(await prisma.application.findUniqueOrThrow({ where: { id: applicationId } })).toMatchObject({ status: "ACCEPTED" });
  expect(await prisma.escrowProjection.findUniqueOrThrow({ where: { escrowIdHash } })).toMatchObject({ phase: "FUNDED", deliveryHash, projectionVersion: 2, orphan: false });
  const events = await prisma.chainEvent.findMany({ where: { escrowIdHash }, orderBy: [{ blockNumber: "asc" }, { txIndex: "asc" }, { logIndex: "asc" }] });
  expect(events.map((event) => event.eventName)).toEqual(["Deposited", "WorkSubmitted"]);
  expect(await scanOnce({ db: prisma, rpc: fakeRpc(chain), config })).toBeNull();
  await prisma.projectionCheckpoint.update({ where: { chainId_contractAddress: { chainId: config.chainId, contractAddress: config.escrowAddress } }, data: { lastScannedBlock: 99n } });
  await scanOnce({ db: prisma, rpc: fakeRpc(chain), config });
  expect(await prisma.chainEvent.count({ where: { escrowIdHash } })).toBe(2);
  expect((await prisma.escrowProjection.findUniqueOrThrow({ where: { escrowIdHash } })).projectionVersion).toBe(2);

  // Replace the deposit block: the orphaned deposit must be undone before its replacement is applied.
  chain.blockHash.set(100n, "0xnew100");
  const replacement = { ...deposit, blockHash: "0xnew100", transactionHash: "0xreplacement" };
  chain.logs = [replacement];
  expect(await handleReorg({ db: prisma, rpc: fakeRpc(chain), config })).toEqual({ rewoundTo: 99n });
  expect(await prisma.escrowProjection.findUnique({ where: { escrowIdHash } })).toBeNull();
  expect((await prisma.fundingReservation.findUniqueOrThrow({ where: { escrowIdHash } })).status).toBe("AWAITING_FUNDING");
  expect((await prisma.issue.findUniqueOrThrow({ where: { id: issueId } })).status).toBe("AWAITING_FUNDING");
  expect((await prisma.application.findUniqueOrThrow({ where: { id: applicationId } })).status).toBe("PENDING");
  await scanOnce({ db: prisma, rpc: fakeRpc(chain), config });
  const replaced = await prisma.escrowProjection.findUniqueOrThrow({ where: { escrowIdHash } });
  expect(replaced).toMatchObject({ phase: "FUNDED", issueId, deliveryHash: null, orphan: false });
  const oldEvents = await prisma.chainEvent.findMany({ where: { escrowIdHash, canonical: false } });
  expect(oldEvents).toHaveLength(2);
  expect((await prisma.fundingReservation.findUniqueOrThrow({ where: { escrowIdHash } })).status).toBe("FUNDED");

  // Replay rebuilds a corrupted projection from canonical events, then resumes scanning.
  await prisma.escrowProjection.update({ where: { escrowIdHash }, data: { deliveryHash, phase: "DISPUTED" } });
  await requestReplay(prisma, config, 100n);
  expect(await prisma.escrowProjection.findUniqueOrThrow({ where: { escrowIdHash } })).toMatchObject({ phase: "FUNDED", deliveryHash: null, issueId });
  await scanOnce({ db: prisma, rpc: fakeRpc(chain), config });
  expect((await prisma.projectionCheckpoint.findUniqueOrThrow({ where: { chainId_contractAddress: { chainId: config.chainId, contractAddress: config.escrowAddress } } })).replayStatus).toBe("IDLE");

  // Do not overwrite an unrelated off-chain assignment during reorg.
  await prisma.issue.update({ where: { id: issueId }, data: { status: "AWAITING_FUNDING", developerId: clientId } });
  chain.blockHash.set(100n, "0xnewer100");
  await expect(handleReorg({ db: prisma, rpc: fakeRpc(chain), config })).rejects.toThrow("issue changed since projection");
  expect((await prisma.chainEvent.findFirstOrThrow({ where: { escrowIdHash, txHash: "0xreplacement" } })).canonical).toBe(true);
  expect((await prisma.issue.findUniqueOrThrow({ where: { id: issueId } })).developerId).toBe(clientId);
  await prisma.issue.update({ where: { id: issueId }, data: { status: "IN_PROGRESS", developerId } });
  chain.blockHash.set(100n, "0xnew100");

  chain.safe = 101n; chain.blockHash.set(101n, "0xabc101");
  const valid = rawLog({ address: config.escrowAddress, block: 101, blockHash: "0xabc101", tx: "0xvalid", txIndex: 0 });
  const invalid = rawLog({ address: config.escrowAddress, block: 101, blockHash: "0xabc101", tx: "0xinvalid", txIndex: 1 });
  invalid.topics = [`0x${"ff".repeat(32)}`];
  chain.logs = [valid, invalid];
  await expect(scanOnce({ db: prisma, rpc: fakeRpc(chain), config })).rejects.toThrow();
  expect(await prisma.chainEvent.count({ where: { txHash: "0xvalid", chainId: config.chainId } })).toBe(0);
  expect((await prisma.projectionCheckpoint.findUniqueOrThrow({ where: { chainId_contractAddress: { chainId: config.chainId, contractAddress: config.escrowAddress } } })).lastScannedBlock).toBe(100n);
});
