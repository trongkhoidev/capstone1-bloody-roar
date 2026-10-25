// apps/web/src/components/marketplace/marketplace-view.tsx
// Trâm (UI/UX Designer & Test Engineer) — Full StackOverflow-Inspired Marketplace Page

"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Navbar } from "../layout/navbar";
import { LeftSidebar } from "../layout/left-sidebar";
import { IssueCard, IssueItem } from "./issue-card";
import {
  MarketplaceFilterBar,
  FilterState,
  SortOption,
} from "./filter-bar";
import { MarketplaceRightRail } from "./right-rail";
import { MarketplaceSkeleton } from "./marketplace-skeleton";
import { MarketplaceEmpty } from "./marketplace-empty";
import { MOCK_ISSUES } from "./mock-issues";

const ISSUES_QUERY = `
  query GetIssues($category: IssueCategory, $search: String, $sortBy: IssueSortBy) {
    issues(first: 20, category: $category, search: $search, sortBy: $sortBy) {
      edges {
        node {
          id
          title
          description
          category
          status
          bountyAmount
          requiredSkills
          difficulty
          timeEstimate
          viewCount
          createdAt
          token {
            symbol
            name
          }
          client {
            id
            name
            avatar
            walletAddress
            reputationScore
            isGithubVerified
          }
        }
      }
    }
  }
`;

export function MarketplaceView() {
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    category: "",
    sortBy: "NEWEST",
    selectedSkill: undefined,
  });

  const [issues, setIssues] = useState<IssueItem[]>(MOCK_ISSUES);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch from GraphQL if available
  useEffect(() => {
    let isMounted = true;
    async function fetchIssues() {
      try {
        setIsLoading(true);
        const res = await fetch("/api/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: ISSUES_QUERY,
            variables: {
              category: filters.category || undefined,
              search: filters.search || undefined,
              sortBy:
                filters.sortBy === "HIGHEST_BOUNTY"
                  ? "BOUNTY_AMOUNT"
                  : filters.sortBy === "MOST_VIEWED"
                  ? "VIEW_COUNT"
                  : "CREATED_AT",
            },
          }),
        });

        if (res.ok) {
          const json = await res.json();
          const edges = json.data?.issues?.edges;
          if (edges && edges.length > 0 && isMounted) {
            const fetchedList: IssueItem[] = edges.map((e: any) => ({
              ...e.node,
              applicationCount: e.node.applicationCount || 0,
            }));
            setIssues(fetchedList);
            return;
          }
        }
      } catch (err) {
        // Fallback to client mock data
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchIssues();
    return () => {
      isMounted = false;
    };
  }, [filters.category, filters.sortBy]);

  // Client-side filtering & sorting for instant response and mock fallback
  const filteredIssues = useMemo(() => {
    let result = [...issues];

    // Filter by search
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.requiredSkills.some((s) => s.toLowerCase().includes(q))
      );
    }

    // Filter by category
    if (filters.category) {
      result = result.filter((item) => item.category === filters.category);
    }

    // Filter by selected skill
    if (filters.selectedSkill) {
      result = result.filter((item) =>
        item.requiredSkills.includes(filters.selectedSkill!)
      );
    }

    // Sort
    result.sort((a, b) => {
      if (filters.sortBy === "HIGHEST_BOUNTY") {
        return b.bountyAmount - a.bountyAmount;
      }
      if (filters.sortBy === "MOST_VIEWED") {
        return b.viewCount - a.viewCount;
      }
      // Default: NEWEST
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return result;
  }, [issues, filters]);

  const handleFilterChange = (newFilters: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const handleResetFilters = () => {
    setFilters({
      search: "",
      category: "",
      sortBy: "NEWEST",
      selectedSkill: undefined,
    });
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] flex flex-col">
      {/* Top Navbar */}
      <Navbar
        searchValue={filters.search}
        onSearch={(search) => handleFilterChange({ search })}
      />

      {/* Main App Shell Layout: Left Sidebar + Center Feed + Right Rail */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 flex">
        {/* Left Sidebar (StackOverflow navigation rail) */}
        <LeftSidebar />

        {/* Center Main Content Area */}
        <main className="flex-1 min-w-0 py-6 md:px-6 border-r border-[hsl(var(--border))]">
          <MarketplaceFilterBar
            filters={filters}
            totalCount={filteredIssues.length}
            onFilterChange={handleFilterChange}
          />

          {isLoading ? (
            <MarketplaceSkeleton />
          ) : filteredIssues.length > 0 ? (
            <div className="space-y-3.5" data-testid="issues-list">
              {filteredIssues.map((issue) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  onSkillClick={(skill) =>
                    handleFilterChange({ selectedSkill: skill })
                  }
                />
              ))}
            </div>
          ) : (
            <MarketplaceEmpty onResetFilters={handleResetFilters} />
          )}
        </main>

        {/* Right Sidebar (StackOverflow widget rail) */}
        <div className="py-6 pl-6 hidden lg:block">
          <MarketplaceRightRail
            onTagClick={(tag) => handleFilterChange({ selectedSkill: tag })}
          />
        </div>
      </div>
    </div>
  );
}
