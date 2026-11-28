"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessagesLink } from "@/components/chat/messages-link";
import { Plus } from "lucide-react";
import { UserMenu } from "@/components/layout/user-menu";
import { MobileNav } from "@/components/layout/MobileNav";
import { GlobalSearch } from "@/components/layout/global-search";
import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { useAuthStore } from "@/lib/store/use-auth-store";
import { useUiPreferences } from "@/lib/ui-preferences";
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
    <header className="top sticky top-0 z-40 w-full">
      <div className="top-in">
        {/* Logo with Claude Design Silver Wolf Mark */}
        <div className="flex items-center gap-5 shrink-0">
          <Link href="/" className="logo text-[var(--ink)] hover:opacity-95 transition-opacity" data-testid="navbar-logo">
            <WolfLogo size={30} />
            <span className="font-bold tracking-tight text-base">Bloody-Roar</span>
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
              href="/guide"
              className=""
            >
              Guide
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

        <GlobalSearch />

        {/* Right side controls */}
        <div className="tb-r ml-auto flex items-center gap-2">
          <MessagesLink />
          <div className="hidden sm:block">
            <NotificationsMenu />
          </div>

          {isMounted && (
            <Link
              href="/issues/create"
              className="btn btn-p hidden sm:inline-flex items-center gap-1.5 ml-2"
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
