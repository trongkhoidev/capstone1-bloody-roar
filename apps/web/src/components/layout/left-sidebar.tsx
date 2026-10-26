// apps/web/src/components/layout/left-sidebar.tsx
// Claude Design System — Sticky Left Navigation Rail (.lnav)

"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function LeftSidebar() {
  const pathname = usePathname();

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
      <Link
        href="/marketplace?view=skills"
        className={pathname.includes("view=skills") ? "on" : ""}
        data-testid="left-nav-skills"
      >
        <span>Skills</span>
      </Link>
      <Link
        href="/marketplace?view=developers"
        className={pathname.includes("view=developers") ? "on" : ""}
        data-testid="left-nav-developers"
      >
        <span>Developers</span>
      </Link>

      <div className="lab">Your workspace</div>
      <Link
        href="/dashboard"
        className={pathname === "/dashboard" ? "on" : ""}
        data-testid="left-nav-overview"
      >
        <span>Overview</span>
      </Link>
      <Link
        href="/dashboard?tab=bounties"
        className={pathname.includes("tab=bounties") ? "on" : ""}
        data-testid="left-nav-my-bounties"
      >
        <span>My bounties</span>
        <span className="cnt mono">9</span>
      </Link>
      <Link
        href="/issues/create"
        className={pathname === "/issues/create" ? "on" : ""}
        data-testid="left-nav-post-bounty"
      >
        <span>Post a bounty</span>
      </Link>
      <Link
        href="/dashboard?tab=messages"
        className={pathname.includes("tab=messages") ? "on" : ""}
        data-testid="left-nav-messages"
      >
        <span>Messages</span>
        <span className="cnt mono">2</span>
      </Link>
      <Link
        href="/dashboard?tab=notifications"
        className={pathname.includes("tab=notifications") ? "on" : ""}
        data-testid="left-nav-notifications"
      >
        <span>Notifications</span>
        <span className="cnt mono">4</span>
      </Link>
      <Link
        href="/dashboard?tab=wallet"
        className={pathname.includes("tab=wallet") ? "on" : ""}
        data-testid="left-nav-wallet"
      >
        <span>Wallet & claims</span>
      </Link>
      <Link
        href="/settings"
        className={pathname === "/settings" ? "on" : ""}
        data-testid="left-nav-settings"
      >
        <span>Settings</span>
      </Link>
    </aside>
  );
}
