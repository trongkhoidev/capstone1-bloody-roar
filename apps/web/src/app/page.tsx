// apps/web/src/app/page.tsx
// Landing page — Sprint 0 placeholder

import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bloody-Roar — Decentralized Bounty Marketplace",
  description:
    "Replace trust with mathematics and AI. Blockchain escrow for freelance developers.",
};

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      {/* Hero Section */}
      <div className="w-full max-w-4xl text-center space-y-8 animate-fade-in">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.1)] px-4 py-1.5 text-sm text-[hsl(var(--primary))]">
          <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))] animate-pulse-dot" />
          Sprint 0 — Foundation
        </div>

        {/* Title */}
        <h1 className="text-5xl font-bold tracking-tight sm:text-7xl">
          <span className="gradient-text">Bloody-Roar</span>
        </h1>

        {/* Subtitle */}
        <p className="text-xl text-[hsl(var(--foreground-muted))] max-w-2xl mx-auto leading-relaxed">
          Decentralized Bounty Marketplace.{" "}
          <span className="text-[hsl(var(--foreground))]">
            Replace trust with mathematics and AI.
          </span>
        </p>

        {/* Status Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mt-12">
          <StatusCard
            icon="⛓️"
            label="Blockchain Escrow"
            status="Sprint 2"
            ready={false}
          />
          <StatusCard
            icon="🤖"
            label="AI Guard"
            status="Sprint 2"
            ready={false}
          />
          <StatusCard
            icon="⚖️"
            label="Dispute AI"
            status="Sprint 3"
            ready={false}
          />
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
          <Link
            href="/marketplace"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-[hsl(var(--primary-hover))] hover:shadow-[var(--shadow-glow)] active:scale-95"
          >
            Explore Marketplace →
          </Link>
          <a
            href="/api/graphql"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-6 py-3 text-sm font-semibold text-[hsl(var(--foreground))] transition-all hover:bg-[hsl(var(--background-secondary))] active:scale-95"
          >
            GraphQL Explorer ↗
          </a>
        </div>

        {/* Sprint 0 checklist */}
        <div className="mt-16 glass rounded-xl p-6 text-left max-w-lg mx-auto">
          <h2 className="text-sm font-semibold text-[hsl(var(--foreground-muted))] uppercase tracking-wider mb-4">
            Sprint 0 Status
          </h2>
          <ul className="space-y-2">
            {[
              { label: "Bun Monorepo Workspaces", done: true },
              { label: "Prisma Schema (10+ models)", done: true },
              { label: "Next.js Custom Server", done: true },
              { label: "GraphQL Yoga + Pothos", done: true },
              { label: "Socket.io Attached", done: true },
              { label: "Tailwind CSS v4 + Design Tokens", done: true },
              { label: "Docker Compose PostgreSQL", done: true },
              { label: "Hardhat Project", done: true },
              { label: "AI Prompts Structure", done: true },
              { label: "TypeScript Strict + ESLint", done: true },
              { label: "Pino Logger", done: true },
              { label: ".env.example", done: true },
              { label: "shadcn/ui (Sprint 0 → run: bunx shadcn init)", done: false },
            ].map((item) => (
              <li key={item.label} className="flex items-center gap-3 text-sm">
                <span className={item.done ? "text-[hsl(var(--success))]" : "text-[hsl(var(--foreground-subtle))]"}>
                  {item.done ? "✓" : "○"}
                </span>
                <span className={item.done ? "text-[hsl(var(--foreground))]" : "text-[hsl(var(--foreground-subtle))]"}>
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}

function StatusCard({
  icon,
  label,
  status,
  ready,
}: {
  icon: string;
  label: string;
  status: string;
  ready: boolean;
}) {
  return (
    <div className="glass rounded-xl p-5 text-left transition-all hover:border-[hsl(var(--primary)/0.3)]">
      <div className="text-2xl mb-3">{icon}</div>
      <div className="font-semibold text-sm mb-1">{label}</div>
      <div
        className={`text-xs ${
          ready
            ? "text-[hsl(var(--success))]"
            : "text-[hsl(var(--foreground-subtle))]"
        }`}
      >
        {ready ? "✓ Ready" : `Coming in ${status}`}
      </div>
    </div>
  );
}
