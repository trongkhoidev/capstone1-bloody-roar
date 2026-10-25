// apps/web/src/components/marketplace/filter-bar.tsx
// Claude Design System — Filter Drawer, Search & Segmented Sort (.seg)

"use client";

import React, { useState } from "react";
import { Search, Filter as FilterIcon, ChevronDown, ChevronUp } from "lucide-react";
import { useUiPreferences } from "@/lib/ui-preferences";

export type SortOption = "NEWEST" | "HIGHEST_BOUNTY" | "MOST_VIEWED" | "DEADLINE";

export interface FilterState {
  search: string;
  category: string;
  sortBy: SortOption;
  selectedSkill?: string | undefined;
  status?: string;
  bountyMin?: number | undefined;
  bountyMax?: number | undefined;
}

interface FilterBarProps {
  filters: FilterState;
  totalCount: number;
  onFilterChange: (filters: Partial<FilterState>) => void;
}

const CATEGORIES = [
  { id: "ALL", label: "All tasks" },
  { id: "BUG_FIX", label: "Bug fixes" },
  { id: "FEATURE", label: "Features" },
  { id: "SMART_CONTRACT", label: "Smart contracts" },
  { id: "AUDIT", label: "Security & audit" },
  { id: "UI_UX", label: "Frontend & design" },
  { id: "DATA_SCIENCE", label: "AI & data" },
  { id: "DEVOPS", label: "DevOps" },
  { id: "DOCUMENTATION", label: "Documentation" },
];

const STATUSES = [
  { id: "", label: "Any status" },
  { id: "OPEN", label: "Open" },
  { id: "IN_PROGRESS", label: "In progress" },
  { id: "COMPLETED", label: "Completed" },
];

export function MarketplaceFilterBar({
  filters,
  totalCount,
  onFilterChange,
}: FilterBarProps) {
  const { language, t } = useUiPreferences();
  const [showDrawer, setShowDrawer] = useState(false);

  const categories = CATEGORIES.map((cat) => {
    switch (cat.id) {
      case "ALL": return { ...cat, label: language === "vi" ? "Tất cả" : "All tasks" };
      case "BUG_FIX": return { ...cat, label: language === "vi" ? "Sửa lỗi" : "Bug fixes" };
      case "FEATURE": return { ...cat, label: language === "vi" ? "Tính năng" : "Features" };
      case "SMART_CONTRACT": return { ...cat, label: "Smart contracts" };
      case "AUDIT": return { ...cat, label: language === "vi" ? "Bảo mật & kiểm toán" : "Security & audit" };
      case "UI_UX": return { ...cat, label: language === "vi" ? "Giao diện" : "Frontend & design" };
      case "DATA_SCIENCE": return { ...cat, label: language === "vi" ? "AI & dữ liệu" : "AI & data" };
      case "DEVOPS": return { ...cat, label: "DevOps" };
      case "DOCUMENTATION": return { ...cat, label: language === "vi" ? "Tài liệu" : "Documentation" };
      default: return cat;
    }
  });

  return (
    <div className="space-y-3.5">
      {/* Top Controls: Segments & Filter Toggle */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Claude Design Segmented Sort Buttons (.seg) */}
        <div aria-label="Sort bounties" className="seg" role="group">
          <button
            type="button"
            className={filters.sortBy === "NEWEST" ? "on" : ""}
            onClick={() => onFilterChange({ sortBy: "NEWEST" })}
            data-testid="sort-tab-newest"
          >
            Newest
          </button>
          <button
            type="button"
            className={filters.sortBy === "HIGHEST_BOUNTY" ? "on" : ""}
            onClick={() => onFilterChange({ sortBy: "HIGHEST_BOUNTY" })}
            data-testid="sort-tab-highest_bounty"
          >
            Highest reward
          </button>
          <button
            type="button"
            className={filters.sortBy === "DEADLINE" ? "on" : ""}
            onClick={() => onFilterChange({ sortBy: "DEADLINE" })}
            data-testid="sort-tab-deadline"
          >
            Ending soon
          </button>
          <button
            type="button"
            className={filters.sortBy === "MOST_VIEWED" ? "on" : ""}
            onClick={() => onFilterChange({ sortBy: "MOST_VIEWED" })}
            data-testid="sort-tab-most_viewed"
          >
            Most viewed
          </button>
        </div>

        {/* Filter Drawer Toggle & Total Count */}
        <div className="flex items-center gap-3 ml-auto">
          <span className="text-xs text-[var(--ink-3)]">
            <b className="mono font-semibold text-[var(--ink)]">{totalCount}</b> results
          </span>

          <button
            type="button"
            onClick={() => setShowDrawer(!showDrawer)}
            className="btn btn-o btn-sm flex items-center gap-1.5"
            data-testid="toggle-filters-button"
          >
            <FilterIcon className="w-3.5 h-3.5 text-[var(--ink-2)]" />
            <span>Filter</span>
            {showDrawer ? <ChevronUp className="w-3 h-3 text-[var(--ink-3)]" /> : <ChevronDown className="w-3 h-3 text-[var(--ink-3)]" />}
          </button>
        </div>
      </div>

      {/* Collapsible Filter Drawer (.filters) */}
      {showDrawer && (
        <form
          aria-label="Filter bounties"
          className="filters"
          onSubmit={(e) => e.preventDefault()}
        >
          {/* Status Group */}
          <div className="fgroup">
            <span className="lab">Status</span>
            {STATUSES.map((status) => (
              <label key={status.id} className="text-xs">
                <input
                  type="radio"
                  name="status"
                  checked={(filters.status ?? "") === status.id}
                  onChange={() => onFilterChange({ status: status.id })}
                />
                <span>{status.label}</span>
              </label>
            ))}
          </div>

          {/* Reward Range Group */}
          <div className="fgroup">
            <span className="lab">Reward (USDC)</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="Min"
                className="tin mono text-xs"
                value={filters.bountyMin ?? ""}
                onChange={(e) => onFilterChange({ bountyMin: e.target.value ? Number(e.target.value) : undefined })}
                data-testid="bounty-min-filter"
              />
              <span className="text-[var(--ink-3)]">-</span>
              <input
                type="number"
                placeholder="Max"
                className="tin mono text-xs"
                value={filters.bountyMax ?? ""}
                onChange={(e) => onFilterChange({ bountyMax: e.target.value ? Number(e.target.value) : undefined })}
                data-testid="bounty-max-filter"
              />
            </div>
          </div>

          {/* Skills quick filter */}
          <div className="fgroup">
            <span className="lab">Active Skill</span>
            {filters.selectedSkill ? (
              <div className="flex items-center justify-between p-1.5 rounded-md bg-[var(--surface)] border border-[var(--line-2)] text-xs">
                <span className="font-medium text-[var(--brand)]">#{filters.selectedSkill}</span>
                <button
                  type="button"
                  onClick={() => onFilterChange({ selectedSkill: undefined })}
                  className="text-[var(--ink-3)] hover:text-[var(--ink)] font-bold px-1"
                >
                  ✕
                </button>
              </div>
            ) : (
              <span className="text-xs text-[var(--ink-3)]">Click any tag on a bounty card</span>
            )}
          </div>
        </form>
      )}

      {/* Search Input Bar with Icon */}
      <div className="relative flex items-center">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--ink-3)]" />
        <input
          type="search"
          placeholder={language === "vi" ? "Tìm theo tiêu đề, mô tả kỹ thuật hoặc kỹ năng…" : "Search titles, technical details, or skills…"}
          value={filters.search}
          onChange={(e) => onFilterChange({ search: e.target.value })}
          className="tin pl-9 h-9 w-full bg-[var(--surface)] border-[var(--line-2)] rounded-md text-xs sm:text-sm text-[var(--ink)]"
          data-testid="marketplace-search-input"
        />
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
        {categories.map((cat) => {
          const isSelected = (cat.id === "ALL" && !filters.category) || filters.category === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onFilterChange({ category: cat.id === "ALL" ? "" : cat.id })}
              className={`btn btn-sm text-xs rounded-full border transition-all ${
                isSelected
                  ? "bg-[var(--ink)] text-[var(--surface)] font-semibold border-[var(--ink)]"
                  : "bg-[var(--surface)] text-[var(--ink-2)] border-[var(--line)] hover:bg-[var(--sunk)]"
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
