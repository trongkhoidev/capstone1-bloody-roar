"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, CircleDollarSign, ClipboardList, Clock3, Plus } from "lucide-react";
import { graphqlRequest } from "@/lib/graphql-client";
import { useAuthStore } from "@/lib/store/use-auth-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AuthRequiredPanel } from "@/components/auth/auth-required-panel";

const DASHBOARD_QUERY = `query Dashboard {
  userStats { postedTasks workingTasks completedTasks applications completedPayouts }
  myIssues { id title status category bountyAmount createdAt updatedAt expiresAt developerId clientId token { symbol } }
  myApplications { id status createdAt issue { id title status bountyAmount token { symbol } client { name } } }
}`;

type DashboardTask = { id: string; title: string; status: string; category: string; bountyAmount: number; createdAt: string; updatedAt: string; expiresAt?: string | null; developerId?: string | null; clientId: string; token: { symbol: string } };
type DashboardApplication = { id: string; status: string; createdAt: string; issue: { id: string; title: string; status: string; bountyAmount: number; token: { symbol: string }; client: { name?: string | null } } };
type DashboardData = { userStats: { postedTasks: number; workingTasks: number; completedTasks: number; applications: number; completedPayouts: number }; myIssues: DashboardTask[]; myApplications: DashboardApplication[] };
type Tab = "all" | "posted" | "working" | "applications";

const STATUS_LABELS: Record<string, string> = { OPEN: "Open", IN_PROGRESS: "In progress", COMPLETED: "Completed", CANCELLED: "Cancelled", DISPUTED: "Disputed", PENDING: "Pending", ACCEPTED: "Accepted", REJECTED: "Not selected", WITHDRAWN: "Withdrawn" };
const statusVariant = (status: string) => status === "OPEN" ? "success" : status === "IN_PROGRESS" ? "warning" : status === "DISPUTED" ? "danger" : "secondary";

export function DashboardView() {
  const user = useAuthStore((state) => state.user);
  const authStatus = useAuthStore((state) => state.status);
  const [data, setData] = useState<DashboardData | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let active = true;
    void graphqlRequest<DashboardData>(DASHBOARD_QUERY)
      .then((result) => { if (active) setData(result); })
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
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4 animate-fade-in">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--primary))]">Workspace</p><h1 className="mt-1 font-outfit text-3xl font-bold gradient-text">Dashboard</h1><p className="mt-1 text-sm text-[hsl(var(--foreground-muted))]">Track the work you posted and the tasks you applied for.</p></div>
        <Button asChild><Link href="/issues/create"><Plus className="mr-2 h-4 w-4" />Post a bounty</Link></Button>
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
          <div className="divide-y divide-[hsl(var(--border))]">{(data?.myApplications ?? []).map((application) => <Link key={application.id} href={`/issues/${application.issue.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 transition hover:bg-[hsl(var(--background-secondary))] sm:px-6"><div className="min-w-0"><p className="truncate font-medium">{application.issue.title}</p><p className="mt-1 text-xs text-[hsl(var(--foreground-muted))]">Client: {application.issue.client.name || "Wallet user"} · Applied {new Date(application.createdAt).toLocaleDateString()}</p></div><div className="flex items-center gap-3"><Badge variant={statusVariant(application.status) as never}>{STATUS_LABELS[application.status] ?? application.status}</Badge><span className="text-sm font-semibold text-[hsl(var(--success))]">{application.issue.bountyAmount.toLocaleString()} {application.issue.token.symbol}</span><ArrowRight className="h-4 w-4 text-[hsl(var(--foreground-subtle))]" /></div></Link>)}{(data?.myApplications.length ?? 0) === 0 && <EmptyState title="No applications yet" text="Browse open tasks and send your first application." />}</div>
        ) : (
          <div className="divide-y divide-[hsl(var(--border))]">{tasks.map((task) => <Link key={task.id} href={`/issues/${task.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 transition hover:bg-[hsl(var(--background-secondary))] sm:px-6"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-medium">{task.title}</p><Badge variant={statusVariant(task.status) as never}>{STATUS_LABELS[task.status] ?? task.status}</Badge></div><p className="mt-1 text-xs text-[hsl(var(--foreground-muted))]">{task.category.replaceAll("_", " ")} · Updated {new Date(task.updatedAt).toLocaleDateString()}</p></div><div className="flex items-center gap-3"><span className="text-sm font-semibold text-[hsl(var(--success))]">{task.bountyAmount.toLocaleString()} {task.token.symbol}</span><ArrowRight className="h-4 w-4 text-[hsl(var(--foreground-subtle))]" /></div></Link>)}{!tasks.length && <EmptyState title="No tasks here yet" text="Create a bounty or apply for a task from the marketplace." />}</div>
        )}
      </section>
    </main>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return <div className="glass rounded-xl p-4 transition-all hover:border-[hsl(var(--primary)/0.3)]"><div className="flex items-center gap-2 text-xs text-[hsl(var(--foreground-muted))]">{icon}{label}</div><p className="mt-2 truncate font-outfit text-xl font-bold">{value}</p></div>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="px-6 py-12 text-center"><p className="font-medium">{title}</p><p className="mt-1 text-sm text-[hsl(var(--foreground-muted))]">{text}</p><Button asChild variant="outline" size="sm" className="mt-4"><Link href="/">Explore marketplace</Link></Button></div>;
}
