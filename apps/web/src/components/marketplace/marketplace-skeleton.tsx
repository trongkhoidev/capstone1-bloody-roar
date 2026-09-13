// apps/web/src/components/marketplace/marketplace-skeleton.tsx
// Trâm (UI/UX & QA) — Zero Layout Shift Skeleton Screen for Marketplace

import React from "react";
import { Skeleton } from "../ui/skeleton";

export function MarketplaceSkeleton() {
  return (
    <div className="space-y-4" data-testid="marketplace-skeleton">
      {[1, 2, 3, 4, 5].map((idx) => (
        <div
          key={idx}
          className="flex flex-col sm:flex-row gap-4 p-5 rounded-xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))]"
        >
          {/* Left metrics skeleton */}
          <div className="flex sm:flex-col items-center sm:items-end gap-2 sm:w-28 shrink-0">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-6 w-20 rounded" />
            <Skeleton className="h-4 w-12 rounded" />
          </div>

          {/* Right content skeleton */}
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-24 rounded" />
              <Skeleton className="h-5 w-16 rounded" />
            </div>
            <Skeleton className="h-6 w-3/4 rounded" />
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-2/3 rounded" />
            <div className="flex items-center justify-between pt-2">
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16 rounded" />
                <Skeleton className="h-5 w-16 rounded" />
                <Skeleton className="h-5 w-16 rounded" />
              </div>
              <Skeleton className="h-7 w-32 rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
