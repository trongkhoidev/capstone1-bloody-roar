"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, ExternalLink, Search, ShieldAlert, Users } from "lucide-react";
import { graphqlRequest } from "@/lib/graphql-client";
import { useAuthStore } from "@/lib/store/use-auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AuthRequiredPanel } from "@/components/auth/auth-required-panel";
import { useUiPreferences } from "@/lib/ui-preferences";

const ADMIN_STATS = `query AdminStats { adminStats { users openTasks activeTasks completedTasks openDisputes completedBounties { symbol amount } } }`;
const ADMIN_USERS = `query AdminUsers($search: String, $first: Int) { adminUsers(search: $search, first: $first) { id name walletAddress role isGithubVerified githubUsername isBanned bannedReason createdAt } }`;
const ADMIN_DISPUTES = `query AdminDisputes { adminDisputes { id issueId status reason aiReport aiConfidenceScore suggestedRatio proposedClientRatio proposedAt challengeDeadline createdAt } }`;
const BAN_USER = `mutation BanUser($input: BanUserInput!) { banUser(input: $input) { id isBanned } }`;
const UNBAN_USER = `mutation UnbanUser($userId: ID!) { unbanUser(userId: $userId) { id isBanned } }`;
const PROPOSE_RESOLUTION = `mutation ProposeResolution($input: ProposeDisputeResolutionInput!) { proposeDisputeResolution(input: $input) { id status proposedClientRatio challengeDeadline } }`;
const ANALYZE_DISPUTE = `mutation AnalyzeDispute($issueId: String!) { analyzeDispute(issueId: $issueId) { id status aiReport aiConfidenceScore suggestedRatio } }`;

type AdminStats = { users: number; openTasks: number; activeTasks: number; completedTasks: number; openDisputes: number; completedBounties: Array<{ symbol: string; amount: number }> };
type AdminUser = { id: string; name?: string | null; walletAddress: string; role: string; isGithubVerified: boolean; githubUsername?: string | null; isBanned: boolean; bannedReason?: string | null; createdAt: string };
type AdminDispute = { id: string; issueId: string; status: string; reason: string; aiReport?: string | null; aiConfidenceScore?: number | null; suggestedRatio?: number | null; proposedClientRatio?: number | null; proposedAt?: string | null; challengeDeadline?: string | null; createdAt: string };

export function AdminView() {
  const user = useAuthStore((state) => state.user);
  const authStatus = useAuthStore((state) => state.status);
  const { language, t } = useUiPreferences();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [disputes, setDisputes] = useState<AdminDispute[]>([]);
  const [search, setSearch] = useState("");
  const [banReasons, setBanReasons] = useState<Record<string, string>>({});
  const [resolutions, setResolutions] = useState<Record<string, { clientRatio: string; note: string }>>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (term: string) => {
    setLoading(true); setError(null);
    try {
      const [statsData, usersData, disputesData] = await Promise.all([
        graphqlRequest<{ adminStats: AdminStats }>(ADMIN_STATS),
        graphqlRequest<{ adminUsers: AdminUser[] }>(ADMIN_USERS, { search: term || undefined, first: 40 }),
        graphqlRequest<{ adminDisputes: AdminDispute[] }>(ADMIN_DISPUTES),
      ]);
      setStats(statsData.adminStats); setUsers(usersData.adminUsers); setDisputes(disputesData.adminDisputes);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load administrator data."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!user || user.role !== "ADMIN") { setLoading(false); return; }
    const timer = window.setTimeout(() => void load(search.trim()), search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, search, user]);

  const banUser = async (target: AdminUser) => {
    const reason = banReasons[target.id]?.trim();
    if (!reason) { setError("Enter a reason before suspending an account."); return; }
    setWorking(target.id); setError(null); setNotice(null);
    try {
      await graphqlRequest(BAN_USER, { input: { userId: target.id, reason } });
      setNotice(`Account ${target.walletAddress.slice(0, 8)}… suspended.`); await load(search.trim());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not suspend user."); }
    finally { setWorking(null); }
  };

  const unbanUser = async (target: AdminUser) => {
    setWorking(target.id); setError(null); setNotice(null);
    try { await graphqlRequest(UNBAN_USER, { userId: target.id }); setNotice("Account restored."); await load(search.trim()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not restore user."); }
    finally { setWorking(null); }
  };

  const proposeResolution = async (dispute: AdminDispute) => {
    const form = resolutions[dispute.id] ?? { clientRatio: String(dispute.suggestedRatio ?? 50), note: "" };
    setWorking(dispute.id); setError(null); setNotice(null);
    try {
      await graphqlRequest(PROPOSE_RESOLUTION, { input: { issueId: dispute.issueId, clientRatio: Number(form.clientRatio), note: form.note } });
      setNotice("Resolution proposal saved. The contract will enforce its own challenge and execution rules after integration."); await load(search.trim());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not record proposal."); }
    finally { setWorking(null); }
  };

  const analyzeDispute = async (dispute: AdminDispute) => {
    setWorking(dispute.id); setError(null); setNotice(null);
    try {
      await graphqlRequest(ANALYZE_DISPUTE, { issueId: dispute.issueId });
      setNotice("AI evidence report saved. Review it before making a human resolution proposal.");
      await load(search.trim());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not analyze dispute evidence."); }
    finally { setWorking(null); }
  };

  if (authStatus === "restoring") return <main className="mx-auto max-w-3xl px-4 py-16"><div className="h-48 animate-pulse rounded-xl bg-[hsl(var(--card))]" /></main>;
  if (!user) return <main className="mx-auto max-w-3xl px-4 py-16"><AuthRequiredPanel title="Admin access requires wallet sign-in" description="Connect the wallet that has the administrator role to open the operations console." actionLabel="Connect administrator wallet" /></main>;
  if (user.role !== "ADMIN") return <main className="mx-auto max-w-3xl px-4 py-16 text-center"><ShieldAlert className="mx-auto h-8 w-8 text-[hsl(var(--warning))]" /><h1 className="mt-3 font-outfit text-3xl font-bold">Admin access required</h1><p className="mt-2 text-sm text-[hsl(var(--foreground-muted))]">This page is available to platform administrators only.</p></main>;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-fade-in">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--primary))]">{t("operations")}</p><h1 className="mt-1 font-outfit text-3xl font-bold gradient-text">{t("admin")}</h1><p className="mt-1 text-sm text-[hsl(var(--foreground-muted))]">{t("manageAccounts")}</p></div>
      {error && <p role="alert" className="mt-5 rounded-lg border border-[hsl(var(--destructive)/0.35)] bg-[hsl(var(--destructive)/0.08)] p-3 text-sm text-[hsl(var(--destructive))]">{error}</p>}
      {notice && <p role="status" className="mt-5 rounded-lg border border-[hsl(var(--success)/0.35)] bg-[hsl(var(--success)/0.08)] p-3 text-sm text-[hsl(var(--success))]">{notice}</p>}

      {stats && <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6 animate-fade-in">
        <Metric label={t("activeUsers")} value={stats.users} icon={<Users className="h-4 w-4" />} />
        <Metric label={t("openTasks")} value={stats.openTasks} icon={<BarChart3 className="h-4 w-4" />} />
        <Metric label={t("inProgress")} value={stats.activeTasks} icon={<BarChart3 className="h-4 w-4" />} />
        <Metric label={t("completedTasks")} value={stats.completedTasks} icon={<BarChart3 className="h-4 w-4" />} />
        <Metric label={t("openDisputes")} value={stats.openDisputes} icon={<ShieldAlert className="h-4 w-4" />} />
        <div className="glass rounded-xl p-4"><p className="text-xs text-[hsl(var(--foreground-muted))]">{t("paidBounties")}</p>{stats.completedBounties.length ? stats.completedBounties.map((row) => <p key={row.symbol} className="mt-1 font-semibold">{row.amount.toLocaleString()} {row.symbol}</p>) : <p className="mt-2 text-sm">—</p>}</div>
      </section>}

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <section className="overflow-hidden glass rounded-xl animate-fade-in">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--border))] p-4 sm:p-5"><div><h2 className="font-semibold">{t("accounts")}</h2><p className="text-xs text-[hsl(var(--foreground-muted))]">{users.length} {t("matchingAccounts")}</p></div><div className="relative w-full sm:max-w-xs"><Search className="absolute left-3 top-3 h-4 w-4 text-[hsl(var(--foreground-subtle))]" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={language === "vi" ? "Ví hoặc tên GitHub" : "Wallet or GitHub handle"} className="pl-9" /></div></header>
          {loading ? <RowsSkeleton /> : <div className="divide-y divide-[hsl(var(--border))]">{users.map((account) => <article key={account.id} className="p-4 sm:p-5 hover:bg-[hsl(var(--background-secondary)/0.5)] transition-colors">
            <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{account.name || account.walletAddress.slice(0, 12)}</p><Badge variant={account.isBanned ? "danger" : "secondary"}>{account.isBanned ? "Suspended" : account.role}</Badge>{account.isGithubVerified && <span className="text-xs text-[hsl(var(--success))]">GitHub @{account.githubUsername}</span>}</div><p className="mt-1 break-all font-mono text-[10px] text-[hsl(var(--foreground-subtle))]">{account.walletAddress}</p>{account.bannedReason && <p className="mt-1 text-xs text-[hsl(var(--destructive))]">{account.bannedReason}</p>}</div>
              {account.isBanned ? <Button size="sm" variant="outline" disabled={working === account.id} onClick={() => void unbanUser(account)}>{t("restore")}</Button> : <div className="flex w-full gap-2 sm:w-auto"><Input value={banReasons[account.id] ?? ""} maxLength={500} onChange={(event) => setBanReasons((current) => ({ ...current, [account.id]: event.target.value }))} placeholder={language === "vi" ? "Lý do tạm khóa" : "Reason to suspend"} className="h-8 text-xs" /><Button size="sm" variant="destructive" disabled={working === account.id || account.id === user.id} onClick={() => void banUser(account)}>{t("suspend")}</Button></div>}
            </div>
          </article>)}{users.length === 0 && <p className="p-8 text-center text-sm text-[hsl(var(--foreground-muted))]">{t("noAccounts")}</p>}</div>}
        </section>

        <section className="overflow-hidden glass rounded-xl animate-fade-in">
          <header className="border-b border-[hsl(var(--border))] p-4 sm:p-5"><h2 className="font-semibold">{t("disputes")}</h2><p className="text-xs text-[hsl(var(--foreground-muted))]">{t("reviewDisputes")}</p></header>
          {loading ? <RowsSkeleton /> : <div className="divide-y divide-[hsl(var(--border))]">{disputes.map((dispute) => {
            const form = resolutions[dispute.id] ?? { clientRatio: String(dispute.suggestedRatio ?? 50), note: "" };
            const mayPropose = ["OPEN", "CHALLENGED"].includes(dispute.status);
            return <article key={dispute.id} className="space-y-3 p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">Dispute · {dispute.status.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-[hsl(var(--foreground-muted))]">{dispute.reason}</p></div><Link href={`/issues/${dispute.issueId}`} className="inline-flex shrink-0 items-center gap-1 text-xs text-[hsl(var(--accent))]">Task <ExternalLink className="h-3 w-3" /></Link></div>
              {dispute.suggestedRatio != null && <p className="rounded-md bg-[hsl(var(--background-secondary))] p-2.5 text-xs">AI suggestion: <strong>{dispute.suggestedRatio}% client refund</strong>{dispute.aiConfidenceScore != null && <span className="text-[hsl(var(--foreground-muted))]"> · {Math.round(dispute.aiConfidenceScore * 100)}% confidence</span>}</p>}
              {dispute.aiReport && <details className="rounded-md border border-[hsl(var(--border))] p-3"><summary className="cursor-pointer text-xs font-medium">Review AI evidence report</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-4 text-[hsl(var(--foreground-muted))]">{(() => { try { return JSON.stringify(JSON.parse(dispute.aiReport), null, 2); } catch { return dispute.aiReport; } })()}</pre></details>}
              {["OPEN", "CHALLENGED"].includes(dispute.status) && <Button size="sm" variant="outline" disabled={working === dispute.id} onClick={() => void analyzeDispute(dispute)}>{dispute.aiReport ? "Reanalyze evidence" : "Analyze evidence with AI"}</Button>}
              {dispute.challengeDeadline && <p className="text-[10px] text-[hsl(var(--foreground-subtle))">Challenge deadline: {new Date(dispute.challengeDeadline).toLocaleString()}</p>}
              {mayPropose && <><label htmlFor={`client-ratio-${dispute.id}`} className="block text-xs">Client share (%)</label><Input id={`client-ratio-${dispute.id}`} type="number" min={0} max={100} step="1" value={form.clientRatio} onChange={(event) => setResolutions((current) => ({ ...current, [dispute.id]: { ...form, clientRatio: event.target.value } }))} className="-mt-2" /><textarea value={form.note} onChange={(event) => setResolutions((current) => ({ ...current, [dispute.id]: { ...form, note: event.target.value } }))} minLength={10} maxLength={2000} rows={3} placeholder="Reason for the proposed split" className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background-secondary))] p-3 text-xs outline-none" /><Button size="sm" disabled={working === dispute.id} onClick={() => void proposeResolution(dispute)}>Save proposal (24h challenge period)</Button></>}
            </article>;
          })}{disputes.length === 0 && <p className="p-8 text-center text-sm text-[hsl(var(--foreground-muted))]">{t("noDisputes")}</p>}</div>}
          <p className="border-t border-[hsl(var(--border))] p-4 text-[10px] leading-4 text-[hsl(var(--warning))]">This console records proposals off-chain only. Final ratios, timelocks, and payouts must be executed by the escrow contract.</p>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div className="glass rounded-xl p-4 transition-all hover:border-[hsl(var(--primary)/0.3)]"><div className="flex items-center gap-2 text-xs text-[hsl(var(--foreground-muted))]">{icon}{label}</div><p className="mt-2 font-outfit text-2xl font-bold">{value.toLocaleString()}</p></div>;
}

function RowsSkeleton() {
  return <div className="space-y-3 p-5">{[0, 1, 2].map((row) => <div key={row} className="h-16 animate-pulse rounded-lg bg-[hsl(var(--muted))]" />)}</div>;
}
