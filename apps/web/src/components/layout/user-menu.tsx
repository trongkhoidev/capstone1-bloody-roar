// apps/web/src/components/layout/user-menu.tsx
// Trâm (UI/UX Designer) — User Profile Dropdown & Connect Button
// Consolidated with Base Sepolia Network, Language & Theme Preferences

"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Copy,
  Check,
  Sun,
  Moon,
  Globe,
  Languages,
  LogOut,
  User,
  LayoutDashboard,
  PlusCircle,
  Shield,
  ChevronDown,
} from "lucide-react";
import { useAuthStore } from "../../lib/store/use-auth-store";
import { shortenAddress } from "../../lib/web3/client";
import { ConnectModal } from "../auth/connect-modal";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { useUiPreferences } from "@/lib/ui-preferences";

export function UserMenu() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { user, logout } = useAuthStore();
  const { language, setLanguage, theme, setTheme, t } = useUiPreferences();
  const isAuthenticated = Boolean(user);

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

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

  const handleCopy = () => {
    if (user?.walletAddress && typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(user.walletAddress).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {});
    }
  };

  if (!isMounted) {
    return <div className="h-9 w-[120px] rounded-full bg-[var(--surface)] animate-pulse border border-[var(--line-2)]" />;
  }

  // Common Network & Preferences JSX
  const renderNetworkAndPreferences = () => (
    <>
      {/* Network Card */}
      <div className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--line-2)]">
        <div className="flex items-center gap-2">
          <span className="dot shrink-0" title="Network Connected" />
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-[var(--ink)] flex items-center gap-1.5">
              Base Sepolia
              <span className="text-[10px] font-medium text-[var(--ok)] bg-[var(--ok)]/10 px-1.5 py-0.2 rounded">
                Live
              </span>
            </span>
            <span className="text-[10px] text-[var(--ink-3)] font-mono">Chain ID: 84532</span>
          </div>
        </div>
        <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-[var(--sunk)] text-[var(--ink-2)] border border-[var(--line)]">
          Testnet
        </span>
      </div>

      {/* Preferences Section */}
      <div className="pt-2.5 mt-2.5 border-t border-[var(--line-2)] space-y-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-3)] px-0.5">
          {t("preferences") || "Preferences"}
        </div>

        {/* Language Selector */}
        <div className="flex items-center justify-between px-0.5">
          <span className="text-xs text-[var(--ink-2)] flex items-center gap-1.5">
            <Languages className="w-3.5 h-3.5 text-[var(--ink-3)]" />
            <span>{t("language")}</span>
          </span>
          <div className="inline-flex rounded-md border border-[var(--line-2)] bg-[var(--surface-2)] p-0.5">
            <button
              type="button"
              onClick={() => setLanguage("en")}
              className={`px-2.5 py-1 text-xs font-semibold rounded transition-all cursor-pointer ${
                language === "en"
                  ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs"
                  : "text-[var(--ink-3)] hover:text-[var(--ink)]"
              }`}
              data-testid={language === "vi" ? "language-toggle" : "language-en-btn"}
              aria-label="English"
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLanguage("vi")}
              className={`px-2.5 py-1 text-xs font-semibold rounded transition-all cursor-pointer ${
                language === "vi"
                  ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs"
                  : "text-[var(--ink-3)] hover:text-[var(--ink)]"
              }`}
              data-testid={language === "en" ? "language-toggle" : "language-vi-btn"}
              aria-label="Tiếng Việt"
            >
              VI
            </button>
          </div>
        </div>

        {/* Theme Selector */}
        <div className="flex items-center justify-between px-0.5">
          <span className="text-xs text-[var(--ink-2)] flex items-center gap-1.5">
            {theme === "dark" ? (
              <Moon className="w-3.5 h-3.5 text-[var(--link)]" />
            ) : (
              <Sun className="w-3.5 h-3.5 text-[var(--gold)]" />
            )}
            <span>{t("theme")}</span>
          </span>
          <div className="inline-flex rounded-md border border-[var(--line-2)] bg-[var(--surface-2)] p-0.5">
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={`flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded transition-all cursor-pointer ${
                theme === "light"
                  ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs"
                  : "text-[var(--ink-3)] hover:text-[var(--ink)]"
              }`}
              data-testid={theme === "dark" ? "theme-toggle" : "theme-light-btn"}
              aria-label={t("lightTheme")}
            >
              <Sun className="w-3 h-3 text-[var(--gold)]" />
              <span>{t("light")}</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={`flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded transition-all cursor-pointer ${
                theme === "dark"
                  ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs"
                  : "text-[var(--ink-3)] hover:text-[var(--ink)]"
              }`}
              data-testid={theme === "light" ? "theme-toggle" : "theme-dark-btn"}
              aria-label={t("darkTheme")}
            >
              <Moon className="w-3 h-3 text-[var(--link)]" />
              <span>{t("dark")}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );

  // Unauthenticated State
  if (!isAuthenticated || !user) {
    return (
      <div className="flex items-center gap-2" ref={dropdownRef}>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setIsModalOpen(true)}
          className="font-semibold"
          data-testid="connect-wallet-btn"
        >
          <span>{t("connectWallet")}</span>
        </Button>

        {/* Compact Settings / Preferences Button for guest visitors */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--line-2)] bg-[var(--surface)] text-[var(--ink-2)] transition-colors hover:bg-[var(--sunk)] hover:text-[var(--ink)] cursor-pointer"
            aria-label="Network & Preferences"
            title="Base Sepolia & Preferences"
            data-testid="guest-menu-btn"
          >
            <Globe className="h-4 w-4" />
          </button>

          {isDropdownOpen && (
            <div
              className="absolute right-0 mt-2 w-72 rounded-xl border border-[var(--line-2)] bg-[var(--surface)] p-3 shadow-xl z-50 animate-fade-in text-sm"
              data-testid="guest-dropdown-menu"
            >
              {renderNetworkAndPreferences()}
            </div>
          )}
        </div>

        <ConnectModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
        />
      </div>
    );
  }

  // Authenticated State
  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsDropdownOpen((prev) => !prev)}
        className="flex items-center gap-2 p-1.5 pr-2.5 rounded-full border border-[var(--line-2)] bg-[var(--surface)] hover:bg-[var(--sunk)] transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
        data-testid="user-menu-btn"
        aria-expanded={isDropdownOpen}
      >
        {/* Avatar */}
        <div className="h-7 w-7 rounded-full bg-[var(--brand)] flex items-center justify-center text-xs font-bold text-[var(--cta-ink)] overflow-hidden shadow-xs shrink-0">
          {user.avatar ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={user.avatar}
              alt={user.name || "User Avatar"}
              width={28}
              height={28}
              className="h-full w-full object-cover"
            />
          ) : (
            (user.name?.[0] || user.walletAddress.substring(2, 4)).toUpperCase()
          )}
        </div>

        {/* Short Address / Name */}
        <div className="text-left hidden sm:block">
          <div className="text-xs font-semibold text-[var(--ink)]">
            {user.name || shortenAddress(user.walletAddress)}
          </div>
          <div className="text-[10px] text-[var(--ink-3)] flex items-center gap-1">
            <span className="text-[var(--gold)]">⭐</span>
            <span>{user.reputationScore.toFixed(1)}/5</span>
            {user.isGithubVerified && (
              <span className="text-[var(--ok)]" title="GitHub Verified">
                ✓
              </span>
            )}
          </div>
        </div>

        <ChevronDown className={`h-3.5 w-3.5 text-[var(--ink-3)] transition-transform duration-150 ${isDropdownOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown Menu */}
      {isDropdownOpen && (
        <div
          className="absolute right-0 mt-2 w-72 rounded-xl border border-[var(--line-2)] bg-[var(--surface)] p-3 shadow-xl z-50 animate-fade-in text-sm"
          data-testid="user-dropdown-menu"
        >
          {/* Section 1: Network Status Badge & Preferences */}
          {renderNetworkAndPreferences()}

          {/* Section 2: Account Details */}
          <div className="mt-2.5 p-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--line-2)]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-medium text-[var(--ink)]">
                {shortenAddress(user.walletAddress, 6)}
              </span>
              <div className="flex items-center gap-1.5">
                <Badge variant="default" className="text-[10px] py-0 px-1.5">
                  {user.role}
                </Badge>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="text-[11px] text-[var(--link)] hover:underline flex items-center gap-0.5 cursor-pointer ml-1"
                  title="Copy address"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-[var(--ok)]" />
                      <span className="text-[var(--ok)] text-[10px]">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-[var(--ink-3)]" />
                      <span className="text-[10px] text-[var(--ink-3)]">Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs pt-2 border-t border-[var(--line)]">
              <span className="text-[var(--ink-3)]">{t("reputation")}:</span>
              <span className="font-semibold text-[var(--ink)] flex items-center gap-1">
                <span className="text-[var(--gold)]">⭐</span> {user.reputationScore.toFixed(1)} / 5
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="text-[var(--ink-3)]">{t("completedTasks")}:</span>
              <span className="font-semibold text-[var(--ink)]">{user.completedTaskCount}</span>
            </div>
          </div>

          {/* Section 3: Navigation Links */}
          <div className="py-1 mt-1 space-y-0.5">
            <Link
              href="/profile"
              onClick={() => setIsDropdownOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[var(--ink)] hover:bg-[var(--sunk)] transition-colors"
            >
              <User className="w-4 h-4 text-[var(--ink-3)]" />
              <span>{t("profile")}</span>
            </Link>

            <Link
              href={user.role === "ADMIN" ? "/admin" : "/dashboard"}
              onClick={() => setIsDropdownOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[var(--ink)] hover:bg-[var(--sunk)] transition-colors"
            >
              {user.role === "ADMIN" ? (
                <Shield className="w-4 h-4 text-[var(--gold)]" />
              ) : (
                <LayoutDashboard className="w-4 h-4 text-[var(--ink-3)]" />
              )}
              <span>{user.role === "ADMIN" ? t("admin") : t("dashboard")}</span>
            </Link>

            {user.role !== "ADMIN" && (
              <Link
                href="/issues/create"
                onClick={() => setIsDropdownOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[var(--ink)] hover:bg-[var(--sunk)] transition-colors"
              >
                <PlusCircle className="w-4 h-4 text-[var(--ink-3)]" />
                <span>{t("createBounty")}</span>
              </Link>
            )}
          </div>

          {/* Section 4: Logout */}
          <div className="pt-1.5 mt-1 border-t border-[var(--line-2)]">
            <button
              type="button"
              onClick={() => {
                setIsDropdownOpen(false);
                logout();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[var(--bad)] hover:bg-[var(--bad)]/10 transition-colors text-left cursor-pointer"
              data-testid="logout-btn"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{t("disconnect")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
