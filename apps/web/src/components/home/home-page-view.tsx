"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { graphqlRequest } from "@/lib/graphql-client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/store/use-auth-store";
import { IssueCard, type IssueItem } from "@/components/marketplace/issue-card";
import { WolfLogo } from "@/components/ui/wolf-logo";
import { HomeBanner } from "./home-banner";
import { useUiPreferences } from "@/lib/ui-preferences";

const ISSUES_QUERY = `
  query HomeIssues($first: Int!) {
    issues(first: $first, sortBy: CREATED_AT, sortOrder: DESC) {
      edges { node {
        id title description category status bountyAmount { formatted } requiredSkills difficulty
        timeEstimate expiresAt viewCount applicationCount createdAt
        token { symbol name logoUrl }
        client { id name avatar walletAddress reputationScore isGithubVerified }
      } }
    }
  }
`;

const STATS_QUERY = `
  query HomeStats {
    marketplaceStats { openBounties bountyPool { symbol formatted } activeHunters }
  }
`;

type IssuesResponse = {
  issues: {
    edges: Array<{ node: Omit<IssueItem, "bountyAmount"> & { bountyAmount: { formatted: string } } }>;
  };
};

type StatsResponse = {
  marketplaceStats: {
    openBounties: number;
    bountyPool: Array<{ symbol: string; formatted: string }>;
    activeHunters: number;
  };
};

export function HomePageView() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);
  const { theme, t } = useUiPreferences();

  const [issues, setIssues] = useState<IssueItem[]>([]);
  const [openBountiesCount, setOpenBountiesCount] = useState<number | null>(null);
  const [escrowTotal, setEscrowTotal] = useState<string | null>(null);
  const [activeDevelopers, setActiveDevelopers] = useState<number | null>(null);

  useEffect(() => {
    if (status === "authenticated" && user?.role === "ADMIN") {
      router.replace("/admin");
    }
  }, [router, status, user?.role]);

  useEffect(() => {
    let active = true;
    queryClient.fetchQuery({ queryKey: ["home-issues"], queryFn: () => graphqlRequest<IssuesResponse>(ISSUES_QUERY, { first: 5 }) })
      .then((res) => {
        if (!active) return;
        const edges = res?.issues?.edges ?? [];
        setIssues(edges.map((e) => ({ ...e.node, bountyAmount: Number(e.node.bountyAmount.formatted) })));
      })
      .catch(() => {
        if (!active) return;
        setIssues([]);
      });

    queryClient.fetchQuery({ queryKey: ["marketplace-stats"], queryFn: () => graphqlRequest<StatsResponse>(STATS_QUERY) })
      .then((res) => {
        if (!active || !res?.marketplaceStats) return;
        const stats = res.marketplaceStats;
        setOpenBountiesCount(stats.openBounties ?? 0);
        setActiveDevelopers(stats.activeHunters ?? 0);
        const usdcPool = stats.bountyPool?.find((p) => p.symbol.toUpperCase() === "USDC");
        setEscrowTotal(usdcPool ? Number(usdcPool.formatted).toLocaleString() : "0");
      })
      .catch(() => {
        if (!active) return;
        setOpenBountiesCount(null);
        setActiveDevelopers(null);
        setEscrowTotal(null);
      });

    return () => {
      active = false;
    };
  }, [queryClient]);

  return (
    <div className={`br ${theme === "dark" ? "dark" : ""}`}>
      <HomeBanner stats={{ open: openBountiesCount, escrow: escrowTotal, developers: activeDevelopers }} />

      {/* Main Content Grid */}
      <div className="wrap">
        <main className="content" style={{ flexBasis: "100%" }}>
          <div className="cols">
            {/* Left Column: Top Bounties */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
              <h2 className="h1" style={{ fontSize: 22 }}>Latest bounties</h2>

              <div className="list">
                {issues.length > 0 ? (
                  issues.map((issue) => (
                    <IssueCard key={issue.id} issue={issue} />
                  ))
                ) : (
                  <p style={{ color: "var(--ink-3)", fontSize: 14, padding: "24px 18px" }}>{t("noIssuesYet")}</p>
                )}
              </div>

              <Link href="/marketplace" style={{ fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6, color: "var(--link)" }}>
                Browse all {openBountiesCount ?? "—"} bounties <ArrowRight style={{ width: 14, height: 14 }} />
              </Link>
            </div>

            {/* Right Column: Information Panels */}
            <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* How a bounty moves */}
              <section className="panel note">
                <div className="panel-h">How a bounty moves</div>
                <div className="panel-b">
                  <ol className="steps">
                    <li><b>Post.</b> Scope, acceptance criteria, reward and deadline. Posting is free.</li>
                    <li><b>Apply and select.</b> The client picks one developer and has 24 h to fund.</li>
                    <li><b>Fund.</b> USDC moves from the client&apos;s wallet into the contract.</li>
                    <li><b>Deliver and release.</b> The client releases, or the developer claims after a 7-day review timeout.</li>
                  </ol>
                </div>
              </section>

              <section className="panel">
                <div className="panel-h">Popular skills</div>
                <div className="panel-b flex flex-wrap gap-1.5">
                  {["solidity", "foundry", "react", "typescript", "audit", "nextjs", "security", "slither"].map((skill) => (
                    <Link key={skill} href={`/marketplace?skills=${encodeURIComponent(skill)}`} className="tag hover:brightness-95">
                      {skill}
                    </Link>
                  ))}
                </div>
              </section>

              <section className="panel">
                <div className="panel-h">Escrow guarantee</div>
                <div className="panel-b text-xs text-[var(--ink-2)] leading-relaxed">
                  Each reward is locked in the escrow contract before work starts. Payouts are checked against on-chain receipts, and a full refund pays no platform fee.
                </div>
              </section>
            </aside>
          </div>


        </main>
      </div>

      {/* Footer */}
      <footer className="foot">
        <div className="foot-in">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="logo" style={{ color: "var(--ink)" }}>
              <WolfLogo size={36} />
              <span className="font-bold tracking-tight text-lg">Bloody-Roar</span>
            </span>
            <span style={{ color: "var(--ink-3)" }}>Bounty marketplace with on-chain USDC escrow.</span>
          </div>
          <nav aria-label="Marketplace">
            <span className="lab">Marketplace</span>
            <Link href="/marketplace">Browse bounties</Link>
            <Link href="/issues/create">Post a bounty</Link>
          </nav>
          <nav aria-label="Escrow">
            <span className="lab">Escrow</span>
            <Link href="/guide">How it works</Link>
            <Link href="/guide#rules">Contract rules</Link>
            <Link href="/guide#disputes">Disputes and arbiter</Link>
          </nav>
          <nav aria-label="Project">
            <span className="lab">Project</span>
            <a href="https://github.com/hadv/capstone1" target="_blank" rel="noreferrer">GitHub</a>
            <Link href="/api/health">System Status</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
