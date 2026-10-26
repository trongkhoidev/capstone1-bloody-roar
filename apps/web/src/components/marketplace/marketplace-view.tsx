"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { graphqlRequest } from "@/lib/graphql-client";
import { MarketplaceFilterBar, type FilterState } from "./filter-bar";
import { MOCK_ISSUES } from "./mock-issues";
import { IssueCard } from "./issue-card";
import { TaskSkeleton } from "./task-skeleton";
import { MarketplaceEmpty } from "./marketplace-empty";
import type { IssueItem } from "./issue-card";
import { useAuthStore } from "@/lib/store/use-auth-store";
import { useUiPreferences } from "@/lib/ui-preferences";
import { LeftSidebar } from "@/components/layout/left-sidebar";

const PAGE_SIZE = 12;

const ISSUES_QUERY = `
  query MarketplaceIssues(
    $first: Int!, $after: String, $category: IssueCategory, $status: IssueStatus,
    $bountyMin: Float, $bountyMax: Float, $skill: String, $search: String, $sortBy: IssueSortBy
  ) {
    issues(first: $first, after: $after, category: $category, status: $status,
      bountyMin: $bountyMin, bountyMax: $bountyMax, skill: $skill, search: $search,
      sortBy: $sortBy, sortOrder: DESC) {
      edges { cursor node {
        id title description category status bountyAmount requiredSkills difficulty
        timeEstimate expiresAt viewCount applicationCount createdAt
        token { symbol name logoUrl }
        attachments { id fileName fileUrl fileMime }
        client { id name avatar walletAddress reputationScore isGithubVerified }
      } }
      pageInfo { hasNextPage endCursor }
      totalCount
    }
  }
`;

const STATS_QUERY = `
  query MarketplaceStats {
    marketplaceStats { openBounties bountyPool { symbol amount } activeHunters }
  }
`;

type IssuesResponse = {
  issues: {
    edges: Array<{ cursor: string; node: IssueItem }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    totalCount: number;
  };
};

type StatsResponse = {
  marketplaceStats: { openBounties: number; bountyPool: Array<{ symbol: string; amount: number }>; activeHunters: number };
};

type DataSource = "loading" | "live" | "demo";

function localFilter(issues: IssueItem[], filters: FilterState) {
  const term = filters.search.trim().toLowerCase();
  return issues
    .filter((issue) => !filters.category || issue.category === filters.category)
    .filter((issue) => !filters.status || issue.status === filters.status)
    .filter((issue) => filters.bountyMin == null || issue.bountyAmount >= filters.bountyMin)
    .filter((issue) => filters.bountyMax == null || issue.bountyAmount <= filters.bountyMax)
    .filter((issue) => !filters.selectedSkill || issue.requiredSkills.some((skill) => skill.toLowerCase() === filters.selectedSkill?.toLowerCase()))
    .filter((issue) => !term || [issue.title, issue.description, ...issue.requiredSkills].some((value) => value.toLowerCase().includes(term)))
    .sort((a, b) => {
      if (filters.sortBy === "HIGHEST_BOUNTY") return b.bountyAmount - a.bountyAmount;
      if (filters.sortBy === "MOST_VIEWED") return b.viewCount - a.viewCount;
      if (filters.sortBy === "DEADLINE") {
        const aTime = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY;
        const bTime = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.POSITIVE_INFINITY;
        return aTime - bTime;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}

export function MarketplaceView({ initialSearch = "" }: { initialSearch?: string }) {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === "ADMIN";
  const { theme } = useUiPreferences();
  
  const [filters, setFilters] = useState<FilterState>({ search: initialSearch, category: "", status: "", sortBy: "NEWEST" });
  const [issues, setIssues] = useState<IssueItem[]>(MOCK_ISSUES);
  const [dataSource, setDataSource] = useState<DataSource>("loading");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(MOCK_ISSUES.length);
  const [stats, setStats] = useState({
    openBounties: MOCK_ISSUES.filter((issue) => issue.status === "OPEN").length,
    bountyPool: Object.entries(MOCK_ISSUES.reduce<Record<string, number>>((totals, issue) => {
      totals[issue.token.symbol] = (totals[issue.token.symbol] ?? 0) + issue.bountyAmount;
      return totals;
    }, {})).map(([symbol, amount]) => ({ symbol, amount })),
    activeHunters: new Set(MOCK_ISSUES.map((issue) => issue.client.id)).size,
  });
  const [requestError, setRequestError] = useState<string | null>(null);

  const variables = useMemo(() => ({
    first: PAGE_SIZE,
    category: filters.category || undefined,
    status: filters.status || undefined,
    bountyMin: filters.bountyMin,
    bountyMax: filters.bountyMax,
    skill: filters.selectedSkill,
    search: filters.search.trim() || undefined,
    sortBy: filters.sortBy === "HIGHEST_BOUNTY"
      ? "BOUNTY_AMOUNT"
      : filters.sortBy === "MOST_VIEWED"
        ? "VIEW_COUNT"
        : filters.sortBy === "DEADLINE"
          ? "DEADLINE"
          : "CREATED_AT",
  }), [filters]);

  const fetchPage = useCallback(async (after: string | null, append: boolean, signal?: AbortSignal) => {
    if (append) setIsLoadingMore(true);
    else {
      setIsLoading(true);
      setRequestError(null);
    }

    try {
      const result = await graphqlRequest<IssuesResponse>(ISSUES_QUERY, { ...variables, after }, signal);
      const page = result.issues;
      const rows = page.edges.map(({ node }) => ({ ...node, applicationCount: node.applicationCount ?? 0 }));
      setIssues((previous) => append ? [...previous, ...rows] : rows);
      setTotalCount(page.totalCount);
      setHasNextPage(page.pageInfo.hasNextPage);
      setEndCursor(page.pageInfo.endCursor);
      setDataSource("live");
    } catch (error) {
      if (signal?.aborted) return;
      if (!append) {
        setIssues(MOCK_ISSUES);
        setTotalCount(MOCK_ISSUES.length);
        setHasNextPage(false);
        setEndCursor(null);
        setDataSource("demo");
      }
      setRequestError(error instanceof Error ? error.message : "Không thể tải bài toán.");
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, [variables]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void fetchPage(null, false, controller.signal), filters.search ? 250 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fetchPage, filters.search]);

  useEffect(() => {
    if (!isAdmin) return;
    const controller = new AbortController();
    void graphqlRequest<StatsResponse>(STATS_QUERY, {}, controller.signal)
      .then((result) => setStats(result.marketplaceStats))
      .catch(() => undefined);
    return () => controller.abort();
  }, [isAdmin]);

  const filteredIssues = useMemo(() => localFilter(issues, filters), [issues, filters]);

  const handleFilterChange = (next: Partial<FilterState>) => {
    setFilters((current) => ({ ...current, ...next }));
  };
  const resetFilters = () => setFilters({ search: "", category: "", status: "", sortBy: "NEWEST" });

  return (
    <div className={`br min-h-screen ${theme === "dark" ? "dark" : ""}`}>
      <div className="wrap">
        <LeftSidebar />

        <main id="tasks" className="content">
          <div className="cols">
            {/* Left Column: Bounties List */}
            <div className="min-w-0">
              <div className="ph mb-4">
                <div>
                  <h1 className="h1">All bounties</h1>
                  <p className="sub text-xs sm:text-sm">
                    <span className="mono font-semibold">{dataSource !== "live" ? filteredIssues.length : totalCount}</span> open ·{" "}
                    <span className="mono font-semibold text-[var(--gold)]">
                      {stats.bountyPool.length ? stats.bountyPool.map((pool) => `${pool.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${pool.symbol}`).join(" · ") : "184,320 USDC"}
                    </span>{" "}
                    locked in escrow
                  </p>
                </div>
                <Link href="/issues/create" className="btn btn-p hidden sm:inline-flex">
                  Post a bounty
                </Link>
              </div>

              <MarketplaceFilterBar
                filters={filters}
                totalCount={dataSource !== "live" ? filteredIssues.length : totalCount}
                onFilterChange={handleFilterChange}
              />

              {isLoading && dataSource === "loading" && (
                <p role="status" className="my-3 text-xs text-[var(--ink-3)]">
                  Loading live listings from Base Sepolia...
                </p>
              )}

              {requestError && dataSource === "demo" && (
                <p role="status" className="my-3 rounded-lg border border-[var(--warn)] bg-[var(--warn-bg)] px-3 py-2 text-xs text-[var(--warn)]">
                  Đang dùng dữ liệu demo vì API chưa kết nối được. {requestError}
                </p>
              )}

              <div className="list mt-4" data-testid="issues-list">
                {isLoading && !filteredIssues.length ? (
                  Array.from({ length: 6 }, (_, index) => <TaskSkeleton key={index} />)
                ) : filteredIssues.length ? (
                  filteredIssues.map((issue) => (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      onSkillClick={(selectedSkill) => handleFilterChange({ selectedSkill })}
                    />
                  ))
                ) : (
                  <MarketplaceEmpty onResetFilters={resetFilters} />
                )}
              </div>

              {hasNextPage && dataSource === "live" && (
                <div className="mt-6 flex justify-center">
                  <button
                    type="button"
                    className="btn btn-o"
                    onClick={() => endCursor && void fetchPage(endCursor, true)}
                    disabled={isLoadingMore}
                  >
                    {isLoadingMore ? "Loading…" : "Load more bounties"}
                  </button>
                </div>
              )}
            </div>

            {/* Right Column: 300px Sidebar */}
            <aside className="hidden lg:flex flex-col gap-4">
              <div className="panel">
                <div className="panel-h">
                  <span>Bounty stats</span>
                  <span className="mono text-xs text-[var(--ok)]">Base Sepolia</span>
                </div>
                <div className="panel-b">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[var(--ink-2)]">Open Bounties</span>
                    <span className="mono font-bold text-[var(--ink)]">{stats.openBounties}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[var(--ink-2)]">Active Hunters</span>
                    <span className="mono font-bold text-[var(--ink)]">{stats.activeHunters}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[var(--ink-2)]">Escrow Volume</span>
                    <span className="mono font-bold text-[var(--gold)]">
                      {stats.bountyPool.length ? stats.bountyPool.map((p) => `${p.amount} ${p.symbol}`).join(", ") : "184,320 USDC"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="panel">
                <div className="panel-h">Popular skills</div>
                <div className="panel-b flex flex-wrap gap-1.5">
                  {["solidity", "foundry", "react", "typescript", "audit", "nextjs", "security", "slither"].map((sk) => (
                    <button
                      key={sk}
                      type="button"
                      onClick={() => handleFilterChange({ selectedSkill: sk })}
                      className="tag cursor-pointer hover:brightness-95"
                    >
                      #{sk}
                    </button>
                  ))}
                </div>
              </div>

              <div className="panel note">
                <div className="panel-h text-[var(--gold)] font-bold">Escrow Guarantee</div>
                <div className="panel-b text-xs text-[var(--ink-2)] leading-relaxed">
                  Every bounty is locked on Base Sepolia. Payouts are verified by smart contract receipts. Full refunds pay 0% platform fee.
                </div>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}
