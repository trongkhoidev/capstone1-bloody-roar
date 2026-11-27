import { describe } from "bun:test";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { prisma } from "@bloody-roar/database";
import { encodeAbiParameters, encodeEventTopics } from "@bloody-roar/shared";
import { ESCROW_ABI, keccakUtf8, type FoldEffect, type Hex } from "@bloody-roar/shared/escrow";
import { scanOnce } from "../src/indexer/scanner";
import { handleReorg } from "../src/indexer/reorg";
import { applyFoldEffects } from "../src/effects";
import { captureResolvedUndo, undoResolved } from "../src/indexer/undo";
import { cleanupChain, fakeRpc, newChain, rawLog, testConfig } from "./helpers";

describe.skipIf(!process.env.TEST_DATABASE_URL)("database", () => {

const config = testConfig();
const address = () => `0x${randomBytes(20).toString("hex")}` as Hex;
const hash = () => `0x${randomBytes(32).toString("hex")}` as Hex;
const escrowKey = `br_sysmsg_${randomBytes(8).toString("hex")}`;
const escrowIdHash = keccakUtf8(escrowKey);
const deadline = 0x6aaa0000n + 30n * 86400n;
const termsHash = hash();
const deliveryHash = hash();
let clientId = "", developerId = "", issueId = "", tokenId = "", releaseIssueId = "";
const extraIssueIds: string[] = [];
let clientAddress: Hex, developerAddress: Hex;

const systemMessages = (id: string) => prisma.message.findMany({ where: { issueId: id, type: "SYSTEM" }, orderBy: { createdAt: "asc" } });

beforeAll(async () => {
  assertTestDatabase(process.env.TEST_DATABASE_URL);
  clientAddress = address(); developerAddress = address();
  clientId = (await prisma.user.create({ data: { walletAddress: clientAddress, role: "CLIENT" } })).id;
  developerId = (await prisma.user.create({ data: { walletAddress: developerAddress, role: "DEVELOPER" } })).id;
  tokenId = (await prisma.token.create({ data: { symbol: "SYS", name: "System", address: address(), decimals: 6, chainId: config.chainId } })).id;
  issueId = (await prisma.issue.create({ data: { title: "System message test", description: "Chat system events.", category: "BUG_FIX", status: "AWAITING_FUNDING", bountyAmount: "100", tokenId, clientId, requiredSkills: [] } })).id;
  const applicationId = (await prisma.application.create({ data: { issueId, developerId, status: "PENDING" } })).id;
  await prisma.fundingReservation.create({ data: { issueId, applicationId, clientId, developerId, escrowKey, escrowIdHash,
    chainId: config.chainId, contractAddress: config.escrowAddress, tokenAddress: address(), amountRaw: "100000000",
    deliveryDeadline: new Date(Number(deadline) * 1000), termsHash, termsVersion: 1, expiresAt: new Date(Date.now() + 86400_000), status: "AWAITING_FUNDING" } });
  await prisma.submission.create({ data: { issueId, developerId, deliveryHash, status: "SUBMITTED" } });
});

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: [clientId, developerId] } } });
  await prisma.claimableBalance.deleteMany({ where: { chainId: config.chainId, contractAddress: config.escrowAddress.toLowerCase() } });
  await prisma.escrowProjection.deleteMany({ where: { issueId: { in: [issueId, releaseIssueId, ...extraIssueIds] } } });
  await prisma.fundingReservation.deleteMany({ where: { issueId } });
  await prisma.issue.deleteMany({ where: { id: { in: [issueId, releaseIssueId, ...extraIssueIds] } } });
  await prisma.token.deleteMany({ where: { id: tokenId } });
  await prisma.user.deleteMany({ where: { id: { in: [clientId, developerId] } } });
  await cleanupChain(prisma, config);
  await prisma.$disconnect();
});

test("deposit and submit each post one SYSTEM message, rescans do not duplicate, reorg removes them", async () => {
  const chain = newChain(); chain.safe = 100n; chain.blockHash.set(99n, "0xsys99"); chain.blockHash.set(100n, "0xsys100");
  const deposit = rawLog({ address: config.escrowAddress, block: 100, blockHash: "0xsys100", tx: "0xsysdeposit", txIndex: 0, logIndex: 0 });
  deposit.topics = [...encodeEventTopics({ abi: ESCROW_ABI, eventName: "Deposited", args: { escrowId: escrowKey, client: clientAddress, developer: developerAddress } })];
  deposit.data = encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes32" }], [address(), address(), 100000000n, deadline, termsHash]);
  const work = rawLog({ address: config.escrowAddress, block: 100, blockHash: "0xsys100", tx: "0xsyswork", txIndex: 1, logIndex: 1 });
  work.topics = [...encodeEventTopics({ abi: ESCROW_ABI, eventName: "WorkSubmitted", args: { escrowId: escrowKey, developer: developerAddress } })];
  work.data = encodeAbiParameters([{ type: "bytes32" }], [deliveryHash]);
  chain.logs = [deposit, work];
  await scanOnce({ db: prisma, rpc: fakeRpc(chain), config });
  const events = await prisma.chainEvent.findMany({ where: { escrowIdHash }, orderBy: { logIndex: "asc" } });
  const messages = await systemMessages(issueId);
  expect(messages.map((m) => ({ content: m.content, senderId: m.senderId, clientMessageId: m.clientMessageId })).sort((a, b) => a.content.localeCompare(b.content))).toEqual([
    { content: "Delivery v1 submitted", senderId: developerId, clientMessageId: `${events[1]!.id}:sys` },
    { content: "Escrow funded", senderId: clientId, clientMessageId: `${events[0]!.id}:sys` },
  ]);
  const conversation = await prisma.conversation.findFirstOrThrow({ where: { issueId, kind: "ISSUE_WORK" } });
  expect(messages.every((m) => m.conversationId === conversation.id)).toBe(true);
  expect(conversation.lastMessageAt).not.toBeNull();

  await prisma.projectionCheckpoint.update({ where: { chainId_contractAddress: { chainId: config.chainId, contractAddress: config.escrowAddress } }, data: { lastScannedBlock: 99n } });
  await scanOnce({ db: prisma, rpc: fakeRpc(chain), config });
  expect(await systemMessages(issueId)).toHaveLength(2);

  chain.blockHash.set(100n, "0xsysnew100");
  chain.logs = [];
  await handleReorg({ db: prisma, rpc: fakeRpc(chain), config });
  expect(await systemMessages(issueId)).toHaveLength(0);
  expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).lastMessageAt).toBeNull();
});

test("a RELEASE resolution posts one Funds released message and undo removes it", async () => {
  const issue = await prisma.issue.create({ data: { title: "Release", description: "release", category: "BUG_FIX", status: "IN_PROGRESS", bountyAmount: "100", tokenId, clientId, developerId, requiredSkills: [] } });
  releaseIssueId = issue.id;
  const key = `sysmsg-release-${issue.id}`, releaseHash = keccakUtf8(key), at = new Date(Date.now() + 86400_000);
  await prisma.escrowProjection.create({ data: { issueId: issue.id, escrowKey: key, escrowIdHash: releaseHash, chainId: config.chainId, contractAddress: config.escrowAddress, client: clientAddress, developer: developerAddress,
    arbiter: address(), feeRecipient: address(), amountRaw: "100", depositedAt: new Date(), deliveryDeadline: at, reviewDeadline: at, termsHash, phase: "FUNDED", lastProjectedBlock: 100n } });
  const effect: Extract<FoldEffect, { kind: "ESCROW_RESOLVED" }> = { kind: "ESCROW_RESOLVED", escrowIdHash: releaseHash, resolution: "RELEASE", client: clientAddress, developer: developerAddress,
    feeRecipient: address(), clientAmount: 0n, developerAmount: 98n, platformFee: 2n, decisionHash: `0x${"00".repeat(32)}` };
  const meta = { chainId: config.chainId, contractAddress: config.escrowAddress, chainEventId: `sysmsg-${issue.id}`, escrowIdHash: releaseHash, blockNumber: 101n,
    blockHash: `0x${"11".repeat(32)}` as Hex, txHash: `0x${"22".repeat(32)}` as Hex, txIndex: 0, logIndex: 0, blockTimestamp: BigInt(Math.floor(Date.now() / 1000)) };
  const undo = await prisma.$transaction(async (tx) => { const snapshot = await captureResolvedUndo(tx, effect); await applyFoldEffects(tx, [effect], meta); return snapshot; });
  const messages = await systemMessages(issue.id);
  expect(messages.map((m) => ({ content: m.content, senderId: m.senderId, clientMessageId: m.clientMessageId }))).toEqual([
    { content: "Funds released", senderId: clientId, clientMessageId: `${meta.chainEventId}:sys` },
  ]);
  const earlier = new Date(Date.now() - 3600_000);
  await prisma.message.create({ data: { conversationId: messages[0]!.conversationId, issueId: issue.id, senderId: developerId, content: "before release", type: "TEXT", createdAt: earlier } });
  await prisma.$transaction((tx) => undoResolved(tx, meta.chainEventId, undo, config.chainId, config.escrowAddress));
  expect(await systemMessages(issue.id)).toHaveLength(0);
  expect((await prisma.conversation.findUniqueOrThrow({ where: { id: messages[0]!.conversationId! } })).lastMessageAt).toEqual(earlier);
});

const projectedIssue = async (label: string) => {
  const issue = await prisma.issue.create({ data: { title: label, description: label, category: "BUG_FIX", status: "IN_PROGRESS", bountyAmount: "100", tokenId, clientId, developerId, requiredSkills: [] } });
  extraIssueIds.push(issue.id);
  const key = `sysmsg-${label}-${issue.id}`, idHash = keccakUtf8(key), at = new Date(Date.now() + 86400_000);
  await prisma.escrowProjection.create({ data: { issueId: issue.id, escrowKey: key, escrowIdHash: idHash, chainId: config.chainId, contractAddress: config.escrowAddress, client: clientAddress, developer: developerAddress,
    arbiter: address(), feeRecipient: address(), amountRaw: "100", depositedAt: new Date(), deliveryDeadline: at, reviewDeadline: at, termsHash, phase: "FUNDED", lastProjectedBlock: 100n } });
  const meta = { chainId: config.chainId, contractAddress: config.escrowAddress, chainEventId: `sysmsg-${label}-${issue.id}`, escrowIdHash: idHash, blockNumber: 101n,
    blockHash: `0x${"11".repeat(32)}` as Hex, txHash: `0x${"33".repeat(32)}` as Hex, txIndex: 0, logIndex: 0, blockTimestamp: BigInt(Math.floor(Date.now() / 1000)) };
  return { issue, idHash, meta };
};

test("a REVIEW_TIMEOUT resolution posts Funds released from the developer", async () => {
  const { issue, idHash, meta } = await projectedIssue("timeout");
  const effect: Extract<FoldEffect, { kind: "ESCROW_RESOLVED" }> = { kind: "ESCROW_RESOLVED", escrowIdHash: idHash, resolution: "REVIEW_TIMEOUT", client: clientAddress, developer: developerAddress,
    feeRecipient: address(), clientAmount: 0n, developerAmount: 98n, platformFee: 2n, decisionHash: `0x${"00".repeat(32)}` };
  await prisma.$transaction((tx) => applyFoldEffects(tx, [effect], meta));
  expect((await systemMessages(issue.id)).map((m) => ({ content: m.content, senderId: m.senderId, clientMessageId: m.clientMessageId }))).toEqual([
    { content: "Funds released", senderId: developerId, clientMessageId: `${meta.chainEventId}:sys` },
  ]);
});

test("a WorkSubmitted with no matching submission still posts Delivery submitted", async () => {
  const { issue, idHash, meta } = await projectedIssue("unmatched");
  await prisma.$transaction((tx) => applyFoldEffects(tx, [{ kind: "WORK_SUBMITTED", escrowIdHash: idHash, developer: developerAddress, deliveryHash: hash() }], meta));
  expect((await systemMessages(issue.id)).map((m) => ({ content: m.content, senderId: m.senderId }))).toEqual([{ content: "Delivery submitted", senderId: developerId }]);
});

test("the delivery version is the delivery's position among the issue's submissions", async () => {
  const { issue, idHash, meta } = await projectedIssue("version");
  await prisma.submission.create({ data: { issueId: issue.id, developerId, status: "SUPERSEDED", submittedAt: new Date(Date.now() - 7200_000) } });
  await prisma.submission.create({ data: { issueId: issue.id, developerId, status: "DRAFT", submittedAt: new Date(Date.now() - 3600_000) } });
  const matched = hash();
  await prisma.submission.create({ data: { issueId: issue.id, developerId, deliveryHash: matched, status: "SUBMITTED" } });
  await prisma.$transaction((tx) => applyFoldEffects(tx, [{ kind: "WORK_SUBMITTED", escrowIdHash: idHash, developer: developerAddress, deliveryHash: matched }], meta));
  expect((await systemMessages(issue.id)).map((m) => m.content)).toEqual(["Delivery v2 submitted"]);
});

});
