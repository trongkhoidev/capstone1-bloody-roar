// apps/web/src/components/marketplace/filter-bar.tsx
// Trâm (UI/UX Designer) — Marketplace Search, Filter Chips & Sorting Tabs

"use client";

import React from "react";
import { Input } from "../ui/input";
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

const SORT_OPTIONS: { id: SortOption; label: string }[] = [
  { id: "NEWEST", label: "Newest" },
  { id: "HIGHEST_BOUNTY", label: "Highest bounty" },
  { id: "DEADLINE", label: "Ending soon" },
];

export function MarketplaceFilterBar({
  filters,
  totalCount,
  onFilterChange,
}: FilterBarProps) {
  const { language, t } = useUiPreferences();
  const categoryLabels = language === "vi"
    ? ["Tất cả", "Sửa lỗi", "Tính năng", "Smart contract", "Bảo mật & kiểm toán", "Giao diện", "AI & dữ liệu", "DevOps", "Tài liệu"]
    : ["All tasks", "Bug fixes", "Features", "Smart contracts", "Security & audit", "Frontend & design", "AI & data", "DevOps", "Documentation"];
  const statusLabels = language === "vi" ? ["Mọi trạng thái", "Đang mở", "Đang thực hiện", "Hoàn thành"] : ["Any status", "Open", "In progress", "Completed"];
  const sortLabels = language === "vi" ? ["Mới nhất", "Thưởng cao nhất", "Sắp hết hạn"] : ["Newest", "Highest bounty", "Ending soon"];
  const categories = CATEGORIES.map((category, index) => ({ ...category, label: categoryLabels[index] ?? category.label }));
  const statuses = STATUSES.map((status, index) => ({ ...status, label: statusLabels[index] ?? status.label }));
  const sorts = SORT_OPTIONS.map((option, index) => ({ ...option, label: sortLabels[index] ?? option.label }));
  return (
    <div className="space-y-4 mb-6">
      {/* Top row: Counter & Sorting Tabs (StackOverflow style header) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[hsl(var(--border))]">
        <div>
          <h2 className="text-xl font-black tracking-tight text-[hsl(var(--foreground))]">
            {t("openBounties")}
          </h2>
          <p className="mt-0.5 text-xs text-[hsl(var(--foreground-muted))]">
            <span className="font-bold text-[hsl(var(--primary))]">{totalCount}</span> {t("opportunities")}
          </p>
        </div>

        {/* Sort Tabs */}
        <div className="flex items-center p-1 rounded-lg bg-[hsl(var(--background-secondary))] border border-[hsl(var(--border))] text-xs font-medium">
          {sorts.map((opt) => (
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

      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="issue-status-filter">Status</label>
        <select
          id="issue-status-filter"
          value={filters.status ?? ""}
          onChange={(event) => onFilterChange({ status: event.target.value })}
          className="h-9 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-xs text-[hsl(var(--foreground))]"
          data-testid="marketplace-status-filter"
        >
          {statuses.map((status) => <option key={status.id || "all"} value={status.id}>{status.label}</option>)}
        </select>
        <label className="flex h-9 items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-xs text-[hsl(var(--foreground-muted))]">
          <span>{language === "vi" ? "Thưởng tối thiểu" : "Min bounty"}</span>
          <input
            aria-label="Minimum bounty"
            inputMode="decimal"
            type="number"
            min="0"
            value={filters.bountyMin ?? ""}
            onChange={(event) => onFilterChange({ bountyMin: event.target.value ? Number(event.target.value) : undefined })}
            className="w-16 bg-transparent text-[hsl(var(--foreground))] outline-none"
            data-testid="bounty-min-filter"
          />
        </label>
        <label className="flex h-9 items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-xs text-[hsl(var(--foreground-muted))]">
          <span>{language === "vi" ? "Thưởng tối đa" : "Max bounty"}</span>
          <input
            aria-label="Maximum bounty"
            inputMode="decimal"
            type="number"
            min="0"
            value={filters.bountyMax ?? ""}
            onChange={(event) => onFilterChange({ bountyMax: event.target.value ? Number(event.target.value) : undefined })}
            className="w-16 bg-transparent text-[hsl(var(--foreground))] outline-none"
            data-testid="bounty-max-filter"
          />
        </label>
      </div>

      {/* Second row: Search & Active Skill Filter Tag */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="flex-1">
          <Input
            type="search"
            placeholder={language === "vi" ? "Tìm theo tiêu đề, mô tả kỹ thuật hoặc kỹ năng…" : "Search titles, technical details, or skills…"}
            value={filters.search}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            data-testid="marketplace-search-input"
          />
        </div>

        {/* Active Skill Filter Pill (if selected) */}
        {filters.selectedSkill && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.1)] text-xs text-[hsl(var(--primary))] shrink-0 font-medium">
            <span>{language === "vi" ? "Kỹ năng:" : "Tag:"} #{filters.selectedSkill}</span>
            <button
              type="button"
              onClick={() => onFilterChange({ selectedSkill: undefined })}
              className="hover:opacity-80 font-bold"
              title="Clear tag filter"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Third row: Category Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs no-scrollbar">
        {categories.map((cat) => {
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
