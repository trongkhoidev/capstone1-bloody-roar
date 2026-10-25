// apps/web/src/components/marketplace/filter-bar.tsx
// Trâm (UI/UX Designer) — Marketplace Search, Filter Chips & Sorting Tabs

"use client";

import React from "react";
import { Input } from "../ui/input";

export type SortOption = "NEWEST" | "HIGHEST_BOUNTY" | "MOST_VIEWED";

export interface FilterState {
  search: string;
  category: string;
  sortBy: SortOption;
  selectedSkill?: string | undefined;
}

interface FilterBarProps {
  filters: FilterState;
  totalCount: number;
  onFilterChange: (filters: Partial<FilterState>) => void;
}

const CATEGORIES = [
  { id: "ALL", label: "Tất cả" },
  { id: "SMART_CONTRACT", label: "Smart Contract ⛓️" },
  { id: "SECURITY", label: "Security & Audit 🛡️" },
  { id: "FRONTEND", label: "Frontend 🎨" },
  { id: "BACKEND", label: "Backend ⚙️" },
  { id: "AI_ML", label: "AI & ML 🤖" },
];

const SORT_OPTIONS: { id: SortOption; label: string }[] = [
  { id: "NEWEST", label: "Mới nhất" },
  { id: "HIGHEST_BOUNTY", label: "Bounty cao nhất" },
  { id: "MOST_VIEWED", label: "Xem nhiều nhất" },
];

export function MarketplaceFilterBar({
  filters,
  totalCount,
  onFilterChange,
}: FilterBarProps) {
  return (
    <div className="space-y-4 mb-6">
      {/* Top row: Counter & Sorting Tabs (StackOverflow style header) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[hsl(var(--border))]">
        <div>
          <h1 className="text-xl font-black tracking-tight text-[hsl(var(--foreground))]">
            Chợ Bài Toán (Bounty Marketplace)
          </h1>
          <p className="text-xs text-[hsl(var(--foreground-muted))] mt-0.5">
            Tổng cộng{" "}
            <span className="font-bold text-[hsl(var(--primary))]">
              {totalCount}
            </span>{" "}
            bài toán đang sẵn sàng nhận dev
          </p>
        </div>

        {/* Sort Tabs */}
        <div className="flex items-center p-1 rounded-lg bg-[hsl(var(--background-secondary))] border border-[hsl(var(--border))] text-xs font-medium">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onFilterChange({ sortBy: opt.id })}
              className={`px-3 py-1.5 rounded-md transition-all ${
                filters.sortBy === opt.id
                  ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] font-semibold shadow-sm text-[hsl(var(--primary))]"
                  : "text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--foreground))]"
              }`}
              data-testid={`sort-tab-${opt.id.toLowerCase()}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Second row: Search & Active Skill Filter Tag */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="flex-1">
          <Input
            type="search"
            placeholder="Tìm theo tiêu đề, mô tả kỹ thuật hoặc từ khóa lỗi..."
            value={filters.search}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            icon={<span className="text-sm">🔍</span>}
            data-testid="marketplace-search-input"
          />
        </div>

        {/* Active Skill Filter Pill (if selected) */}
        {filters.selectedSkill && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.1)] text-xs text-[hsl(var(--primary))] shrink-0 font-medium">
            <span>Tag: #{filters.selectedSkill}</span>
            <button
              type="button"
              onClick={() => onFilterChange({ selectedSkill: undefined })}
              className="hover:opacity-80 font-bold"
              title="Xóa bộ lọc tag"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Third row: Category Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs no-scrollbar">
        {CATEGORIES.map((cat) => {
          const isSelected =
            (cat.id === "ALL" && !filters.category) ||
            filters.category === cat.id;

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() =>
                onFilterChange({
                  category: cat.id === "ALL" ? "" : cat.id,
                })
              }
              className={`px-3 py-1.5 rounded-full border text-xs whitespace-nowrap transition-all ${
                isSelected
                  ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-white font-semibold shadow-[var(--shadow-sm)]"
                  : "border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--foreground))] hover:border-[hsl(var(--foreground-subtle))]"
              }`}
              data-testid={`category-chip-${cat.id.toLowerCase()}`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
