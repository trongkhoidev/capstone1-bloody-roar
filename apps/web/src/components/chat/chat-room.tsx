"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { io, type Socket } from "socket.io-client";
import { Check, CircleHelp, FileText, Paperclip, Send, ShieldCheck, X } from "lucide-react";
import Image from "next/image";
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE_BYTES } from "@bloody-roar/shared";
import { graphqlRequest } from "@/lib/graphql-client";
import { useAuthStore } from "@/lib/store/use-auth-store";
import { Button } from "@/components/ui/button";
import type { ChatMessagePayload } from "@bloody-roar/shared";

const CHAT_QUERY = `
  query TaskMessages($issueId: String!, $after: String) {
    messages(issueId: $issueId, first: 50, after: $after) {
      edges { cursor node {
        id content type wasModified issueId senderId replyToId createdAt
        sender { name avatar }
        attachments { id fileName fileUrl fileSize fileMime }
      } }
      pageInfo { hasNextPage startCursor }
    }
  }
`;

type HistoryMessage = {
  id: string;
  content: string;
  type: "TEXT" | "FILE" | "SYSTEM";
  wasModified: boolean;
  issueId: string;
  senderId: string;
  replyToId?: string | null;
  createdAt: string;
  sender: { name?: string | null; avatar?: string | null };
  attachments: Array<{ fileName: string; fileUrl: string; fileSize: number; fileMime: string }>;
};

type HistoryResponse = {
  messages: {
    edges: Array<{ cursor: string; node: HistoryMessage }>;
    pageInfo: { hasNextPage: boolean; startCursor?: string | null };
  };
};

type DisplayMessage = ChatMessagePayload & { fileSize?: number; fileMime?: string };
type ConnectionState = "connecting" | "joining" | "ready" | "offline";

function mergeMessages(...groups: DisplayMessage[][]): DisplayMessage[] {
  const byId = new Map<string, DisplayMessage>();
  for (const message of groups.flat()) byId.set(message.id, message);
  return [...byId.values()].sort((left, right) => {
    const difference = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    return difference || left.id.localeCompare(right.id);
  });
}

function toDisplayMessage(node: HistoryMessage): DisplayMessage {
  const attachment = node.attachments[0];
  return {
    id: node.id,
    content: node.content,
    type: node.type === "SYSTEM" ? "TEXT" : node.type,
    senderId: node.senderId,
    senderName: node.sender.name ?? "Member",
    ...(node.sender.avatar ? { senderAvatar: node.sender.avatar } : {}),
    issueId: node.issueId,
    wasModified: node.wasModified,
    ...(node.replyToId ? { replyToId: node.replyToId } : {}),
    ...(attachment ? {
      fileUrl: attachment.fileUrl,
      fileName: attachment.fileName,
      fileSize: attachment.fileSize,
      fileMime: attachment.fileMime,
    } : {}),
    createdAt: node.createdAt,
  };
}

async function uploadFile(file: File) {
  if (file.size <= 0 || file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("Choose a non-empty file smaller than 50 MB.");
  }
  if (!ALLOWED_FILE_TYPES.includes(file.type as never)) {
    throw new Error("This file type is not supported.");
  }

  const metadata = await fetch("/api/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, fileType: file.type, fileSize: file.size }),
  });
  const upload = await metadata.json();
  if (!metadata.ok) throw new Error(upload.error || "Could not prepare file upload.");
  const result = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!result.ok) throw new Error("File upload failed.");
  return { fileUrl: upload.fileUrl as string, fileName: file.name, fileSize: file.size, fileMime: file.type };
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function ChatRoom({
  issueId,
  issueTitle,
  readOnly = false,
}: {
  issueId: string;
  issueTitle?: string;
  readOnly?: boolean;
}) {
  const user = useAuthStore((state) => state.user);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [content, setContent] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pendingScrollAdjustment = useRef<{ height: number; top: number } | null>(null);
  const stickToBottom = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const client = io({ transports: ["websocket", "polling"], withCredentials: true });
    setSocket(client);

    client.on("connect", () => {
      if (!active) return;
      setConnection("joining");
      setError(null);
      client.emit("task:join", issueId, (joinError?: string) => {
        if (!active) return;
        if (joinError) {
          setConnection("offline");
          setError(joinError);
          return;
        }
        setConnection("ready");
      });
    });
    client.on("disconnect", () => {
      if (!active) return;
      setConnection("offline");
    });
    client.on("connect_error", (event) => {
      if (!active) return;
      setConnection("offline");
      setError(event.message || "Chat connection failed.");
    });
    client.on("message:new", (message) => {
      if (!active || message.issueId !== issueId) return;
      setMessages((current) => mergeMessages(current, [message]));
    });

    const controller = new AbortController();
    void graphqlRequest<HistoryResponse>(CHAT_QUERY, { issueId, after: null }, controller.signal)
      .then((response) => {
        if (!active) return;
        const history = response.messages.edges.map(({ node }) => toDisplayMessage(node));
        setMessages((current) => mergeMessages(history, current));
        setHasOlderMessages(response.messages.pageInfo.hasNextPage);
        setHistoryCursor(response.messages.pageInfo.startCursor ?? null);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load chat history.");
      });

    return () => {
      active = false;
      controller.abort();
      if (client.connected) client.emit("task:leave", issueId);
      client.disconnect();
    };
  }, [issueId, user]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    const adjustment = pendingScrollAdjustment.current;
    if (!container) return;
    if (adjustment) {
      container.scrollTop = container.scrollHeight - adjustment.height + adjustment.top;
      pendingScrollAdjustment.current = null;
    } else if (stickToBottom.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  const loadOlderMessages = useCallback(async () => {
    if (!historyCursor || isLoadingHistory) return;
    setIsLoadingHistory(true);
    setError(null);
    if (scrollContainerRef.current) {
      pendingScrollAdjustment.current = {
        height: scrollContainerRef.current.scrollHeight,
        top: scrollContainerRef.current.scrollTop,
      };
    }
    try {
      const response = await graphqlRequest<HistoryResponse>(CHAT_QUERY, { issueId, after: historyCursor });
      const older = response.messages.edges.map(({ node }) => toDisplayMessage(node));
      setMessages((current) => mergeMessages(older, current));
      setHasOlderMessages(response.messages.pageInfo.hasNextPage);
      setHistoryCursor(response.messages.pageInfo.startCursor ?? null);
    } catch (reason) {
      pendingScrollAdjustment.current = null;
      setError(reason instanceof Error ? reason.message : "Could not load older messages.");
    } finally {
      setIsLoadingHistory(false);
    }
  }, [historyCursor, isLoadingHistory, issueId]);

  const send = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    if (connection !== "ready" || !socket?.connected || !user || (!content.trim() && !pendingFile) || isSending) return;
    setIsSending(true);
    setError(null);
    try {
      const file = pendingFile ? await uploadFile(pendingFile) : null;
      const messageContent = file ? `Shared a file: ${file.fileName}` : content.trim();
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("Chat server did not confirm the message. Try again.")), 15000);
        socket.emit("message:send", {
          content: messageContent,
          type: file ? "FILE" : "TEXT",
          issueId,
          clientMessageId: crypto.randomUUID(),
          ...(file ?? {}),
        }, (messageError?: string) => {
          window.clearTimeout(timeout);
          if (messageError) reject(new Error(messageError));
          else resolve();
        });
      });
      setContent("");
      setPendingFile(null);
      stickToBottom.current = true;
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send message.");
    } finally {
      setIsSending(false);
    }
  }, [connection, content, issueId, isSending, pendingFile, socket, user]);

  if (!user) return <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 text-sm text-[hsl(var(--foreground-muted))]">Connect your wallet to open task chat.</div>;

  const statusLabel = connection === "ready" ? "Room ready" : connection === "joining" ? "Joining room" : connection === "connecting" ? "Connecting" : "Reconnecting";
  const sendDisabled = readOnly || connection !== "ready" || isSending || (!content.trim() && !pendingFile);

  return (
    <section className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm" aria-label="Task chat">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--border))] px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--background-secondary))] text-sm font-semibold text-[hsl(var(--foreground-muted))]" aria-hidden="true">BR</span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{issueTitle || "Task conversation"}</h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[hsl(var(--foreground-muted))]">
              <span className={`h-1.5 w-1.5 rounded-full ${connection === "ready" ? "bg-emerald-500" : "bg-amber-500"}`} />
              {statusLabel} · private workroom
            </p>
          </div>
        </div>
        <span title="Messages are saved to the task and can only be read by its participants." className="flex items-center gap-1.5 text-xs text-[hsl(var(--foreground-muted))]"><ShieldCheck className="h-4 w-4" /> Protected chat</span>
      </header>

      <div
        ref={scrollContainerRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 72;
        }}
        className="h-[min(58vh,520px)] min-h-[300px] space-y-4 overflow-y-auto bg-[hsl(var(--background))] px-3 py-4 sm:px-5"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {hasOlderMessages && <div className="text-center"><Button type="button" size="sm" variant="ghost" disabled={isLoadingHistory} onClick={() => void loadOlderMessages()}>{isLoadingHistory ? "Loading earlier messages…" : "Load earlier messages"}</Button></div>}
        {messages.length === 0 && <div className="flex min-h-[230px] flex-col items-center justify-center text-center"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--card))] text-[hsl(var(--foreground-muted))]"><CircleHelp className="h-5 w-5" /></span><p className="mt-3 text-sm font-medium">No messages yet</p><p className="mt-1 max-w-xs text-xs leading-5 text-[hsl(var(--foreground-muted))]">Use this private room to agree on scope, share progress, and deliver the work.</p></div>}
        {messages.map((message) => {
          const own = message.senderId === user.id;
          return (
            <article key={message.id} className={`flex items-end gap-2.5 ${own ? "justify-end" : "justify-start"}`}>
              {!own && <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[hsl(var(--card))] text-[10px] font-semibold text-[hsl(var(--foreground-muted))] ring-1 ring-[hsl(var(--border))]">
                {message.senderAvatar ? <Image src={message.senderAvatar} alt="" width={28} height={28} unoptimized className="h-full w-full object-cover" /> : initials(message.senderName || "Member")}
              </span>}
              <div className={`max-w-[min(84%,620px)] ${own ? "items-end" : "items-start"}`}>
                <div className={`mb-1 flex items-center gap-2 px-1 text-[10px] text-[hsl(var(--foreground-muted))] ${own ? "justify-end" : "justify-start"}`}>
                  <span className="font-medium">{own ? "You" : message.senderName}</span>
                  <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
                </div>
                <div className={`rounded-2xl px-3.5 py-2.5 ${own ? "rounded-br-md bg-slate-900 text-white" : "rounded-bl-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))]"}`}>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>
                  {message.fileUrl && <a className={`mt-2 flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs underline-offset-2 hover:underline ${own ? "border-white/20 bg-white/10 text-white" : "border-[hsl(var(--border))] text-[hsl(var(--foreground))]"}`} href={message.fileUrl} target="_blank" rel="noreferrer"><FileText className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">{message.fileName || "Open attachment"}</span></a>}
                  {message.wasModified && <p className={`mt-2 flex items-center gap-1 text-[10px] ${own ? "text-white/75" : "text-amber-700"}`}><ShieldCheck className="h-3 w-3" />Sensitive information masked</p>}
                </div>
                {own && <p className="mt-1 flex items-center justify-end gap-1 px-1 text-[10px] text-[hsl(var(--foreground-subtle))]"><Check className="h-3 w-3" />Sent</p>}
              </div>
            </article>
          );
        })}
      </div>

      {error && <p role="status" className="border-t border-[hsl(var(--border))] px-4 py-2.5 text-xs text-[hsl(var(--destructive))]">{error}</p>}
      {readOnly ? <p className="border-t border-[hsl(var(--border))] bg-[hsl(var(--background-secondary))] px-4 py-3 text-xs text-[hsl(var(--foreground-muted))]">This conversation is read-only after task completion or while a dispute is under review.</p> : <>
        {pendingFile && <div className="flex items-center justify-between gap-3 border-t border-[hsl(var(--border))] px-4 py-2 text-xs text-[hsl(var(--foreground-muted))]"><span className="truncate">Attached: {pendingFile.name}</span><button type="button" onClick={() => { setPendingFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="rounded p-1 hover:bg-[hsl(var(--background-secondary))]" aria-label="Remove attachment"><X className="h-3.5 w-3.5" /></button></div>}
        <form onSubmit={send} className="flex items-end gap-2 border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 sm:gap-3 sm:p-4">
          <input ref={fileInputRef} type="file" accept={ALLOWED_FILE_TYPES.join(",")} className="hidden" onChange={(event) => setPendingFile(event.target.files?.[0] ?? null)} aria-label="Attach file" />
          <Button type="button" variant="ghost" size="icon" disabled={connection !== "ready" || isSending} onClick={() => fileInputRef.current?.click()} aria-label="Attach a file"><Paperclip className="h-4 w-4" /></Button>
          <textarea value={content} onChange={(event) => setContent(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (!sendDisabled) event.currentTarget.form?.requestSubmit(); } }} rows={1} maxLength={4000} placeholder={connection === "ready" ? "Write a message…" : "Connecting to the private room…"} disabled={connection !== "ready"} className="min-h-10 max-h-28 flex-1 resize-y rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2.5 text-sm outline-none focus:border-[hsl(var(--primary)/0.5)] disabled:cursor-not-allowed disabled:opacity-60" />
          <Button type="submit" size="icon" disabled={sendDisabled} aria-label="Send message" title="Send message"><Send className="h-4 w-4" /></Button>
        </form>
        <p className="px-4 pb-3 text-[10px] text-[hsl(var(--foreground-subtle))]">Press Enter to send · Shift + Enter for a new line</p>
      </>}
    </section>
  );
}
