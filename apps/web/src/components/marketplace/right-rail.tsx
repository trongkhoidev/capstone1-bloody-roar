// apps/web/src/components/marketplace/right-rail.tsx
// Trâm (UI/UX Designer) — StackOverflow-Style Right Sidebar Widget Panel

"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";

interface RightRailProps {
  onTagClick?: (tag: string) => void;
}

const POPULAR_TAGS = [
  { name: "solidity", count: 18 },
  { name: "typescript", count: 24 },
  { name: "nextjs", count: 15 },
  { name: "smart-contracts", count: 14 },
  { name: "security-audit", count: 9 },
  { name: "base-sepolia", count: 12 },
  { name: "hardhat", count: 10 },
  { name: "graphql", count: 7 },
  { name: "reentrancy", count: 5 },
  { name: "erc20", count: 8 },
];

const RECENT_ACTIVITIES = [
  {
    id: "act-1",
    text: "Client 0x4a...9b1 đã ký quỹ 500 USDT vào Issue #104",
    time: "5 phút trước",
    icon: "🔒",
  },
  {
    id: "act-2",
    text: "Dev hoang.eth đã nộp bài giải cho Issue #098",
    time: "25 phút trước",
    icon: "📦",
  },
  {
    id: "act-3",
    text: "Escrow giải ngân 1,200 USDT thành công cho minhkhoi.dev",
    time: "1 giờ trước",
    icon: "💰",
  },
];

export function MarketplaceRightRail({ onTagClick }: RightRailProps) {
  return (
    <aside className="w-80 shrink-0 hidden lg:block space-y-5">
      {/* 1. How Escrow Works (Yellow notice / Info card like StackOverflow) */}
      <Card className="border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.04)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-bold text-[hsl(var(--warning))] flex items-center gap-1.5">
            <span>🛡️</span>
            <span>Cơ Chế Ký Quỹ Escrow Minh Bạch</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-[hsl(var(--foreground-muted))] space-y-2 leading-relaxed">
          <p>
            Tiền thưởng bounty được <strong className="text-[hsl(var(--foreground))]">khóa an toàn trên Smart Contract</strong> Base Sepolia trước khi developer bắt đầu code.
          </p>
          <ul className="list-disc list-inside space-y-1 text-[11px] text-[hsl(var(--foreground-subtle))]">
            <li>Zero Rug-pull: Tiền nằm trên blockchain</li>
            <li>AI Guard: Tự động che mật khẩu & secrets trong chat</li>
            <li>Tranh chấp giải quyết bởi AI Arbiter trong 24h</li>
          </ul>
        </CardContent>
      </Card>

      {/* 2. Top Skills in Demand (Tag Cloud) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-bold text-[hsl(var(--foreground))] flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span>🏷️</span>
              <span>Kỹ Năng Được Săn Đón</span>
            </span>
            <span className="text-[10px] text-[hsl(var(--foreground-subtle))] font-normal">
              10 tags hot
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {POPULAR_TAGS.map((tag) => (
              <button
                key={tag.name}
                type="button"
                onClick={() => onTagClick?.(tag.name)}
                className="hover:scale-105 transition-transform focus:outline-none"
              >
                <Badge variant="tag" className="flex items-center gap-1 py-1">
                  <span>{tag.name}</span>
                  <span className="text-[9px] text-[hsl(var(--foreground-subtle))]">
                    ×{tag.count}
                  </span>
                </Badge>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 3. Recent Escrow Activity (Live Ticker) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-bold text-[hsl(var(--foreground))] flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span>⚡</span>
              <span>Hoạt Động Ký Quỹ Gần Đây</span>
            </span>
            <span className="h-2 w-2 rounded-full bg-[hsl(var(--success))] animate-ping" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {RECENT_ACTIVITIES.map((act) => (
              <div key={act.id} className="flex items-start gap-2.5 text-xs">
                <span className="text-sm mt-0.5">{act.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-[hsl(var(--foreground))] leading-snug">
                    {act.text}
                  </p>
                  <span className="text-[10px] text-[hsl(var(--foreground-subtle))]">
                    {act.time}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 4. Stats Summary */}
      <div className="p-4 rounded-xl border border-[hsl(var(--card-border))] bg-[hsl(var(--background-secondary)/0.5)] grid grid-cols-2 gap-3 text-center">
        <div>
          <div className="text-lg font-extrabold text-[hsl(var(--foreground))]">
            $128,450
          </div>
          <div className="text-[10px] text-[hsl(var(--foreground-subtle))] uppercase tracking-wider">
            Tổng Escrow Đã Khóa
          </div>
        </div>
        <div>
          <div className="text-lg font-extrabold text-[hsl(var(--success))]">
            99.4%
          </div>
          <div className="text-[10px] text-[hsl(var(--foreground-subtle))] uppercase tracking-wider">
            Tỷ Lệ Hoàn Thành
          </div>
        </div>
      </div>
    </aside>
  );
}
