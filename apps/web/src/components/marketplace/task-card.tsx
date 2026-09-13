import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, CalendarClock, Eye, MessageSquare, ShieldCheck } from "lucide-react";
import type { IssueItem } from "./issue-card";

const CATEGORY_LABELS: Record<string, string> = {
  BUG_FIX: "Bug fix",
  FEATURE: "Feature",
  SMART_CONTRACT: "Smart contract",
  AUDIT: "Security & audit",
  UI_UX: "Frontend & design",
  DATA_SCIENCE: "AI & data",
  DEVOPS: "DevOps",
  DOCUMENTATION: "Documentation",
  OTHER: "Other",
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  DISPUTED: "Disputed",
  CANCELLED: "Cancelled",
};

function relativeTime(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "Recently posted";
  const hours = Math.max(0, Math.floor((Date.now() - time) / 3_600_000));
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function TaskCard({ issue }: { issue: IssueItem }) {
  const deadline = issue.expiresAt ? new Date(issue.expiresAt) : null;
  const isOpen = issue.status === "OPEN";

  return (
    <article
      className="group flex min-h-[275px] flex-col rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[hsl(var(--primary)/0.5)] hover:shadow-[var(--shadow-glow)]"
      data-testid={`task-card-${issue.id}`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="rounded-full border border-[hsl(var(--accent)/0.25)] bg-[hsl(var(--accent)/0.1)] px-2.5 py-1 text-[11px] font-semibold text-[hsl(var(--accent))]">
          {CATEGORY_LABELS[issue.category] ?? issue.category.replaceAll("_", " ")}
        </span>
        <span className={`flex items-center gap-1.5 text-[11px] font-medium ${isOpen ? "text-[hsl(var(--success))]" : "text-[hsl(var(--foreground-muted))]"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${isOpen ? "bg-[hsl(var(--success))]" : "bg-[hsl(var(--foreground-subtle))]"}`} />
          {STATUS_LABELS[issue.status] ?? issue.status}
        </span>
      </div>

      <Link href={`/issues/${issue.id}`} className="group/title">
        <h2 className="font-outfit text-lg font-bold leading-snug text-[hsl(var(--foreground))] transition-colors group-hover/title:text-[hsl(var(--primary))]">
          {issue.title}
        </h2>
      </Link>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-[hsl(var(--foreground-muted))]">
        {issue.description.replace(/[#*_`>\[\]]/g, " ").trim()}
      </p>

      <div className="mt-4 flex min-h-6 flex-wrap gap-1.5">
        {issue.requiredSkills.slice(0, 4).map((skill) => (
          <span key={skill} className="rounded-md bg-[hsl(var(--background-secondary))] px-2 py-1 text-[10px] text-[hsl(var(--foreground-muted))]">
            {skill}
          </span>
        ))}
        {issue.requiredSkills.length > 4 && <span className="px-1 py-1 text-[10px] text-[hsl(var(--foreground-subtle))]">+{issue.requiredSkills.length - 4}</span>}
      </div>

      <div className="mt-auto pt-5">
        <div className="flex items-end justify-between border-b border-[hsl(var(--border))] pb-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--foreground-subtle))]">Bounty</p>
            <p className="mt-0.5 font-outfit text-2xl font-extrabold text-[hsl(var(--success))]">
              {issue.bountyAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })}
              <span className="ml-1.5 text-xs font-bold uppercase">{issue.token.symbol}</span>
            </p>
          </div>
          <Link href={`/issues/${issue.id}`} aria-label={`View ${issue.title}`} className="rounded-full border border-[hsl(var(--border))] p-2 text-[hsl(var(--foreground-muted))] transition-colors hover:border-[hsl(var(--primary)/0.5)] hover:text-[hsl(var(--primary))]">
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="flex items-center justify-between gap-2 pt-3 text-[11px] text-[hsl(var(--foreground-subtle))]">
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[hsl(var(--secondary))] font-semibold text-[hsl(var(--foreground))]">
              {issue.client.avatar ? <Image src={issue.client.avatar} alt="" width={28} height={28} unoptimized className="h-full w-full object-cover" /> : (issue.client.name?.[0] ?? issue.client.walletAddress.slice(2, 4)).toUpperCase()}
            </span>
            <span className="max-w-[112px] truncate text-[hsl(var(--foreground-muted))]">{issue.client.name || `${issue.client.walletAddress.slice(0, 6)}…${issue.client.walletAddress.slice(-4)}`}</span>
            {issue.client.isGithubVerified && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--accent))]" aria-label="GitHub verified" />}
          </span>
          <span className="flex shrink-0 items-center gap-3">
            <span title="Applicants" className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" />{issue.applicationCount ?? 0}</span>
            <span title="Views" className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{issue.viewCount}</span>
            {deadline && !Number.isNaN(deadline.getTime()) && <span title="Deadline" className="hidden xl:inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{deadline.toLocaleDateString()}</span>}
            <span>{relativeTime(issue.createdAt)}</span>
          </span>
        </div>
      </div>
    </article>
  );
}
