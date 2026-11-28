"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { graphqlRequest } from "@/lib/graphql-client";
import { useQueryClient } from "@tanstack/react-query";
import { MarketplaceFilterBar, type FilterState } from "./filter-bar";
import { IssueCard } from "./issue-card";
import { TaskSkeleton } from "./task-skeleton";
import { MarketplaceEmpty } from "./marketplace-empty";
import type { IssueItem } from "./issue-card";
import { useUiPreferences } from "@/lib/ui-preferences";
import { LeftSidebar } from "@/components/layout/left-sidebar";

const PAGE_SIZES = [15, 30, 50] as const;

const ISSUES_QUERY = `
  query MarketplaceIssues(
    $first: Int!, $after: String, $category: IssueCategory, $status: IssueStatus,
    $bountyMin: String, $bountyMax: String, $skill: String, $search: String, $sortBy: IssueSortBy
  ) {
    issues(first: $first, after: $after, category: $category, status: $status,
      bountyMin: $bountyMin, bountyMax: $bountyMax, skill: $skill, search: $search,
      sortBy: $sortBy, sortOrder: DESC) {
      edges { cursor node {
        id title description category status bountyAmount { formatted } requiredSkills difficulty
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
    marketplaceStats { openBounties bountyPool { symbol formatted } activeHunters }
  }
`;

type IssuesResponse = {
  issues: {
    edges: Array<{ cursor: string; node: Omit<IssueItem, "bountyAmount"> & { bountyAmount: { formatted: string } } }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    totalCount: number;
  };
};

type StatsResponse = {
  marketplaceStats: { openBounties: number; bountyPool: Array<{ symbol: string; formatted: string }>; activeHunters: number };
};

type DataSource = "loading" | "live";

function localFilter(issues: IssueItem[], filters: FilterState) {
  const words = filters.search.toLowerCase().split(/\s+/).filter(Boolean);
  return issues
    .filter((issue) => !filters.category || issue.category === filters.category)
    .filter((issue) => !filters.status || issue.status === filters.status)
    .filter((issue) => filters.bountyMin == null || issue.bountyAmount >= filters.bountyMin)
    .filter((issue) => filters.bountyMax == null || issue.bountyAmount <= filters.bountyMax)
    .filter((issue) => !filters.selectedSkill || issue.requiredSkills.some((skill) => skill.toLowerCase() === filters.selectedSkill?.toLowerCase()))
    .filter((issue) => words.every((word) => [issue.title, issue.description, ...issue.requiredSkills].some((value) => value.toLowerCase().includes(word))))
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

export function MarketplaceView({ initialSearch = "", initialSkill }: { initialSearch?: string; initialSkill?: string | undefined }) {
  const queryClient = useQueryClient();
  const { theme } = useUiPreferences();
  
  const [filters, setFilters] = useState<FilterState>({ search: initialSearch, selectedSkill: initialSkill, category: "", status: "", sortBy: "NEWEST" });
  const [issues, setIssues] = useState<IssueItem[]>([]);
  const [dataSource, setDataSource] = useState<DataSource>("loading");
  const [isLoading, setIsLoading] = useState(true);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [endCursor, setEndCursor] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const [page, setPage] = useState(0);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<StatsResponse["marketplaceStats"] | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  const variables = useMemo(() => ({
    first: pageSize,
    category: filters.category || undefined,
    status: filters.status || undefined,
    bountyMin: filters.bountyMin != null ? String(filters.bountyMin) : undefined,
    bountyMax: filters.bountyMax != null ? String(filters.bountyMax) : undefined,
    skill: filters.selectedSkill,
    search: filters.search.trim() || undefined,
    sortBy: filters.sortBy === "HIGHEST_BOUNTY"
      ? "BOUNTY_AMOUNT"
      : filters.sortBy === "MOST_VIEWED"
        ? "VIEW_COUNT"
        : filters.sortBy === "DEADLINE"
          ? "DEADLINE"
          : "CREATED_AT",
  }), [filters, pageSize]);

  const fetchPage = useCallback(async (after: string | null, signal?: AbortSignal) => {
    setIsLoading(true);
    setRequestError(null);

    try {
      const result = await queryClient.fetchQuery({ queryKey: ["marketplace-issues", variables, after], queryFn: ({ signal: querySignal }) => graphqlRequest<IssuesResponse>(ISSUES_QUERY, { ...variables, after }, querySignal) });
      if (signal?.aborted) return;
      const page = result.issues;
      const rows = page.edges.map(({ node }) => ({ ...node, bountyAmount: Number(node.bountyAmount.formatted), applicationCount: node.applicationCount ?? 0 }));
      setIssues(rows);
      setTotalCount(page.totalCount);
      setHasNextPage(page.pageInfo.hasNextPage);
      setEndCursor(page.pageInfo.endCursor);
      setDataSource("live");
    } catch (error) {
      if (signal?.aborted) return;
      setIssues([]);
      setTotalCount(0);
      setHasNextPage(false);
      setEndCursor(null);
      setRequestError(error instanceof Error ? error.message : "Could not load bounties.");
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [variables, queryClient]);

  useEffect(() => {
    const controller = new AbortController();
    setPage(0);
    setCursors([null]);
    const timer = window.setTimeout(() => void fetchPage(null, controller.signal), filters.search ? 250 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fetchPage, filters.search]);

  useEffect(() => {
    const controller = new AbortController();
    void queryClient.fetchQuery({ queryKey: ["marketplace-stats"], queryFn: ({ signal }) => graphqlRequest<StatsResponse>(STATS_QUERY, {}, signal) })
      .then((result) => { if (!controller.signal.aborted) setStats(result.marketplaceStats); })
      .catch(() => { if (!controller.signal.aborted) setStats(null); });
    return () => controller.abort();
  }, [queryClient]);

  const filteredIssues = useMemo(() => localFilter(issues, filters), [issues, filters]);

  const handleFilterChange = (next: Partial<FilterState>) => {
    setFilters((current) => ({ ...current, ...next }));
  };
  const goToPage = (next: number) => {
    const after = next > page ? endCursor : cursors[next] ?? null;
    if (next > page && !endCursor) return;
    if (next > page) setCursors([...cursors.slice(0, next), endCursor]);
    setPage(next);
    void fetchPage(after);
    document.getElementById("tasks")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const firstShown = issues.length ? page * pageSize + 1 : 0;
  const lastShown = page * pageSize + issues.length;
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
                    <span className="mono font-semibold">{totalCount}</span> open ·{" "}
                    <span className="mono font-semibold text-[var(--gold)]">
                      {stats && stats.bountyPool.length ? stats.bountyPool.map((pool) => `${Number(pool.formatted).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${pool.symbol}`).join(" · ") : "—"}
                    </span>{" "}
                    locked in escrow
                  </p>
                </div>
              </div>

              <MarketplaceFilterBar
                filters={filters}
                totalCount={totalCount}
                onFilterChange={handleFilterChange}
              />

              {isLoading && dataSource === "loading" && (
                <p role="status" className="my-3 text-xs text-[var(--ink-3)]">
                  Loading bounties...
                </p>
              )}

              {requestError && (
                <div role="status" className="my-3 flex items-center justify-between gap-3 rounded-lg border border-[var(--warn)] bg-[var(--warn-bg)] px-3 py-2 text-xs text-[var(--warn)]">
                  <span>{requestError}</span>
                  <button
                    type="button"
                    onClick={() => void fetchPage(cursors[page] ?? null)}
                    className="btn btn-sm btn-o"
                  >
                    Try again
                  </button>
                </div>
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

              {totalCount > 0 && (
                <nav className="pager" aria-label="Bounty pages">
                  <span className="pager-info">
                    Showing <span className="mono">{firstShown}–{lastShown}</span> of <span className="mono">{totalCount}</span> bounties
                  </span>
                  <div className="pages">
                    <button type="button" onClick={() => goToPage(page - 1)} disabled={page === 0 || isLoading} data-testid="page-prev">
                      Prev
                    </button>
                    <span className="mono" aria-current="page">{page + 1} / {totalPages}</span>
                    <button type="button" onClick={() => goToPage(page + 1)} disabled={!hasNextPage || isLoading} data-testid="page-next">
                      Next
                    </button>
                  </div>
                  <div className="pager-size">
                    <span>Per page</span>
                    <div className="seg" role="group" aria-label="Bounties per page">
                      {PAGE_SIZES.map((size) => (
                        <button key={size} type="button" className={`mono ${size === pageSize ? "on" : ""}`} aria-pressed={size === pageSize} onClick={() => setPageSize(size)}>
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                </nav>
              )}
            </div>

            {/* Right Column: 300px Sidebar */}
            <aside className="hidden lg:flex flex-col gap-4">
              <div className="panel">
                <div className="panel-h">
                  <span>Bounty stats</span>
                </div>
                <div className="panel-b">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[var(--ink-2)]">Open bounties</span>
                    <span className="mono font-bold text-[var(--ink)]">{stats ? stats.openBounties : "—"}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[var(--ink-2)]">Active developers</span>
                    <span className="mono font-bold text-[var(--ink)]">{stats ? stats.activeHunters : "—"}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[var(--ink-2)]">Locked in escrow</span>
                    <span className="mono font-bold text-[var(--gold)]">
                      {stats && stats.bountyPool.length ? stats.bountyPool.map((p) => `${p.formatted} ${p.symbol}`).join(", ") : "—"}
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
                <div className="panel-h text-[var(--gold)] font-bold">Escrow guarantee</div>
                <div className="panel-b text-xs text-[var(--ink-2)] leading-relaxed">
                  Each reward is locked in escrow. Payouts are checked against smart contract receipts. A full refund pays no platform fee.
                </div>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}
