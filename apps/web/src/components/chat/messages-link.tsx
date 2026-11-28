"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { io } from "socket.io-client";
import { useAuthStore } from "@/lib/store/use-auth-store";
import { graphqlRequest } from "@/lib/graphql-client";

export function MessagesLink() {
  const user = useAuthStore((s) => s.user), [count, setCount] = useState(0);
  useEffect(() => {
    setCount(0); if (!user) return;
    let active = true;
    const refresh = () => { void graphqlRequest<{ myUnreadMessageTotal: number }>(`query InboxBadge { myUnreadMessageTotal }`).then((r) => { if (active) setCount(r.myUnreadMessageTotal); }).catch(() => undefined); };
    refresh(); const socket = io({ withCredentials: true }); socket.on("connect", refresh); socket.on("inbox:update", refresh);
    const timer = setInterval(refresh, 30_000);
    return () => { active = false; clearInterval(timer); socket.disconnect(); };
  }, [user]);
  return user ? <Link href="/messages" className="ibtn" title="Messages" aria-label={count ? `Messages, ${count} unread` : "Messages"}><MessageSquare className="h-4 w-4" aria-hidden />{count > 0 && <span className="n mono">{count > 9 ? "9+" : count}</span>}</Link> : null;
}
