"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Plus } from "lucide-react";
import { UserMenu } from "@/components/layout/user-menu";
import { MobileNav } from "@/components/layout/MobileNav";
import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { useAuthStore } from "@/lib/store/use-auth-store";
import { useUiPreferences } from "@/lib/ui-preferences";
import { UiPreferenceControls } from "@/components/layout/ui-preference-controls";
import { WolfLogo } from "@/components/ui/wolf-logo";
import React, { useState, useEffect } from "react";

export function Navbar() {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const { t } = useUiPreferences();

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const isMarketplace = pathname === "/" || pathname === "/marketplace";
  const isDashboard = pathname.startsWith("/dashboard");
  const isAdmin = pathname.startsWith("/admin");

  return (
    <header className="top sticky top-0 z-40 w-full backdrop-blur-md">
      <div className="top-in">
        {/* Logo with Claude Design Silver Wolf Mark */}
        <div className="flex items-center gap-6">
          <Link href="/" className="logo text-[var(--ink)] hover:opacity-95 transition-opacity" data-testid="navbar-logo">
            <WolfLogo size={34} />
            <span className="font-bold tracking-tight text-base sm:text-lg">Bloody-Roar</span>
          </Link>

          {/* Claude Design Top Nav Links */}
          <nav className="topnav hidden md:flex items-center" aria-label="Main navigation">
            <Link
              href="/marketplace"
              className={isMarketplace ? "on" : ""}
            >
              {t("marketplace")}
            </Link>
            <Link
              href="/marketplace?view=skills"
              className={pathname === "/skills" ? "on" : ""}
            >
              Skills
            </Link>
            <Link
              href="/marketplace?view=developers"
              className={pathname === "/developers" ? "on" : ""}
            >
              Developers
            </Link>
            <Link
              href="/#escrow-rules"
              className=""
            >
              How it works
            </Link>
            {isMounted && user && (
              <Link
                href={user.role === "ADMIN" ? "/admin" : "/dashboard"}
                className={isAdmin || isDashboard ? "on" : ""}
              >
                {user.role === "ADMIN" ? t("admin") : t("dashboard")}
              </Link>
            )}
          </nav>
        </div>

        {/* Search input bar */}
        <form action="/marketplace" method="get" className="search hidden lg:flex">
          <Search className="ico text-[var(--ink-3)]" />
          <input
            type="search"
            name="search"
            placeholder={t("searchTasks") || "Search bounties by skill, keyword, or client..."}
            defaultValue=""
          />
        </form>

        {/* Right side controls */}
        <div className="tb-r ml-auto flex items-center gap-2.5">
          {/* Base Sepolia network badge */}
          <div className="wallet hidden sm:flex items-center gap-2">
            <span className="dot" title="Connected to Base Sepolia" />
            <span className="mono text-[11px] font-medium text-[var(--ink-2)]">Base Sepolia</span>
          </div>

          <div className="hidden md:block">
            <UiPreferenceControls />
          </div>

          <div className="hidden sm:block">
            <NotificationsMenu />
          </div>

          {/* Post a bounty CTA button */}
          {isMounted && (
            <Link
              href="/issues/create"
              className="btn btn-p btn-sm hidden sm:inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t("createBounty") || "Post a bounty"}</span>
            </Link>
          )}

          <div className="hidden sm:block">
            <UserMenu />
          </div>

          <MobileNav />
        </div>
      </div>
    </header>
  );
}
