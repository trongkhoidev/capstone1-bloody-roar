// apps/web/src/components/marketplace/issue-card.tsx
// Claude Design System — Bounty Card Component (.sum layout)

"use client";

import React from "react";
import Link from "next/link";
import { shortenAddress } from "../../lib/web3/client";

export interface IssueItem {
  id: string;
  title: string;
  description: string;
  category: string;
  status: "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "DISPUTED";
  bountyAmount: number;
  token: {
    symbol: string;
    name?: string;
    logoUrl?: string | null;
  };
  requiredSkills: string[];
  difficulty?: string | null;
  timeEstimate?: string | null;
  expiresAt?: string | null;
  viewCount: number;
  clientId?: string;
  developerId?: string | null;
  applicationCount?: number;
  attachments?: Array<{ id: string; fileName: string; fileUrl: string; fileMime: string }>;
  createdAt: string;
  client: {
    id: string;
    name?: string | null;
    avatar?: string | null;
    walletAddress: string;
    reputationScore: number;
    isGithubVerified: boolean;
  };
}

interface IssueCardProps {
  issue: IssueItem;
  onSkillClick?: (skill: string) => void;
}

export function IssueCard({ issue, onSkillClick }: IssueCardProps) {
  const description = issue.description
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!?(?:\[[^\]]*\]\([^)]*\)|\[[^\]]*\])/g, "")
    .replace(/(^|\s)#{1,6}\s/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const formatTimeAgo = (dateStr: string) => {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return "just now";
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const getStatusBadge = (status: IssueItem["status"]) => {
    switch (status) {
      case "OPEN":
        return <span className="badge b-open">Open</span>;
      case "ASSIGNED":
      case "IN_PROGRESS":
        return <span className="badge b-prog">In progress</span>;
      case "COMPLETED":
        return <span className="badge b-mut">Completed</span>;
      case "DISPUTED":
        return <span className="badge b-bad">Disputed</span>;
      default:
        return <span className="badge b-mut">{status}</span>;
    }
  };

  const clientInitials = (issue.client.name || issue.client.walletAddress.slice(2, 4)).toUpperCase().slice(0, 2);

  return (
    <article
      className="sum hover:bg-[var(--surface-2)] transition-colors border-b border-[var(--line)] last:border-b-0 p-4 sm:p-[16px_18px]"
      data-testid={`issue-card-${issue.id}`}
    >
      {/* -------------------------------------------------------------
          LEFT METRICS BOX (.stats — StackOverflow / Claude Design style)
          ------------------------------------------------------------- */}
      <div className="stats shrink-0">
        <div className="reward" title="Bounty reward">
          <span className="mono font-semibold">${issue.bountyAmount.toLocaleString()}</span>
          <small className="mono uppercase font-medium">{issue.token.symbol}</small>
        </div>

        <div className={`apps ${issue.applicationCount ? "has" : ""}`} title="Submitted applications">
          <span className="mono font-semibold">{issue.applicationCount || 0}</span>{" "}
          <span className="text-[11px]">applications</span>
        </div>

        <div className="views text-[11.5px] text-[var(--ink-3)]">
          <span className="mono">{issue.viewCount}</span> views
        </div>

        {issue.timeEstimate && (
          <div className="text-[11px] text-[var(--ink-3)] flex items-center gap-1">
            <span className="mono">{issue.timeEstimate}</span>
          </div>
        )}
      </div>

      {/* -------------------------------------------------------------
          RIGHT CONTENT (.s-title, .s-ex, .s-meta)
          ------------------------------------------------------------- */}
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          {/* Top category & tags bar */}
          <div className="s-top flex items-center gap-2 mb-1 flex-wrap text-xs text-[var(--ink-3)]">
            {getStatusBadge(issue.status)}
            <span className="badge b-info font-medium">{issue.category}</span>
            {issue.difficulty && (
              <span className="badge b-mut font-medium">{issue.difficulty}</span>
            )}
            <span className="mono text-[11px] text-[var(--ink-3)] ml-auto">
              #{issue.id.slice(-6)}
            </span>
          </div>

          {/* Bounty Title */}
          <h2 className="s-title mt-1">
            <Link
              href={`/issues/${issue.id}`}
              className="text-[var(--ink)] hover:text-[var(--link)] font-semibold transition-colors"
            >
              {issue.title}
            </Link>
          </h2>

          {/* Excerpt description */}
          <p className="s-ex mt-1 text-[var(--ink-2)] text-[13.5px] line-clamp-2">
            {description}
          </p>
        </div>

        {/* Bottom meta & skills */}
        <div className="s-meta mt-3 pt-2 flex items-center justify-between gap-3 flex-wrap border-t border-[var(--line)] border-dashed">
          {/* Skills tags */}
          <div className="tags flex gap-1.5 flex-wrap">
            {issue.requiredSkills.map((skill) => (
              <button
                key={skill}
                type="button"
                onClick={() => onSkillClick?.(skill)}
                className="tag hover:brightness-95 transition-all cursor-pointer"
              >
                {skill}
              </button>
            ))}
          </div>

          {/* Client Author Info */}
          <div className="uc flex items-center gap-2 text-xs text-[var(--ink-3)] ml-auto">
            <div className="av av1 w-6 h-6 rounded-md font-bold text-[10px] grid place-items-center">
              {clientInitials}
            </div>
            <span className="font-semibold text-[var(--ink-2)]">
              {issue.client.name || shortenAddress(issue.client.walletAddress)}
            </span>
            <span className="text-[var(--gold)] font-medium">
              {issue.client.reputationScore} rep
            </span>
            {issue.client.isGithubVerified && (
              <span
                title="Verified GitHub account"
                className="text-[var(--ok)] text-[11px] font-bold"
              >
                ✓
              </span>
            )}
            <span className="text-[var(--ink-3)]">·</span>
            <span>{formatTimeAgo(issue.createdAt)}</span>
          </div>
        </div>
      </div>
    </article>
  );
}
