// apps/web/src/components/marketplace/issue-card.tsx
// Trâm (UI/UX Designer) — StackOverflow-Inspired Bounty Card Component (S1-MKP-18)

"use client";

import React from "react";
import Link from "next/link";
import { Badge } from "../ui/badge";
import { shortenAddress } from "../../lib/web3/client";

export interface IssueItem {
  id: string;
  title: string;
  description: string;
  category: string;
  status: "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "DISPUTED";
  bountyAmount: number;
  token: {
    symbol: string;
    name?: string;
    logoUrl?: string | null;
  };
  requiredSkills: string[];
  difficulty?: string | null;
  timeEstimate?: string | null;
  viewCount: number;
  applicationCount?: number;
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
  const formatTimeAgo = (dateStr: string) => {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return "vừa xong";
    if (diffHours < 24) return `${diffHours} giờ trước`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} ngày trước`;
  };

  const getStatusBadge = (status: IssueItem["status"]) => {
    switch (status) {
      case "OPEN":
        return <Badge variant="success">Đang mở (Open)</Badge>;
      case "ASSIGNED":
      case "IN_PROGRESS":
        return <Badge variant="warning">Đang thực hiện</Badge>;
      case "COMPLETED":
        return <Badge variant="secondary">Hoàn thành</Badge>;
      case "DISPUTED":
        return <Badge variant="danger">Tranh chấp</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getDifficultyColor = (diff?: string | null) => {
    switch (diff) {
      case "EXPERT":
        return "text-[hsl(var(--destructive))] border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.1)]";
      case "INTERMEDIATE":
        return "text-[hsl(var(--warning))] border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.1)]";
      default:
        return "text-[hsl(var(--success))] border-[hsl(var(--success)/0.3)] bg-[hsl(var(--success)/0.1)]";
    }
  };

  return (
    <article
      className="group relative flex flex-col sm:flex-row gap-4 p-5 rounded-xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] hover:border-[hsl(var(--primary)/0.4)] hover:shadow-[var(--shadow-md)] transition-all duration-200"
      data-testid={`issue-card-${issue.id}`}
    >
      {/* -------------------------------------------------------------
          LEFT METRIC BOX (StackOverflow iconic left metrics container)
          ------------------------------------------------------------- */}
      <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2.5 sm:w-28 shrink-0 text-right">
        {/* Bounty Box (Highlighted like StackOverflow vote/bounty box) */}
        <div
          className="flex flex-col items-center sm:items-end justify-center px-3 py-2 rounded-lg border border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.08)] group-hover:bg-[hsl(var(--primary)/0.14)] transition-colors w-full"
          title="Tiền thưởng ký quỹ Escrow"
        >
          <div className="text-base font-extrabold text-[hsl(var(--primary))] tracking-tight">
            ${issue.bountyAmount.toLocaleString()}
          </div>
          <div className="text-[10px] font-bold text-[hsl(var(--foreground-muted))] uppercase tracking-wider">
            {issue.token.symbol}
          </div>
        </div>

        {/* Proposals / Applicants Box */}
        <div
          className={`flex items-center sm:justify-end gap-1 text-xs font-semibold px-2.5 py-1 rounded-md border w-full justify-center ${
            (issue.applicationCount || 0) > 0
              ? "border-[hsl(var(--success)/0.4)] text-[hsl(var(--success))] bg-[hsl(var(--success)/0.06)]"
              : "border-transparent text-[hsl(var(--foreground-subtle))]"
          }`}
          title={`${issue.applicationCount || 0} ứng viên đã nộp proposal`}
        >
          <span>{issue.applicationCount || 0}</span>
          <span className="text-[10px] font-normal">đơn ứng tuyển</span>
        </div>

        {/* Views Count */}
        <div className="text-[11px] text-[hsl(var(--foreground-subtle))] flex items-center gap-1">
          <span>{issue.viewCount}</span>
          <span>lượt xem</span>
        </div>
      </div>

      {/* -------------------------------------------------------------
          CENTER & RIGHT: Content, Tags, and Author Meta
          ------------------------------------------------------------- */}
      <div className="flex-1 flex flex-col justify-between space-y-3 min-w-0">
        {/* Title & Status */}
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            {getStatusBadge(issue.status)}
            <span className="text-[11px] font-mono text-[hsl(var(--foreground-subtle))]">
              #{issue.id.slice(-6)}
            </span>
            {issue.difficulty && (
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${getDifficultyColor(
                  issue.difficulty
                )}`}
              >
                {issue.difficulty}
              </span>
            )}
            {issue.timeEstimate && (
              <span className="text-[11px] text-[hsl(var(--foreground-subtle))]">
                ⏱️ {issue.timeEstimate}
              </span>
            )}
          </div>

          <Link
            href={`/issues/${issue.id}`}
            className="block group-hover:text-[hsl(var(--primary))] transition-colors"
          >
            <h3 className="text-base font-bold text-[hsl(var(--foreground))] leading-snug hover:underline decoration-[hsl(var(--primary))]">
              {issue.title}
            </h3>
          </Link>

          {/* Description snippet */}
          <p className="mt-1 text-xs text-[hsl(var(--foreground-muted))] line-clamp-2 leading-relaxed">
            {issue.description}
          </p>
        </div>

        {/* Tags Row (StackOverflow styled skill pills) */}
        <div className="flex items-center justify-between gap-4 flex-wrap pt-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {issue.requiredSkills.map((skill) => (
              <button
                key={skill}
                type="button"
                onClick={() => onSkillClick?.(skill)}
                className="hover:scale-105 transition-transform focus:outline-none"
              >
                <Badge variant="tag">{skill}</Badge>
              </button>
            ))}
          </div>

          {/* Author info (StackOverflow question author block) */}
          <div className="flex items-center gap-2 text-xs ml-auto shrink-0 bg-[hsl(var(--background-secondary)/0.5)] px-2.5 py-1.5 rounded-lg border border-[hsl(var(--border)/0.4)]">
            <div className="h-6 w-6 rounded-full bg-gradient-to-tr from-[hsl(var(--primary))] to-[hsl(var(--accent))] flex items-center justify-center text-[10px] font-bold text-white overflow-hidden">
              {issue.client.avatar ? (
                <img
                  src={issue.client.avatar}
                  alt={issue.client.name || "Client"}
                  className="h-full w-full object-cover"
                />
              ) : (
                (issue.client.name?.[0] || "C").toUpperCase()
              )}
            </div>

            <div className="text-[11px]">
              <div className="flex items-center gap-1.5 font-medium text-[hsl(var(--foreground))]">
                <span>{issue.client.name || shortenAddress(issue.client.walletAddress)}</span>
                {issue.client.isGithubVerified && (
                  <span
                    className="text-[hsl(var(--success))]"
                    title="Đã xác thực GitHub"
                  >
                    ✓
                  </span>
                )}
                <span className="text-[hsl(var(--warning))] font-bold text-[10px]">
                  ⭐ {issue.client.reputationScore}
                </span>
              </div>
              <div className="text-[10px] text-[hsl(var(--foreground-subtle))]">
                đăng {formatTimeAgo(issue.createdAt)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
