"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, ArrowRight } from "lucide-react";
import { graphqlRequest } from "@/lib/graphql-client";
import { useAuthStore } from "@/lib/store/use-auth-store";
import { MOCK_ISSUES } from "@/components/marketplace/mock-issues";
import { IssueCard, type IssueItem } from "@/components/marketplace/issue-card";
import { WolfLogo } from "@/components/ui/wolf-logo";
import { useUiPreferences } from "@/lib/ui-preferences";

const ISSUES_QUERY = `
  query HomeIssues($first: Int!) {
    issues(first: $first, sortBy: NEWEST, sortOrder: DESC) {
      edges { node {
        id title description category status bountyAmount requiredSkills difficulty
        timeEstimate expiresAt viewCount applicationCount createdAt
        token { symbol name logoUrl }
        client { id name avatar walletAddress reputationScore isGithubVerified }
      } }
      totalCount
    }
  }
`;

const STATS_QUERY = `
  query HomeStats {
    marketplaceStats { openBounties bountyPool { symbol amount } activeHunters }
  }
`;

type IssuesResponse = {
  issues: {
    edges: Array<{ node: IssueItem }>;
    totalCount: number;
  };
};

type StatsResponse = {
  marketplaceStats: {
    openBounties: number;
    bountyPool: Array<{ symbol: string; amount: number }>;
    activeHunters: number;
  };
};

export function HomePageView({ search = "" }: { search?: string }) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);
  const { theme } = useUiPreferences();

  const [searchTerm, setSearchTerm] = useState(search);
  const [activeSort, setActiveSort] = useState<"HOT" | "CLOSING" | "HIGHEST" | "NEWEST">("HOT");
  const [issues, setIssues] = useState<IssueItem[]>(MOCK_ISSUES);
  const [openBountiesCount, setOpenBountiesCount] = useState<number>(MOCK_ISSUES.length);
  const [escrowTotal, setEscrowTotal] = useState<string>("184,320");
  const [activeDevelopers, setActiveDevelopers] = useState<number>(1942);

  useEffect(() => {
    if (status === "authenticated" && user?.role === "ADMIN") {
      router.replace("/admin");
    }
  }, [router, status, user?.role]);

  useEffect(() => {
    let active = true;
    graphqlRequest<IssuesResponse>(ISSUES_QUERY, { first: 6 })
      .then((res) => {
        if (!active || !res?.issues?.edges?.length) return;
        setIssues(res.issues.edges.map((e) => e.node));
        setOpenBountiesCount(res.issues.totalCount);
      })
      .catch(() => {
        // Fallback to MOCK_ISSUES
      });

    graphqlRequest<StatsResponse>(STATS_QUERY)
      .then((res) => {
        if (!active || !res?.marketplaceStats) return;
        const stats = res.marketplaceStats;
        if (stats.openBounties) setOpenBountiesCount(stats.openBounties);
        if (stats.activeHunters) setActiveDevelopers(stats.activeHunters);
        const usdcPool = stats.bountyPool.find((p) => p.symbol.toUpperCase() === "USDC");
        if (usdcPool) setEscrowTotal(usdcPool.amount.toLocaleString());
      })
      .catch(() => {
        // Keep default
      });

    return () => {
      active = false;
    };
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      router.push(`/marketplace?search=${encodeURIComponent(searchTerm.trim())}`);
    } else {
      router.push("/marketplace");
    }
  };

  const sortedIssues = [...issues].sort((a, b) => {
    if (activeSort === "HIGHEST") return b.bountyAmount - a.bountyAmount;
    if (activeSort === "CLOSING") {
      const aTime = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY;
      const bTime = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.POSITIVE_INFINITY;
      return aTime - bTime;
    }
    if (activeSort === "HOT") return b.viewCount - a.viewCount;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className={`br ${theme === "dark" ? "dark" : ""}`}>
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-in">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 mb-4 rounded-full border border-[var(--line-2)] bg-[var(--surface)] shadow-xs">
              <WolfLogo size={20} />
              <span className="text-xs font-semibold tracking-wide uppercase text-[var(--brand)]">Bloody-Roar Network</span>
              <span className="text-xs text-[var(--ink-3)]">· Base Sepolia Escrow</span>
            </div>
            <h1 className="display">Get paid in USDC for fixing real issues.</h1>
            <p className="lead">
              Clients post GitHub issues with a reward. Developers apply, deliver a pull request, and get paid by an escrow contract that neither side, nor the platform, can touch.
            </p>
            <form className="bigsearch" role="search" onSubmit={handleSearchSubmit}>
              <div className="search">
                <label className="sr" htmlFor="q-home">Search bounties</label>
                <Search className="ico" />
                <input
                  id="q-home"
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Try “reentrancy”, “playwright” or a repo name"
                />
              </div>
              <button type="submit" className="btn btn-p">Search</button>
            </form>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 14, fontSize: "12.5px", color: "var(--ink-3)" }}>
              <span>Popular</span>
              {["solidity", "typescript", "react", "foundry", "rust", "playwright"].map((skill) => (
                <Link key={skill} className="tag" href={`/marketplace?skills=${skill}`}>
                  {skill}
                </Link>
              ))}
            </div>
          </div>

          <div className="figs" aria-label="Marketplace numbers">
            <div className="fig">
              <div className="lab">Open bounties</div>
              <div className="v mono">{openBountiesCount}</div>
              <div className="d">across 9 categories</div>
            </div>
            <div className="fig">
              <div className="lab">Locked in escrow</div>
              <div className="v mono" style={{ color: "var(--gold)" }}>{escrowTotal}</div>
              <div className="d">USDC, confirmed on-chain</div>
            </div>
            <div className="fig">
              <div className="lab">Active developers</div>
              <div className="v mono">{activeDevelopers.toLocaleString()}</div>
              <div className="d">applied in the last 30 days</div>
            </div>
            <div className="fig">
              <div className="lab">Paid out</div>
              <div className="v mono" style={{ color: "var(--gold)" }}>612,080</div>
              <div className="d">USDC since launch</div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Grid */}
      <div className="wrap">
        <main className="content" style={{ flexBasis: "100%" }}>
          <div className="cols">
            {/* Left Column: Top Bounties */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
              <div className="ph" style={{ alignItems: "center" }}>
                <h2 className="h1" style={{ fontSize: 22 }}>Top bounties</h2>
                <div className="seg" role="group" aria-label="Sort">
                  <button
                    type="button"
                    className={activeSort === "HOT" ? "on" : ""}
                    onClick={() => setActiveSort("HOT")}
                  >
                    Hot
                  </button>
                  <button
                    type="button"
                    className={activeSort === "CLOSING" ? "on" : ""}
                    onClick={() => setActiveSort("CLOSING")}
                  >
                    Closing soon
                  </button>
                  <button
                    type="button"
                    className={activeSort === "HIGHEST" ? "on" : ""}
                    onClick={() => setActiveSort("HIGHEST")}
                  >
                    Highest reward
                  </button>
                  <button
                    type="button"
                    className={activeSort === "NEWEST" ? "on" : ""}
                    onClick={() => setActiveSort("NEWEST")}
                  >
                    Newest
                  </button>
                </div>
              </div>

              <div className="list">
                {sortedIssues.slice(0, 5).map((issue) => (
                  <IssueCard key={issue.id} issue={issue} />
                ))}
              </div>

              <Link href="/marketplace" style={{ fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6, color: "var(--link)" }}>
                Browse all {openBountiesCount} bounties <ArrowRight style={{ width: 14, height: 14 }} />
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

              {/* Recent payouts */}
              <section className="panel">
                <div className="panel-h">Recent payouts</div>
                <div className="panel-b">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span>
                      <span className="badge b-open">Released</span>{" "}
                      <span className="mono" style={{ color: "var(--ink-3)", fontSize: 12 }}>BR-0991</span>
                    </span>
                    <span className="mono" style={{ color: "var(--gold)", fontWeight: 600 }}>1,218.75</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span>
                      <span className="badge b-attn">Settled 80/20</span>{" "}
                      <span className="mono" style={{ color: "var(--ink-3)", fontSize: 12 }}>BR-0931</span>
                    </span>
                    <span className="mono" style={{ color: "var(--gold)", fontWeight: 600 }}>585.00</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span>
                      <span className="badge b-mut">Refunded</span>{" "}
                      <span className="mono" style={{ color: "var(--ink-3)", fontSize: 12 }}>BR-0975</span>
                    </span>
                    <span className="mono" style={{ color: "var(--ink-2)", fontWeight: 600 }}>400.00</span>
                  </div>
                </div>
              </section>

              {/* Top developers */}
              <section className="panel">
                <div className="panel-h">Top developers this month</div>
                <div className="panel-b">
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="mono" style={{ color: "var(--ink-3)", width: 14 }}>1</span>
                    <span className="av av2">MN</span>
                    <span style={{ flex: 1, fontWeight: 500 }}>Minh Nguyen</span>
                    <span className="mono" style={{ color: "var(--gold)", fontWeight: 600 }}>4,210</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="mono" style={{ color: "var(--ink-3)", width: 14 }}>2</span>
                    <span className="av av3">QL</span>
                    <span style={{ flex: 1, fontWeight: 500 }}>Quang Le</span>
                    <span className="mono" style={{ color: "var(--gold)", fontWeight: 600 }}>3,075</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="mono" style={{ color: "var(--ink-3)", width: 14 }}>3</span>
                    <span className="av av4">TV</span>
                    <span style={{ flex: 1, fontWeight: 500 }}>Thao Vu</span>
                    <span className="mono" style={{ color: "var(--gold)", fontWeight: 600 }}>1,940</span>
                  </div>
                </div>
              </section>
            </aside>
          </div>

          {/* Contract Rules Section */}
          <section style={{ marginTop: 36, display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <h2 className="h1" style={{ fontSize: 22 }}>Escrow rules, fixed in the contract</h2>
              <p className="sub">Every number below is a constant in BloodyRoarEscrow.sol. Nobody can change them for a funded bounty.</p>
            </div>
            <div className="rules">
              <div className="rule">
                <div className="v mono">24 h</div>
                <p>For the client to fund after selecting a developer. Otherwise the bounty reopens.</p>
              </div>
              <div className="rule">
                <div className="v mono">+7 days</div>
                <p>Review window after the delivery deadline. Silence lets the developer claim.</p>
              </div>
              <div className="rule">
                <div className="v mono">72 h</div>
                <p>For the other side to add evidence once a dispute opens. No ruling before it closes.</p>
              </div>
              <div className="rule">
                <div className="v mono">2.5%</div>
                <p>Platform fee, taken from the developer share only. A full refund pays no fee.</p>
              </div>
            </div>
          </section>
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
            <span style={{ color: "var(--ink-3)" }}>Bounty marketplace with on-chain USDC escrow on Base Sepolia.</span>
          </div>
          <nav aria-label="Marketplace">
            <span className="lab">Marketplace</span>
            <Link href="/marketplace">Browse bounties</Link>
            <Link href="/marketplace?skills=solidity">Skills</Link>
            <Link href="/marketplace">Developers</Link>
            <Link href="/issues/create">Post a bounty</Link>
          </nav>
          <nav aria-label="Escrow">
            <span className="lab">Escrow</span>
            <Link href="/#rules">How it works</Link>
            <Link href="/#rules">Contract rules</Link>
            <Link href="/#rules">Disputes and arbiter</Link>
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
