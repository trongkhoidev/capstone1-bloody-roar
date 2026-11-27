"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { io } from "socket.io-client";
import { graphqlRequest } from "@/lib/graphql-client";
import { useAuthStore, useAuthStoreApi } from "@/lib/store/use-auth-store";
import { useUiPreferences } from "@/lib/ui-preferences";
import { AuthRequiredPanel } from "@/components/auth/auth-required-panel";
import { Button } from "@/components/ui/button";
import { ChatRoom } from "./chat-room";

type Conversation = { id: string; kind: string; issueId: string; issue: { title: string }; counterpart: { name: string | null; walletAddress: string } | null; lastMessage: { content: string } | null; lastMessageAt: string | null; unreadCount: number; canWrite: boolean };
const QUERY = `query Inbox($after: ID) { myConversations(first: 30, after: $after) { id kind issueId issue { title } counterpart { name walletAddress } lastMessage { content } lastMessageAt unreadCount canWrite } }`;
export function InboxView() {
  const authStore = useAuthStoreApi();
  const user = useAuthStore((s) => s.user), { theme } = useUiPreferences(), params = useSearchParams();
  const [cachedRows, setRows] = useState<Conversation[]>([]), [loadedFor, setLoadedFor] = useState<string | null>(null), [selected, setSelected] = useState<string | null>(params.get("c"));
  const [unreadOnly, setUnreadOnly] = useState(false), [error, setError] = useState<string | null>(null), [more, setMore] = useState(false);
  const rows = loadedFor === user?.id ? cachedRows : [];
  const load = useCallback(async (after?: string) => {
    const actorId = user?.id; if (!actorId) return;
    try {
      const result = await graphqlRequest<{ myConversations: Conversation[] }>(QUERY, { after: after ?? null });
      if (authStore.getState().user?.id !== actorId) return;
      setLoadedFor(actorId);
      setRows((current) => after ? [...current, ...result.myConversations.filter((r) => !current.some((c) => c.id === r.id))] : result.myConversations);
      setMore(result.myConversations.length === 30); setError(null);
    } catch (e) { if (authStore.getState().user?.id !== actorId) return; setLoadedFor(actorId); setError(e instanceof Error ? e.message : "Could not load messages"); }
  }, [authStore, user?.id]);
  useEffect(() => {
    setRows([]);
    if (!user) return;
    void load(); const socket = io({ withCredentials: true });
    socket.on("connect", () => void load()); socket.on("inbox:update", () => void load());
    return () => { socket.disconnect(); };
  }, [user, load]);
  useEffect(() => { setSelected(params.get("c")); }, [params]);
  const active = rows.find((r) => r.id === selected);
  const open = (id: string | null) => { setSelected(id); window.history.replaceState(null, "", id ? `/messages?c=${encodeURIComponent(id)}` : "/messages"); };
  if (!user) return <main className="mx-auto max-w-4xl px-4 py-16"><AuthRequiredPanel title="Your conversations" description="Connect your wallet to read messages from clients and applicants." actionLabel="Connect wallet" /></main>;
  return <main className={`br mx-auto max-w-6xl px-4 py-8 ${theme === "dark" ? "dark" : ""}`}>
    <h1 className="mb-5 text-2xl font-bold">Messages</h1>
    {error && loadedFor === user.id && <p role="alert">{error}</p>}
    <div className="grid gap-4 md:grid-cols-[320px_minmax(0,1fr)]">
      <aside className={`rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 ${selected ? "hidden md:block" : ""}`}>
        <label className="mb-4 flex gap-2 text-sm"><input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />Unread only</label>
        {rows.filter((r) => !unreadOnly || r.unreadCount > 0).map((row) => <button data-testid={`conversation-${row.id}`} key={row.id} onClick={() => open(row.id)} className={`mb-2 block w-full rounded-lg border p-3 text-left ${selected === row.id ? "border-[var(--link)] bg-[var(--tag-bg)]" : "border-[var(--line)]"}`}>
          <span className="flex justify-between gap-2 text-sm font-semibold"><span>{row.counterpart?.name || row.counterpart?.walletAddress.slice(0, 10) || "Participant"}</span>{row.unreadCount > 0 && <span aria-label={`${row.unreadCount} unread messages`}>{row.unreadCount}</span>}</span>
          <span className="mt-1 block truncate text-xs text-[var(--ink-3)]">{row.issue.title}</span><span className="mt-2 block truncate text-sm">{row.lastMessage?.content || "No messages yet"}</span>
          {row.lastMessageAt && <time className="mt-1 block text-xs text-[var(--ink-3)]" dateTime={row.lastMessageAt}>{new Date(row.lastMessageAt).toLocaleString()}</time>}
        </button>)}
        {!rows.length && <p className="text-sm text-[var(--ink-3)]">No conversations yet. Open a chat from an application or assigned task.</p>}
        {more && <Button variant="outline" onClick={() => void load(rows.at(-1)?.id)}>Load more</Button>}
      </aside>
      <section className={!selected ? "hidden md:block" : ""}>
        {selected && <Button variant="ghost" className="mb-3 md:hidden" onClick={() => open(null)}>Back to conversations</Button>}
        {active ? <ChatRoom key={active.id} issueId={active.issueId} conversationId={active.id} kind={active.kind} issueTitle={active.issue.title} readOnly={!active.canWrite} /> : <p className="rounded-xl border border-[var(--line)] p-6 text-sm">{selected ? "This conversation is unavailable or on a later page." : "Choose a conversation."}</p>}
      </section>
    </div>
  </main>;
}
