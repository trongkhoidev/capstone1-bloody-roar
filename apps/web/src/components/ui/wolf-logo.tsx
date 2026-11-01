// apps/web/src/components/ui/wolf-logo.tsx
// Bloody-Roar Cyber Wolf (Sói Bạc Công Nghệ) Logo Component
// Using user's uploaded cybernetic wolf head artwork (borderless & scalable)

"use client";

import React from "react";

interface WolfLogoProps {
  size?: number;
  className?: string;
  variant?: "auto" | "light" | "dark";
}

export function WolfLogo({ size = 34, className = "", variant = "auto" }: WolfLogoProps) {
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
        className={`h-full w-full object-contain transition-transform duration-200 hover:scale-105 ${
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
        className={`h-full w-full object-contain transition-transform duration-200 hover:scale-105 ${
          variant === "auto" ? "hidden dark:block" : variant === "dark" ? "block" : "hidden"
        }`}
      />
    </span>
  );
}

export function WolfMark({
  size = 34,
  iconSize,
  className = "",
}: {
  size?: number;
  iconSize?: number;
  className?: string;
}) {
  const finalSize = iconSize || size;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center select-none ${className}`}
      style={{
        width: finalSize,
        height: finalSize,
        minWidth: finalSize,
        minHeight: finalSize,
        background: "transparent",
        border: "none",
        boxShadow: "none",
        overflow: "visible",
      }}
    >
      <WolfLogo size={finalSize} />
    </span>
  );
}
