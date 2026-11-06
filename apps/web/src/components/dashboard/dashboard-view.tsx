"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, BriefcaseBusiness, CircleDollarSign, ClipboardList, Clock3 } from "lucide-react";
import { graphqlRequest } from "@/lib/graphql-client";
import { useAuthStore } from "@/lib/store/use-auth-store";
import { Button } from "@/components/ui/button";
import { issueStatus } from "@/lib/issue-status";
import { Badge } from "@/components/ui/badge";
import { AuthRequiredPanel } from "@/components/auth/auth-required-panel";
import { useUiPreferences } from "@/lib/ui-preferences";
import { sendPreparedCalls, type PreparedCall } from "@/lib/web3/send-prepared";

const CLAIMABLE_QUERY = `query MyClaimable { myClaimable { chainId contractAddress address amountRaw } }`;
const PREPARE_CLAIM = `mutation PrepareClaim($recipient: String!) { prepareClaim(recipient: $recipient) { intentId method contractAddress data value } }`;
const RECORD_TX = `mutation RecordTx($id: ID!, $hash: String!) { recordTransactionSubmitted(intentId: $id, txHash: $hash) { id } }`;

// Escrow balances use six decimal places (USDC raw units).
const formatRaw = (raw: string) => (Number(raw) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 });

const DASHBOARD_QUERY = `query Dashboard {
  userStats { postedTasks workingTasks completedTasks applications completedPayouts }
  myIssues { id title status category bountyAmount { formatted } createdAt updatedAt expiresAt developerId clientId token { symbol } }
  myApplications { id status createdAt issue { id title status bountyAmount { formatted } token { symbol } client { name } } }
}`;

type DashboardTask = { id: string; title: string; status: string; category: string; bountyAmount: number; createdAt: string; updatedAt: string; expiresAt?: string | null; developerId?: string | null; clientId: string; token: { symbol: string } };
type DashboardApplication = { id: string; status: string; createdAt: string; issue: { id: string; title: string; status: string; bountyAmount: number; token: { symbol: string }; client: { name?: string | null } } };
type DashboardData = { userStats: { postedTasks: number; workingTasks: number; completedTasks: number; applications: number; completedPayouts: number }; myIssues: DashboardTask[]; myApplications: DashboardApplication[] };
// The API returns bounty amounts as TokenAmount objects; the view works with plain numbers.
type DashboardRaw = {
  userStats: DashboardData["userStats"];
  myIssues: Array<Omit<DashboardTask, "bountyAmount"> & { bountyAmount: { formatted: string } }>;
  myApplications: Array<Omit<DashboardApplication, "issue"> & { issue: Omit<DashboardApplication["issue"], "bountyAmount"> & { bountyAmount: { formatted: string } } }>;
};
type Tab = "all" | "posted" | "working" | "applications";

const APPLICATION_LABELS: Record<string, string> = { PENDING: "Pending", ACCEPTED: "Accepted", REJECTED: "Not selected", WITHDRAWN: "Withdrawn" };
const statusLabel = (status: string) => APPLICATION_LABELS[status] ?? issueStatus(status).label;
const statusVariant = (status: string) => issueStatus(status).variant;

export function DashboardView() {
  const user = useAuthStore((state) => state.user);
  const authStatus = useAuthStore((state) => state.status);
  const { theme } = useUiPreferences();
  const [data, setData] = useState<DashboardData | null>(null);
  const queryTab = useSearchParams().get("tab");
  const [tab, setTab] = useState<Tab>(queryTab === "bounties" ? "posted" : "all");
  useEffect(() => { setTab(queryTab === "bounties" ? "posted" : "all"); }, [queryTab]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimable, setClaimable] = useState<string>("0");
  const [claiming, setClaiming] = useState(false);
  const [claimNotice, setClaimNotice] = useState<string | null>(null);

  const loadClaimable = () => graphqlRequest<{ myClaimable: Array<{ amountRaw: string }> }>(CLAIMABLE_QUERY)
    .then((result) => setClaimable(result.myClaimable.reduce((sum, row) => sum + BigInt(row.amountRaw), 0n).toString()))
    .catch(() => undefined);

  useEffect(() => {
    if (user) void loadClaimable();
  }, [user]);

  // Withdraws the whole claimable balance to the connected wallet.
  const claimFunds = async () => {
    if (!user?.walletAddress) return;
    setClaiming(true); setError(null); setClaimNotice(null);
    try {
      const prepared = await graphqlRequest<{ prepareClaim: PreparedCall }>(PREPARE_CLAIM, { recipient: user.walletAddress });
      await sendPreparedCalls([prepared.prepareClaim], (intentId, txHash) => graphqlRequest(RECORD_TX, { id: intentId, hash: txHash }).then(() => undefined), user.walletAddress);
      setClaimNotice("Payout withdrawn to your wallet.");
      await loadClaimable();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not withdraw funds."); }
    finally { setClaiming(false); }
  };

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let active = true;
    void graphqlRequest<DashboardRaw>(DASHBOARD_QUERY)
      .then((result) => {
        if (!active) return;
        setData({
          userStats: result.userStats,
          myIssues: result.myIssues.map((task) => ({ ...task, bountyAmount: Number(task.bountyAmount.formatted) })),
          myApplications: result.myApplications.map((application) => ({ ...application, issue: { ...application.issue, bountyAmount: Number(application.issue.bountyAmount.formatted) } })),
        });
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load your dashboard."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user]);

  const tasks = useMemo(() => (data?.myIssues ?? []).filter((task) => {
    if (tab === "posted") return task.clientId === user?.id;
    if (tab === "working") return task.developerId === user?.id;
    return tab !== "applications";
  }), [data, tab, user?.id]);

  if (authStatus === "restoring") return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8"><div className="h-32 animate-pulse rounded-xl bg-[hsl(var(--card))]" /></main>;
  if (!user) return <main className="mx-auto max-w-4xl px-4 py-16"><AuthRequiredPanel title="Your workspace is ready after wallet sign-in" description="Connect your wallet to see the bounties you posted, tasks assigned to you, and every application in one place." actionLabel="Connect wallet to open dashboard" /></main>;

  return (
    <div className={`br min-h-screen ${theme === "dark" ? "dark" : ""}`}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div id="wallet">
        {BigInt(claimable) > 0n && (
          <section className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[hsl(var(--border))] p-4">
            <p className="text-sm">Available to withdraw: <strong>{formatRaw(claimable)} USDC</strong></p>
            <Button className="btn btn-p" disabled={claiming} onClick={() => void claimFunds()}>Rút tiền</Button>
            {claimNotice && <p role="status" className="w-full text-xs text-[hsl(var(--success))]">{claimNotice}</p>}
          </section>
        )}
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4 animate-fade-in">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">Workspace</p><h1 className="mt-1 font-outfit text-3xl font-bold text-[var(--ink)]">Dashboard</h1><p className="mt-1 text-sm text-[var(--ink-3)]">Track the work you posted and the tasks you applied for.</p></div>
        </div>

      {data && <section className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-5 animate-fade-in">
        <StatCard label="Posted tasks" value={data.userStats.postedTasks} icon={<ClipboardList className="h-4 w-4" />} />
        <StatCard label="In progress" value={data.userStats.workingTasks} icon={<BriefcaseBusiness className="h-4 w-4" />} />
        <StatCard label="Completed" value={data.userStats.completedTasks} icon={<CircleDollarSign className="h-4 w-4" />} />
        <StatCard label="Applications" value={data.userStats.applications} icon={<Clock3 className="h-4 w-4" />} />
        <StatCard label="Paid escrows" value={data.userStats.completedPayouts} icon={<CircleDollarSign className="h-4 w-4" />} />
      </section>}

      {error && <div role="alert" className="mt-5 rounded-lg border border-[hsl(var(--destructive)/0.35)] bg-[hsl(var(--destructive)/0.08)] p-3 text-sm text-[hsl(var(--destructive))]">{error}</div>}
      <section className="mt-7 overflow-hidden rounded-xl glass animate-fade-in">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--border))] px-4 py-4 sm:px-6">
          <div><h2 className="font-semibold">Work and applications</h2><p className="text-xs text-[hsl(var(--foreground-muted))]">Updates are saved to your Bloody-Roar workspace.</p></div>
          <div className="flex flex-wrap gap-1 rounded-lg bg-[hsl(var(--background-secondary))] p-1">
            {([ ["all", "All work"], ["posted", "Posted"], ["working", "Assigned to me"], ["applications", "Applications"] ] as const).map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`rounded-md px-3 py-1.5 text-xs font-medium ${tab === key ? "bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow" : "text-[hsl(var(--foreground-muted))]"}`}>{label}</button>)}
          </div>
        </div>

        {loading ? <div className="space-y-3 p-6">{[0, 1, 2].map((key) => <div key={key} className="h-16 animate-pulse rounded-lg bg-[hsl(var(--muted))]" />)}</div> : tab === "applications" ? (
          <div className="divide-y divide-[hsl(var(--border))]">{(data?.myApplications ?? []).map((application) => <Link key={application.id} href={`/issues/${application.issue.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 transition hover:bg-[hsl(var(--background-secondary))] sm:px-6"><div className="min-w-0"><p className="truncate font-medium">{application.issue.title}</p><p className="mt-1 text-xs text-[hsl(var(--foreground-muted))]">Client: {application.issue.client.name || "Wallet user"} · Applied {new Date(application.createdAt).toLocaleDateString()}</p></div><div className="flex items-center gap-3"><Badge variant={statusVariant(application.status) as never}>{statusLabel(application.status)}</Badge><span className="text-sm font-semibold text-[hsl(var(--success))]">{application.issue.bountyAmount.toLocaleString()} {application.issue.token.symbol}</span><ArrowRight className="h-4 w-4 text-[hsl(var(--foreground-subtle))]" /></div></Link>)}{(data?.myApplications.length ?? 0) === 0 && <EmptyState title="No applications yet" text="Browse open tasks and send your first application." />}</div>
        ) : (
          <div className="divide-y divide-[hsl(var(--border))]">{tasks.map((task) => <Link key={task.id} href={`/issues/${task.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 transition hover:bg-[hsl(var(--background-secondary))] sm:px-6"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-medium">{task.title}</p><Badge variant={statusVariant(task.status) as never}>{statusLabel(task.status)}</Badge></div><p className="mt-1 text-xs text-[hsl(var(--foreground-muted))]">{task.category.replaceAll("_", " ")} · Updated {new Date(task.updatedAt).toLocaleDateString()}</p></div><div className="flex items-center gap-3"><span className="text-sm font-semibold text-[hsl(var(--success))]">{task.bountyAmount.toLocaleString()} {task.token.symbol}</span><ArrowRight className="h-4 w-4 text-[hsl(var(--foreground-subtle))]" /></div></Link>)}{!tasks.length && <EmptyState title="No tasks here yet" text="Create a bounty or apply for a task from the marketplace." />}</div>
        )}
      </section>
    </main>
  </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return <div className="glass rounded-xl p-4 transition-all hover:border-[hsl(var(--primary)/0.3)]"><div className="flex items-center gap-2 text-xs text-[hsl(var(--foreground-muted))]">{icon}{label}</div><p className="mt-2 truncate font-outfit text-xl font-bold">{value}</p></div>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="px-6 py-12 text-center"><p className="font-medium">{title}</p><p className="mt-1 text-sm text-[hsl(var(--foreground-muted))]">{text}</p><Button asChild variant="outline" size="sm" className="mt-4"><Link href="/">Explore marketplace</Link></Button></div>;
}
