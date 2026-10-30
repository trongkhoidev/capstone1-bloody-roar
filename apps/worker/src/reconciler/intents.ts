import type { IntentStatus, PrismaClient } from "@bloody-roar/database";
import { decodeErrorResult } from "@bloody-roar/shared";
import { decodeEscrowLog, ESCROW_ABI, type Hex } from "@bloody-roar/shared/escrow";
import { getReceipt, type RpcClient, type RpcReceipt } from "../chain/client";
import { checkpointKey, lockCheckpoint, type IndexerConfig } from "../indexer/checkpoint";

const eventForMethod: Record<string, string> = {
  deposit: "Deposited", submitWork: "WorkSubmitted", proposeSettlement: "SettlementProposed",
  revokeSettlement: "SettlementRevoked", claim: "Claimed", releaseFunds: "EscrowResolved",
  claimMissedDeliveryRefund: "EscrowResolved", claimReviewTimeout: "EscrowResolved",
  acceptSettlement: "EscrowResolved", finalizeRuling: "EscrowResolved", finalizeArbiterTimeoutSplit: "EscrowResolved",
};
const resolutionForMethod: Record<string, string> = {
  releaseFunds: "RELEASE", claimMissedDeliveryRefund: "MISSED_DELIVERY_REFUND", claimReviewTimeout: "REVIEW_TIMEOUT",
  acceptSettlement: "SETTLEMENT", finalizeRuling: "RULING", finalizeArbiterTimeoutSplit: "ARBITER_TIMEOUT_SPLIT",
};

// Serialize with scanning and reorg so confirmation only references an applied canonical event.
export async function reconcileIndexedIntents(db: PrismaClient, config: IndexerConfig): Promise<void> {
  const checkpoint = await db.projectionCheckpoint.findUnique({ where: checkpointKey(config) });
  if (!checkpoint) return;
  await db.$transaction(async (tx) => {
    await lockCheckpoint(tx, config);
    const intents = await tx.transactionIntent.findMany({ where: {
      chainId: config.chainId, contractAddress: { equals: config.escrowAddress, mode: "insensitive" },
      status: { in: ["SUBMITTED", "PENDING_SAFE_HEAD"] }, txHash: { not: null }, method: { in: Object.keys(eventForMethod) },
    }, take: 200, orderBy: { submittedAt: "asc" } });
    const events = await tx.chainEvent.findMany({ where: { chainId: config.chainId,
      contractAddress: { equals: config.escrowAddress, mode: "insensitive" },
      txHash: { in: intents.map((intent) => intent.txHash!) }, canonical: true,
      eventName: { in: Object.values(eventForMethod) },
    } });
    for (const intent of intents) {
      const expectedEvent = eventForMethod[intent.method];
      if (!expectedEvent) continue;
      for (const row of events) {
        if (row.txHash !== intent.txHash || row.eventName !== expectedEvent) continue;
        const args = row.args as { topics?: Hex[]; data?: Hex };
        if (!args.topics || !args.data) continue;
        const event = decodeEscrowLog({ address: config.escrowAddress as Hex, topics: args.topics, data: args.data }, row.decoderVersion);
        if (event.name !== expectedEvent) continue;
        if (event.name === "Claimed") {
          const user = await tx.user.findUnique({ where: { id: intent.userId }, select: { walletAddress: true } });
          if (!user || user.walletAddress.toLowerCase() !== event.recipient.toLowerCase()) continue;
        } else {
          if (!("escrowIdHash" in event) || !intent.escrowKey) continue;
          const projection = await tx.escrowProjection.findUnique({ where: { escrowIdHash: event.escrowIdHash.toLowerCase() } });
          if (!projection || projection.escrowKey !== intent.escrowKey || projection.issueId !== intent.issueId) continue;
          if (event.name === "EscrowResolved" && event.resolution !== resolutionForMethod[intent.method]) continue;
        }
        await tx.transactionIntent.updateMany({ where: { id: intent.id, txHash: intent.txHash, status: { in: ["SUBMITTED", "PENDING_SAFE_HEAD"] } },
          data: { status: "CONFIRMED", confirmedByEventId: row.id } });
        break;
      }
    }
  }, { timeout: 30_000 });
}

// A submitted tx with no receipt after this long is DROPPED. The plan says "N blocks";
// TransactionIntent has no block column, so the rule uses wall-clock time (INTENT_MINUTES = 30).
export const INTENT_DROP_AFTER_MS = 30 * 60_000;

export type IntentView = {
  status: IntentStatus;
  expiresAt: Date;
  submittedAt: Date | null;
};

export type IntentChange = { status: IntentStatus; failureReason?: string };

// Receipts never set CONFIRMED. Only the applier does, once the matching event is folded.
export function nextIntentState(intent: IntentView, receipt: RpcReceipt | null, now: Date): IntentChange | null {
  if (intent.status === "AWAITING_SIGNATURE") {
    return now >= intent.expiresAt ? { status: "EXPIRED" } : null;
  }
  if (intent.status !== "SUBMITTED") return null;
  if (receipt === null) {
    const waitedMs = intent.submittedAt ? now.getTime() - intent.submittedAt.getTime() : 0;
    return waitedMs >= INTENT_DROP_AFTER_MS ? { status: "DROPPED", failureReason: "no receipt" } : null;
  }
  if (receipt.status === 0) return { status: "FAILED", failureReason: "reverted on chain" };
  return { status: "PENDING_SAFE_HEAD" };
}

// Receipts do not carry revert data. Trace when supported; retain the generic reason otherwise.
export async function failedTransactionReason(rpc: RpcClient, txHash: string): Promise<string> {
  try {
    const trace = await rpc.call<{ failed?: boolean; returnValue?: string }>("debug_traceTransaction", [txHash, {}]);
    if (trace.failed === false || !trace.returnValue) return "reverted on chain";
    const data = trace.returnValue.startsWith("0x") ? trace.returnValue : `0x${trace.returnValue}`;
    if (!/^0x[0-9a-fA-F]{8,}$/.test(data)) return "reverted on chain";
    return decodeErrorResult({ abi: ESCROW_ABI, data: data as Hex }).errorName;
  } catch {
    return "reverted on chain";
  }
}

export async function reconcileIntents(deps: { db: PrismaClient; rpc: RpcClient; now: () => Date }): Promise<number> {
  const intents = await deps.db.transactionIntent.findMany({
    where: { status: { in: ["AWAITING_SIGNATURE", "SUBMITTED"] } },
    take: 200,
  });
  let changed = 0;
  for (const intent of intents) {
    const receipt = intent.txHash ? await getReceipt(deps.rpc, intent.txHash) : null;
    const next = nextIntentState(intent, receipt, deps.now());
    if (!next) continue;
    if (receipt?.status === 0 && intent.txHash) next.failureReason = await failedTransactionReason(deps.rpc, intent.txHash);
    const updated = await deps.db.transactionIntent.updateMany({
      where: { id: intent.id, status: intent.status },
      data: { status: next.status, failureReason: next.failureReason ?? null },
    });
    changed += updated.count;
  }
  return changed;
}
