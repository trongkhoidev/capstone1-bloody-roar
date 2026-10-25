// apps/web/src/components/ui/skeleton.tsx
// Trâm (Test & UX) — Skeleton Loading Indicator (Zero layout shift)

import * as React from "react";

export function Skeleton({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`skeleton rounded-md bg-[hsl(var(--muted))] ${className}`}
      {...props}
    />
  );
}
