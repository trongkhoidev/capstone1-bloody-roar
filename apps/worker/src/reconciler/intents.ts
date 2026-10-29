import type { IntentStatus, PrismaClient } from "@bloody-roar/database";
import { decodeErrorResult } from "@bloody-roar/shared";
import { ESCROW_ABI, type Hex } from "@bloody-roar/shared/escrow";
import { getReceipt, type RpcClient, type RpcReceipt } from "../chain/client";

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
