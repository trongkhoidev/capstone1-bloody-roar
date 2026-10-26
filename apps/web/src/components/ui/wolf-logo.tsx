// apps/web/src/components/ui/wolf-logo.tsx
// Bloody-Roar Cyber Wolf (Sói Bạc Công Nghệ) Logo Component
// Using user's uploaded cybernetic wolf head artwork

"use client";

import React from "react";

interface WolfLogoProps {
  size?: number;
  className?: string;
  variant?: "auto" | "light" | "dark";
}

export function WolfLogo({ size = 22, className = "", variant = "auto" }: WolfLogoProps) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* Light theme: deep obsidian & cyber tech circuits */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/wolf-logo.png"
        alt="Bloody-Roar Cyber Wolf Logo"
        width={size}
        height={size}
        className={`h-full w-full object-contain filter drop-shadow-[0_1px_1px_rgba(0,0,0,0.1)] transition-transform duration-200 hover:scale-105 ${
          variant === "auto" ? "block dark:hidden" : variant === "light" ? "block" : "hidden"
        }`}
      />
      {/* Dark theme: luminous silver-platinum cyber wolf */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/wolf-logo-dark.png"
        alt="Bloody-Roar Cyber Wolf Logo"
        width={size}
        height={size}
        className={`h-full w-full object-contain filter drop-shadow-[0_1px_4px_rgba(255,255,255,0.08)] transition-transform duration-200 hover:scale-105 ${
          variant === "auto" ? "hidden dark:block" : variant === "dark" ? "block" : "hidden"
        }`}
      />
    </span>
  );
}

export function WolfMark({
  size = 28,
  iconSize = 20,
  className = "",
}: {
  size?: number;
  iconSize?: number;
  className?: string;
}) {
  return (
    <span
      className={`mark ${className}`}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        borderRadius: Math.max(6, Math.floor(size * 0.24)),
        background: "var(--surface)",
        display: "grid",
        placeItems: "center",
        border: "1px solid var(--line-2)",
        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.06)",
        overflow: "hidden",
      }}
    >
      <WolfLogo size={iconSize} />
    </span>
  );
}
