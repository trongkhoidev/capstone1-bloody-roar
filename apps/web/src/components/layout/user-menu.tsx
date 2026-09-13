// apps/web/src/components/layout/user-menu.tsx
// Trâm (UI/UX Designer) — User Profile Dropdown & Connect Button

"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuthStore } from "../../lib/store/use-auth-store";
import { shortenAddress } from "../../lib/web3/client";
import { ConnectModal } from "../auth/connect-modal";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { useUiPreferences } from "@/lib/ui-preferences";

export function UserMenu() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { user, logout } = useAuthStore();
  const { t } = useUiPreferences();
  const isAuthenticated = Boolean(user);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!isAuthenticated || !user) {
    return (
      <>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setIsModalOpen(true)}
          className="font-semibold"
          data-testid="connect-wallet-btn"
        >
          <span>{t("connectWallet")}</span>
        </Button>
        <ConnectModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
        />
      </>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsDropdownOpen((prev) => !prev)}
        className="flex items-center gap-2 p-1.5 pr-3 rounded-full border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] hover:bg-[hsl(var(--background-secondary))] transition-all focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
        data-testid="user-menu-btn"
      >
        {/* Avatar */}
        <div className="h-7 w-7 rounded-full bg-[hsl(var(--primary))] flex items-center justify-center text-xs font-bold text-white overflow-hidden">
          {user.avatar ? (
            <Image
              src={user.avatar}
              alt={user.name || "User Avatar"}
              width={28}
              height={28}
              unoptimized
              className="h-full w-full object-cover"
            />
          ) : (
            (user.name?.[0] || user.walletAddress.substring(2, 4)).toUpperCase()
          )}
        </div>

        {/* Short Address / Name */}
        <div className="text-left hidden sm:block">
          <div className="text-xs font-semibold text-[hsl(var(--foreground))]">
            {user.name || shortenAddress(user.walletAddress)}
          </div>
          <div className="text-[10px] text-[hsl(var(--foreground-muted))] flex items-center gap-1">
            <span className="text-[hsl(var(--warning))]">⭐</span>
            <span>{user.reputationScore.toFixed(1)}/5</span>
            {user.isGithubVerified && (
              <span className="text-[hsl(var(--success))]" title="GitHub Verified">
                ✓
              </span>
            )}
          </div>
        </div>

        <span className="text-xs text-[hsl(var(--foreground-muted))]">▾</span>
      </button>

      {/* Dropdown Menu */}
      {isDropdownOpen && (
        <div
          className="absolute right-0 mt-2 w-64 rounded-xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-2 shadow-[var(--shadow-lg)] z-50 animate-fade-in text-sm"
          data-testid="user-dropdown-menu"
        >
          {/* Header info */}
          <div className="p-3 border-b border-[hsl(var(--border)/0.5)]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-[hsl(var(--foreground-muted))]">
                {shortenAddress(user.walletAddress, 6)}
              </span>
              <Badge variant="default" className="text-[10px]">
                {user.role}
              </Badge>
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-xs">
              <span className="text-[hsl(var(--foreground-subtle))]">{t("reputation")}:</span>
              <span className="font-semibold text-[hsl(var(--foreground))]">
                {user.reputationScore.toFixed(1)} / 5
              </span>
              <span className="text-[hsl(var(--foreground-subtle))]">·</span>
              <span className="text-[hsl(var(--foreground-subtle))]">{t("completedTasks")}:</span>
              <span className="font-semibold text-[hsl(var(--foreground))]">
                {user.completedTaskCount}
              </span>
            </div>
          </div>

          {/* Navigation items */}
          <div className="py-1 space-y-0.5">
            <Link
              href="/profile"
              onClick={() => setIsDropdownOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--background-secondary))] transition-colors"
            >
              <span>👤</span>
              <span>{t("profile")}</span>
            </Link>

            <Link
              href={user.role === "ADMIN" ? "/admin" : "/dashboard"}
              onClick={() => setIsDropdownOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--background-secondary))] transition-colors"
            >
              <span>📊</span>
              <span>{user.role === "ADMIN" ? t("admin") : t("dashboard")}</span>
            </Link>

            {user.role !== "ADMIN" && <Link
              href="/issues/create"
              onClick={() => setIsDropdownOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--background-secondary))] transition-colors"
            >
              <span>➕</span>
              <span>{t("createBounty")}</span>
            </Link>}
            {user.role === "ADMIN" && <Link href="/admin" onClick={() => setIsDropdownOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-[hsl(var(--warning))] hover:bg-[hsl(var(--background-secondary))]"><span>🛡️</span><span>{t("admin")}</span></Link>}
          </div>

          {/* Logout */}
          <div className="pt-1 mt-1 border-t border-[hsl(var(--border)/0.5)]">
            <button
              type="button"
              onClick={() => {
                setIsDropdownOpen(false);
                logout();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/0.1)] transition-colors text-left"
              data-testid="logout-btn"
            >
              <span>🚪</span>
              <span>{t("disconnect")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
