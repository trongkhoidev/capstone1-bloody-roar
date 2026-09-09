// apps/web/src/components/layout/navbar.tsx
// Trâm (UI/UX Designer) — Main Navigation Header

"use client";

import React, { useState } from "react";
import Link from "next/link";
import { UserMenu } from "./user-menu";
import { Input } from "../ui/input";

interface NavbarProps {
  onSearch?: (query: string) => void;
  searchValue?: string;
}

export function Navbar({ onSearch, searchValue = "" }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[hsl(var(--border))] bg-[hsl(var(--background)/0.8)] backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left: Brand Logo */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="h-8 w-8 rounded-lg bg-gradient-to-tr from-[hsl(var(--primary))] to-[hsl(var(--accent))] flex items-center justify-center text-white text-base font-bold shadow-[var(--shadow-glow)] group-hover:scale-105 transition-transform">
              ⚔️
            </span>
            <div className="flex flex-col">
              <span className="text-lg font-extrabold tracking-tight gradient-text leading-tight">
                Bloody-Roar
              </span>
              <span className="text-[10px] font-mono text-[hsl(var(--foreground-subtle))] leading-none uppercase tracking-widest">
                Bounty Escrow
              </span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-1 text-xs font-medium text-[hsl(var(--foreground-muted))]">
            <Link
              href="/marketplace"
              className="px-3 py-1.5 rounded-md hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--background-secondary))] transition-colors"
            >
              Marketplace
            </Link>
            <Link
              href="/dashboard"
              className="px-3 py-1.5 rounded-md hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--background-secondary))] transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/leaderboard"
              className="px-3 py-1.5 rounded-md hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--background-secondary))] transition-colors"
            >
              Leaderboard
            </Link>
          </nav>
        </div>

        {/* Center: Search Bar (StackOverflow-inspired top search) */}
        <div className="hidden lg:flex flex-1 max-w-md mx-4">
          <Input
            type="search"
            placeholder="Tìm kiếm bài toán (vd: reentrancy, nextjs, token)..."
            value={searchValue}
            onChange={(e) => onSearch?.(e.target.value)}
            icon={<span className="text-sm">🔍</span>}
            className="h-9 text-xs"
            data-testid="navbar-search-input"
          />
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          {/* Post Bounty Button */}
          <Link
            href="/issues/create"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.1)] hover:bg-[hsl(var(--primary)/0.2)] text-xs font-semibold text-[hsl(var(--primary))] transition-all active:scale-95"
            data-testid="post-bounty-btn"
          >
            <span>➕</span>
            <span>Đăng Bounty</span>
          </Link>

          {/* User Profile / Connect Wallet */}
          <UserMenu />

          {/* Mobile Menu Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="md:hidden p-2 rounded-lg text-[hsl(var(--foreground-muted))] hover:bg-[hsl(var(--background-secondary))]"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 space-y-2 animate-fade-in">
          <div className="mb-2">
            <Input
              type="search"
              placeholder="Tìm kiếm bài toán..."
              value={searchValue}
              onChange={(e) => onSearch?.(e.target.value)}
              icon={<span className="text-sm">🔍</span>}
              className="h-9 text-xs"
            />
          </div>
          <Link
            href="/marketplace"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-md text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--background-secondary))]"
          >
            🔥 Marketplace Bounties
          </Link>
          <Link
            href="/dashboard"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-md text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--background-secondary))]"
          >
            📊 My Dashboard
          </Link>
          <Link
            href="/issues/create"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-md text-sm font-medium text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.1)]"
          >
            ➕ Đăng bài toán mới (Post Bounty)
          </Link>
        </div>
      )}
    </header>
  );
}
