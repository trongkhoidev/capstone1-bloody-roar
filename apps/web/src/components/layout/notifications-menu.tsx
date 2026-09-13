"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { graphqlRequest } from "@/lib/graphql-client";
import { useAuthStore } from "@/lib/store/use-auth-store";
import { io } from "socket.io-client";

const NOTIFICATIONS_QUERY = `query Notifications { unreadNotificationCount notifications(first: 20) { id type title body isRead link createdAt } }`;
const MARK_READ = `mutation MarkNotificationRead($id: ID!) { markNotificationRead(id: $id) { id isRead } }`;
const MARK_ALL_READ = `mutation MarkAllNotificationsRead { markAllNotificationsRead }`;
type Notification = { id: string; type: string; title: string; body: string; isRead: boolean; link?: string | null; createdAt: string };
type NotificationData = { unreadNotificationCount: number; notifications: Notification[] };

export function NotificationsMenu() {
  const user = useAuthStore((state) => state.user);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotificationData | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!user) { setData(null); return; }
    try { setData(await graphqlRequest<NotificationData>(NOTIFICATIONS_QUERY)); } catch { /* Keep previous notifications on transient errors. */ }
  }, [user]);

  useEffect(() => {
    void refresh();
    if (!user) return;
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh, user]);

  useEffect(() => {
    if (!user) return;
    const socket = io({ transports: ["websocket", "polling"], withCredentials: true });
    socket.on("notification:new", () => void refresh());
    return () => { socket.disconnect(); };
  }, [refresh, user]);

  useEffect(() => {
    const close = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (!user) return null;

  const markRead = async (notification: Notification) => {
    if (notification.isRead) return;
    try {
      await graphqlRequest(MARK_READ, { id: notification.id });
      setData((current) => current ? { ...current, unreadNotificationCount: Math.max(0, current.unreadNotificationCount - 1), notifications: current.notifications.map((item) => item.id === notification.id ? { ...item, isRead: true } : item) } : current);
    } catch { /* The destination remains available if read tracking is unavailable. */ }
  };

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => { setOpen((value) => !value); void refresh(); }} aria-label={`Notifications${data?.unreadNotificationCount ? `, ${data.unreadNotificationCount} unread` : ""}`} aria-expanded={open} className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--foreground))]">
        <Bell className="h-4 w-4" />
        {!!data?.unreadNotificationCount && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[hsl(var(--primary))] px-1 text-[9px] font-bold text-white">{data.unreadNotificationCount > 9 ? "9+" : data.unreadNotificationCount}</span>}
      </button>
      {open && <section className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] shadow-[var(--shadow-lg)]" aria-label="Notifications">
        <header className="flex items-center justify-between border-b border-[hsl(var(--border))] px-4 py-3"><div><h2 className="text-sm font-semibold">Notifications</h2><p className="text-[10px] text-[hsl(var(--foreground-subtle))">{data?.unreadNotificationCount ?? 0} unread</p></div><button type="button" onClick={async () => { try { await graphqlRequest(MARK_ALL_READ); setData((current) => current ? { ...current, unreadNotificationCount: 0, notifications: current.notifications.map((item) => ({ ...item, isRead: true })) } : current); } catch { /* Ignore transient failure. */ } }} className="inline-flex items-center gap-1 text-[10px] text-[hsl(var(--accent))] hover:underline"><CheckCheck className="h-3 w-3" />Mark all read</button></header>
        <div className="max-h-[min(65vh,28rem)] overflow-y-auto">{!data?.notifications.length ? <p className="px-4 py-8 text-center text-xs text-[hsl(var(--foreground-muted))]">You’re all caught up.</p> : data.notifications.map((item) => <Link key={item.id} href={item.link || "/dashboard"} onClick={() => { void markRead(item); setOpen(false); }} className={`block border-b border-[hsl(var(--border)/0.6)] px-4 py-3 transition hover:bg-[hsl(var(--background-secondary))] ${item.isRead ? "opacity-70" : "bg-[hsl(var(--accent)/0.04)]"}`}><div className="flex gap-2"><span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${item.isRead ? "bg-transparent" : "bg-[hsl(var(--accent))]"}`} /><div><p className="text-xs font-semibold">{item.title}</p><p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[hsl(var(--foreground-muted))]">{item.body}</p><time className="mt-1 block text-[10px] text-[hsl(var(--foreground-subtle))">{new Date(item.createdAt).toLocaleString()}</time></div></div></Link>)}</div>
      </section>}
    </div>
  );
}
