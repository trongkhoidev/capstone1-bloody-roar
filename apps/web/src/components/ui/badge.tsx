// apps/web/src/components/ui/badge.tsx
// Trâm (UI/UX Designer) — Status & Technology Tag Badge Component

import * as React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?:
    | "default"
    | "secondary"
    | "success"
    | "warning"
    | "danger"
    | "outline"
    | "tag";
}

export function Badge({
  className = "",
  variant = "default",
  children,
  ...props
}: BadgeProps) {
  const baseStyles =
    "inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]";

  const variantStyles = {
    default:
      "bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))] border border-[hsl(var(--primary)/0.3)]",
    secondary:
      "bg-[hsl(var(--background-secondary))] text-[hsl(var(--foreground-muted))] border border-[hsl(var(--border))]",
    success:
      "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))] border border-[hsl(var(--success)/0.3)]",
    warning:
      "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))] border border-[hsl(var(--warning)/0.3)]",
    danger:
      "bg-[hsl(var(--destructive)/0.15)] text-[hsl(var(--destructive))] border border-[hsl(var(--destructive)/0.3)]",
    outline:
      "text-[hsl(var(--foreground))] border border-[hsl(var(--border))]",
    tag:
      "bg-[hsl(var(--background-secondary))] text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--primary))] hover:border-[hsl(var(--primary)/0.4)] border border-[hsl(var(--border))] font-mono text-[11px] cursor-pointer transition-all",
  };

  return (
    <div className={`${baseStyles} ${variantStyles[variant]} ${className}`} {...props}>
      {children}
    </div>
  );
}
