// apps/web/src/components/marketplace/marketplace-empty.tsx
// Trâm (UI/UX Designer) — Friendly Empty State Component

import React from "react";
import { Button } from "../ui/button";

interface MarketplaceEmptyProps {
  onResetFilters: () => void;
}

export function MarketplaceEmpty({ onResetFilters }: MarketplaceEmptyProps) {
  return (
    <div
      className="p-12 text-center rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card)/0.5)] space-y-4"
      data-testid="marketplace-empty-state"
    >
      <div className="text-4xl">🔍</div>
      <h3 className="text-base font-bold text-[hsl(var(--foreground))]">
        Không tìm thấy bài toán nào phù hợp
      </h3>
      <p className="text-xs text-[hsl(var(--foreground-muted))] max-w-sm mx-auto leading-relaxed">
        Thử điều chỉnh lại từ khóa tìm kiếm, bỏ chọn tag kỹ năng hoặc đổi danh mục lọc để xem thêm bài đăng.
      </p>
      <Button
        variant="secondary"
        size="sm"
        onClick={onResetFilters}
        className="mt-2"
        data-testid="reset-filters-btn"
      >
        Đặt lại bộ lọc
      </Button>
    </div>
  );
}
