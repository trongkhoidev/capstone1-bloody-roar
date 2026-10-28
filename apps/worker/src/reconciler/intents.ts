import type { IntentStatus, PrismaClient } from "@bloody-roar/database";
import { getReceipt, type RpcClient, type RpcReceipt } from "../chain/rpc";

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
    await deps.db.transactionIntent.update({
      where: { id: intent.id },
      data: { status: next.status, failureReason: next.failureReason ?? null },
    });
    changed++;
  }
  return changed;
}
