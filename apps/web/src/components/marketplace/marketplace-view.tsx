"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { graphqlRequest } from "@/lib/graphql-client";
import { MarketplaceFilterBar, type FilterState } from "./filter-bar";
import { MOCK_ISSUES } from "./mock-issues";
import { IssueCard } from "./issue-card";
import { TaskSkeleton } from "./task-skeleton";
import { MarketplaceEmpty } from "./marketplace-empty";
import type { IssueItem } from "./issue-card";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/store/use-auth-store";
import { useUiPreferences } from "@/lib/ui-preferences";

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
  const { t } = useUiPreferences();
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
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      {isAdmin && <section className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]" data-testid="admin-marketplace-summary">
        <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <h1 className="font-outfit text-3xl font-semibold tracking-tight">{t("marketplaceTitle")}</h1>
              <p className="mt-1 max-w-2xl text-sm text-[hsl(var(--foreground-muted))]">{t("marketplaceDescription")}</p>
            </div>
            <Button asChild><Link href="/issues/create">{t("createBounty")} <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
          </div>
          <dl className="mt-6 flex flex-wrap divide-x divide-[hsl(var(--border))] border-y border-[hsl(var(--border))] text-sm">
            <div className="min-w-[10rem] px-4 py-3 first:pl-0"><dt className="text-xs text-[hsl(var(--foreground-muted))]">{t("openBounties")}</dt><dd className="mt-0.5 font-semibold">{stats.openBounties.toLocaleString()}</dd></div>
            <div className="min-w-[13rem] px-4 py-3"><dt className="text-xs text-[hsl(var(--foreground-muted))]">{t("openBountyPool")}</dt><dd className="mt-0.5 font-semibold">{stats.bountyPool.length ? stats.bountyPool.map((pool) => `${pool.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${pool.symbol}`).join(" · ") : "—"}</dd></div>
            <div className="min-w-[10rem] px-4 py-3"><dt className="text-xs text-[hsl(var(--foreground-muted))]">{t("activeDevelopers")}</dt><dd className="mt-0.5 font-semibold">{stats.activeHunters.toLocaleString()}</dd></div>
            <div className="ml-auto px-0 py-3 text-xs text-[hsl(var(--foreground-muted))]">{t("networkNotice")}</div>
          </dl>
        </div>
      </section>}

      <main id="tasks" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-8 sm:px-6 lg:px-8">

        <MarketplaceFilterBar filters={filters} totalCount={dataSource !== "live" ? filteredIssues.length : totalCount} onFilterChange={handleFilterChange} />

        {isLoading && dataSource === "loading" && (
          <p role="status" className="mb-4 text-xs text-[hsl(var(--foreground-muted))]">
            Loading live listings. Showing sample tasks while the marketplace connects.
          </p>
        )}

        {requestError && dataSource === "demo" && (
          <p role="status" className="mb-4 rounded-lg border border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.08)] px-3 py-2 text-xs text-[hsl(var(--warning))]">
            Đang dùng dữ liệu demo vì API chưa kết nối được. {requestError}
          </p>
        )}

        {isLoading && !filteredIssues.length ? (
          <div className="space-y-0 overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]" aria-label="Loading bounty tasks">
            {Array.from({ length: 6 }, (_, index) => <TaskSkeleton key={index} />)}
          </div>
        ) : filteredIssues.length ? (
          <>
            <div className="overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]" data-testid="issues-list">
              {filteredIssues.map((issue) => <IssueCard key={issue.id} issue={issue} onSkillClick={(selectedSkill) => handleFilterChange({ selectedSkill })} />)}
            </div>
            {hasNextPage && dataSource === "live" && (
              <div className="mt-8 flex justify-center">
                <Button variant="outline" onClick={() => endCursor && void fetchPage(endCursor, true)} disabled={isLoadingMore}>
                  {isLoadingMore ? "Loading…" : "Load more tasks"}
                </Button>
              </div>
            )}
          </>
        ) : (
          <MarketplaceEmpty onResetFilters={resetFilters} />
        )}
      </main>
    </div>
  );
}
