"use client";

import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { graphqlRequest } from "@/lib/graphql-client";
import { Button } from "@/components/ui/button";

type CatchUp = { status: "OK" | "EMPTY" | "AI_UNAVAILABLE"; summary: string | null; messageCount: number };

export function ChatCatchUp({ conversationId }: { conversationId: string }) {
  const [result, setResult] = useState<CatchUp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = () => {
    setLoading(true);
    setError(null);
    setResult(null);
    void graphqlRequest<{ summarizeConversation: CatchUp }>(`mutation CatchUp($id: ID!) { summarizeConversation(conversationId: $id) { status summary messageCount } }`, { id: conversationId })
      .then((data) => setResult(data.summarizeConversation))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not catch up."))
      .finally(() => setLoading(false));
  };

  const message = result?.status === "EMPTY" ? "You're all caught up" : result?.status === "AI_UNAVAILABLE" ? `AI unavailable · ${result.messageCount} unread message${result.messageCount === 1 ? "" : "s"}` : null;

  return (
    <div className="space-y-2 border-b border-[var(--line)] px-4 py-2.5 sm:px-5">
      <Button type="button" size="sm" variant="ghost" disabled={loading} aria-busy={loading} onClick={run}><Sparkles className="h-3.5 w-3.5" aria-hidden="true" />{loading ? "Catching up…" : "Catch up"}</Button>
      {error && <p role="alert" className="text-xs text-[var(--bad)]">{error}</p>}
      <div aria-live="polite" className="space-y-2">
        {message && <p className="text-xs text-[var(--ink-2)]">{message}</p>}
        {result?.status === "OK" && result.summary && <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--ink-3)]">AI-generated summary · advisory, check the messages before acting</p>
            <button type="button" onClick={() => setResult(null)} className="-m-1.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-[var(--sunk)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--link)]" aria-label="Dismiss summary"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
          </div>
          <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6">{result.summary}</p>
        </div>}
      </div>
    </div>
  );
}
