"use client";
import { useEffect, useState } from "react";
import { graphqlRequest } from "@/lib/graphql-client";

type Intent = { id: string; method: string; status: string; txHash: string | null; failureReason: string | null };
type Settled = "CONFIRMED" | "FAILED";

const QUERY = `query MyTransactions { myTransactions { id method status txHash failureReason } }`;
const POLL_MS = 4000;
const FAILED = ["FAILED", "EXPIRED", "DROPPED"];
const STATES: Record<string, { label: string; hint: string; banner: string }> = {
  AWAITING_SIGNATURE: { label: "Waiting for signature", hint: "Confirm the transaction in your wallet.", banner: "bn-info" },
  SUBMITTED: { label: "Sent", hint: "The network has the transaction and is adding it to a block.", banner: "bn-info" },
  PENDING_SAFE_HEAD: { label: "Waiting for safe block", hint: "It is in a block. The escrow updates once that block is safe.", banner: "bn-info" },
  CONFIRMED: { label: "Confirmed", hint: "The escrow is updated.", banner: "bn-info" },
  FAILED: { label: "Failed", hint: "The transaction did not go through. Nothing in the escrow changed.", banner: "bn-bad" },
};

const overall = (intents: Intent[]) =>
  intents.find((intent) => FAILED.includes(intent.status))
  ?? intents.find((intent) => intent.status !== "CONFIRMED")
  ?? intents.at(-1);

export function TransactionStatus({ intentIds, onSettled }: { intentIds: string[]; onSettled?: (status: Settled) => void }) {
  const [current, setCurrent] = useState<Intent | null>(null);
  const key = intentIds.join(",");

  useEffect(() => {
    let active = true, timer: ReturnType<typeof setTimeout> | undefined;
    const ids = key.split(",");
    const tick = async () => {
      const data = await graphqlRequest<{ myTransactions: Intent[] }>(QUERY).catch(() => null);
      if (!active) return;
      const mine = ids.map((id) => data?.myTransactions.find((intent) => intent.id === id) ?? { id, method: "", status: "AWAITING_SIGNATURE", txHash: null, failureReason: null });
      const shown = overall(mine) ?? null;
      setCurrent(shown);
      const settled = shown && (FAILED.includes(shown.status) ? "FAILED" : mine.every((intent) => intent.status === "CONFIRMED") ? "CONFIRMED" : null);
      if (settled) onSettled?.(settled);
      else timer = setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => { active = false; clearTimeout(timer); };
  }, [key, onSettled]);

  if (!current) return null;
  const state = STATES[FAILED.includes(current.status) ? "FAILED" : current.status] ?? STATES.SUBMITTED!;
  const hint = FAILED.includes(current.status) && current.failureReason ? current.failureReason : state.hint;
  return <div role="status" aria-live="polite" className={`banner ${state.banner}`} data-testid="transaction-status">
    <div>
      <b>{state.label}</b>
      <p style={{ margin: "2px 0 0", fontSize: 12.5 }}>{hint}</p>
      {current.txHash && <p className="mono" style={{ margin: "2px 0 0", fontSize: 11.5, color: "var(--ink-3)" }}>tx {current.txHash.slice(0, 10)}…{current.txHash.slice(-6)}</p>}
    </div>
  </div>;
}
