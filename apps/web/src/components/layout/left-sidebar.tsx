// apps/web/src/components/layout/left-sidebar.tsx
// Trâm (UI/UX Designer) — StackOverflow-Inspired Left Navigation Rail

"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: string;
}

const PUBLIC_NAV: NavItem[] = [
  { label: "Marketplace", href: "/", icon: "🌐" },
  { label: "Kỹ năng (Tags)", href: "/tags", icon: "🏷️" },
  { label: "Bảng xếp hạng", href: "/leaderboard", icon: "🏆" },
];

const MY_WORK_NAV: NavItem[] = [
  { label: "Bảng công việc", href: "/dashboard", icon: "📋" },
  { label: "Task đã nhận", href: "/dashboard/working", icon: "⚡" },
  { label: "Thu nhập & Escrow", href: "/dashboard/earnings", icon: "💰" },
];

const PROTOCOL_NAV: NavItem[] = [
  { label: "AI Guard Security", href: "/protocol/ai-guard", icon: "🤖", badge: "Live" },
  { label: "Escrow Contract", href: "/protocol/escrow", icon: "⛓️" },
  { label: "Base Sepolia Explorer", href: "https://sepolia.basescan.org", icon: "↗" },
];

export function LeftSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 hidden md:block border-r border-[hsl(var(--border))] min-h-[calc(100vh-4rem)] p-4 pr-3 text-xs">
      <div className="sticky top-20 space-y-6">
        {/* Section 1: PUBLIC */}
        <div>
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--foreground-subtle))]">
            Khám phá
          </div>
          <nav className="space-y-1">
            {PUBLIC_NAV.map((item) => {
              const isActive = pathname === item.href || (item.href === "/" && pathname === "/marketplace");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg font-medium transition-all ${
                    isActive
                      ? "bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))] font-semibold border-r-2 border-[hsl(var(--primary))]"
                      : "text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--background-secondary))]"
                  }`}
                  data-testid={`left-nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm">{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[hsl(var(--primary))] text-white">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Section 2: MY WORK */}
        <div>
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--foreground-subtle))]">
            Công việc của tôi
          </div>
          <nav className="space-y-1">
            {MY_WORK_NAV.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg font-medium transition-all ${
                    isActive
                      ? "bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))] font-semibold border-r-2 border-[hsl(var(--primary))]"
                      : "text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--background-secondary))]"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm">{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Section 3: PROTOCOL */}
        <div>
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--foreground-subtle))]">
            Giao thức & Công nghệ
          </div>
          <nav className="space-y-1">
            {PROTOCOL_NAV.map((item) => {
              const isExternal = item.href.startsWith("http");
              return (
                <a
                  key={item.href}
                  href={item.href}
                  target={isExternal ? "_blank" : undefined}
                  rel={isExternal ? "noopener noreferrer" : undefined}
                  className="flex items-center justify-between px-3 py-2 rounded-lg font-medium text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--background-secondary))] transition-all"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm">{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[hsl(var(--success)/0.2)] text-[hsl(var(--success))]">
                      {item.badge}
                    </span>
                  )}
                </a>
              );
            })}
          </nav>
        </div>

        {/* Network status pill */}
        <div className="px-3 py-2 rounded-xl bg-[hsl(var(--background-secondary))] border border-[hsl(var(--border))] text-[11px]">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[hsl(var(--success))] animate-pulse" />
            <span className="font-semibold text-[hsl(var(--foreground))]">
              Base Sepolia
            </span>
          </div>
          <div className="text-[10px] text-[hsl(var(--foreground-subtle))] mt-0.5 font-mono">
            Chain ID: 84532
          </div>
        </div>
      </div>
    </aside>
  );
}
