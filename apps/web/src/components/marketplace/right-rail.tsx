// apps/web/src/components/marketplace/right-rail.tsx
// Trâm (UI/UX Designer) — StackOverflow-Style Right Sidebar Widget Panel

"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";

interface RightRailProps {
  onTagClick?: (tag: string) => void;
  stats?: { bountyPool: Array<{ symbol: string; formatted: string }> } | null;
  recentCompleted?: Array<{ id: string; title: string; createdAt: string }> | null;
}

function formatTimeAgo(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "vừa xong";
  const hours = Math.max(0, Math.floor((Date.now() - time) / 3_600_000));
  if (hours < 1) return "vừa xong";
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return `${days} ngày trước`;
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

export function MarketplaceRightRail({ onTagClick, stats, recentCompleted }: RightRailProps) {
  return (
    <aside className="w-80 shrink-0 hidden lg:block space-y-5">
      {/* 1. How Escrow Works (Yellow notice / Info card like StackOverflow) */}
      <Card className="border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.04)]">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-bold text-[hsl(var(--warning))] flex items-center gap-1.5">
            <span>Cách escrow hoạt động</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-[hsl(var(--foreground-muted))] space-y-2 leading-relaxed">
          <p>
            Tiền thưởng được <strong className="text-[hsl(var(--foreground))]">khóa trên smart contract Base Sepolia</strong> trước khi developer bắt đầu làm việc.
          </p>
          <ul className="list-disc list-inside space-y-1 text-[11px] text-[hsl(var(--foreground-subtle))]">
            <li>Tiền nằm trên blockchain, không qua tay nền tảng</li>
            <li>AI Guard che mật khẩu và khóa bí mật trong chat</li>
            <li>AI Arbiter xử lý tranh chấp trong 24 giờ</li>
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
            {recentCompleted && recentCompleted.length > 0 ? (
              recentCompleted.map((act) => (
                <div key={act.id} className="flex items-start gap-2.5 text-xs">
                  <span className="text-sm mt-0.5">💰</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-[hsl(var(--foreground))] leading-snug">
                      Hoàn thành: {act.title.length > 60 ? `${act.title.slice(0, 57)}...` : act.title}
                    </p>
                    <span className="text-[10px] text-[hsl(var(--foreground-subtle))]">
                      {formatTimeAgo(act.createdAt)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-[hsl(var(--foreground-subtle))]">Chưa có hoạt động.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 4. Stats Summary */}
      <div className="p-4 rounded-xl border border-[hsl(var(--card-border))] bg-[hsl(var(--background-secondary)/0.5)] grid grid-cols-2 gap-3 text-center">
        <div>
          <div className="text-lg font-extrabold text-[hsl(var(--foreground))]">
            {stats && stats.bountyPool.length
              ? stats.bountyPool.map((p) => `${p.formatted} ${p.symbol}`).join(" · ")
              : "—"}
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
