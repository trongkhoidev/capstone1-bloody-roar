// apps/web/src/components/layout/left-sidebar.tsx
// Claude Design System — Sticky Left Navigation Rail (.lnav)

"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
export function LeftSidebar() {
  const pathname = usePathname();
  const tab = useSearchParams().get("tab");

  const isBounties = pathname === "/" || pathname === "/marketplace";

  return (
    <aside className="lnav shrink-0 hidden md:flex sticky top-16" aria-label="Sidebar navigation">
      <Link
        href="/marketplace"
        className={isBounties ? "on" : ""}
        data-testid="left-nav-bounties"
      >
        <span>Bounties</span>
      </Link>
      <div className="lab">Your workspace</div>
      <Link
        href="/dashboard"
        className={pathname === "/dashboard" && !tab ? "on" : ""}
        data-testid="left-nav-overview"
      >
        <span>Overview</span>
      </Link>
      <Link
        href="/dashboard?tab=bounties"
        className={pathname === "/dashboard" && tab === "bounties" ? "on" : ""}
        data-testid="left-nav-my-bounties"
      >
        <span>My bounties</span>
      </Link>
      <Link
        href="/issues/create"
        className={pathname === "/issues/create" ? "on" : ""}
        data-testid="left-nav-post-bounty"
      >
        <span>Post a bounty</span>
      </Link>
      <Link
        href="/dashboard#wallet"
        className={false ? "on" : ""}
        data-testid="left-nav-wallet"
      >
        <span>Wallet & claims</span>
      </Link>
      <Link
        href="/profile"
        className={pathname === "/profile" ? "on" : ""}
        data-testid="left-nav-settings"
      >
        <span>Settings</span>
      </Link>
    </aside>
  );
}
