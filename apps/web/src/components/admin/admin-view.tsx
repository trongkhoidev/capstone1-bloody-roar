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

const ADMIN_STATS = `query AdminStats { adminStats { users openTasks activeTasks completedTasks openDisputes completedBounties { symbol formatted } } }`;
const ADMIN_USERS = `query AdminUsers($search: String, $first: Int) { adminUsers(search: $search, first: $first) { id name walletAddress role isGithubVerified githubUsername isBanned bannedReason createdAt } }`;
const ADMIN_DISPUTES = `query AdminDisputes { adminDisputes { id issueId status reason aiReport aiConfidenceScore aiStatus suggestedClientBps proposedClientBps finalClientBps challengeDeadline createdAt } }`;
const ADMIN_ISSUES = `query AdminIssues { adminIssues(first: 50) { id title status clientId developerId createdAt } }`;
const OPS_QUERY = `query AdminOps { indexerStatus { chainId contractAddress lastScannedBlock lagSeconds updatedAt } contractConfig { chainId contractAddress paused owner arbiter pendingArbiter feeRecipient pendingFeeRecipient updatedAt } reconciliationFindings(status: "OPEN", first: 20) { id kind blockNumber createdAt } stuckIntents(first: 20) { id method status createdAt } }`;
const EVIDENCE_QUERY = `query AdminEvidence($issueId: ID!) { evidenceFiles(issueId: $issueId) { id side manifestHash files { name downloadUrl sha256 size } } }`;
const BAN_USER = `mutation BanUser($input: BanUserInput!) { banUser(input: $input) { id isBanned } }`;
const UNBAN_USER = `mutation UnbanUser($userId: ID!) { unbanUser(userId: $userId) { id isBanned } }`;
const DRAFT_RULING = `mutation DraftRuling($issue: ID!, $kind: RulingDraftKind!, $bps: Int!, $rationale: String!) { draftRuling(issueId: $issue, kind: $kind, clientBps: $bps, rationale: $rationale) { decisionHash safeTransactionJson } }`;
const ANALYZE_DISPUTE = `mutation AnalyzeDispute($issueId: String!) { analyzeDispute(issueId: $issueId) { id status aiReport aiConfidenceScore suggestedClientBps } }`;
const HIDE_ISSUE = `mutation HideIssue($issue: ID!, $reason: String!) { adminHideIssue(issueId: $issue, reason: $reason) }`;
const UNHIDE_ISSUE = `mutation UnhideIssue($issue: ID!) { adminUnhideIssue(issueId: $issue) }`;

type AdminStats = { users: number; openTasks: number; activeTasks: number; completedTasks: number; openDisputes: number; completedBounties: Array<{ symbol: string; amount: number }> };
type AdminUser = { id: string; name?: string | null; walletAddress: string; role: string; isGithubVerified: boolean; githubUsername?: string | null; isBanned: boolean; bannedReason?: string | null; createdAt: string };
// Short AI summary from the stored report; the full report stays behind the details toggle.
function aiSummary(raw?: string | null): string | null {
  if (!raw) return null;
  try { const summary = (JSON.parse(raw) as { summary?: unknown }).summary; return typeof summary === "string" ? summary : null; } catch { return null; }
}

type AdminDispute = { id: string; issueId: string; status: string; reason: string; aiReport?: string | null; aiConfidenceScore?: number | null; aiStatus?: string | null; suggestedClientBps?: number | null; proposedClientBps?: number | null; finalClientBps?: number | null; challengeDeadline?: string | null; createdAt: string };
type AdminIssue = { id: string; title: string; status: string; clientId: string; developerId?: string | null; createdAt: string };
type OpsData = {
  indexerStatus: Array<{ chainId: number; contractAddress: string; lastScannedBlock: string; lagSeconds: number; updatedAt: string }>;
  contractConfig: Array<{ chainId: number; contractAddress: string; paused: boolean; owner: string; arbiter: string; pendingArbiter?: string | null; feeRecipient: string; pendingFeeRecipient?: string | null; updatedAt: string }>;
  reconciliationFindings: Array<{ id: string; kind: string; blockNumber: string; createdAt: string }>;
  stuckIntents: Array<{ id: string; method: string; status: string; createdAt: string }>;
};
type EvidenceView = { id: string; side: string; manifestHash: string; files: Array<{ name: string; downloadUrl: string; sha256: string; size: number }> };
type RulingDraft = { decisionHash: string; safeTransactionJson: string };
type DraftForm = { kind: "INITIAL" | "FINAL"; clientPercent: string; rationale: string };

export function AdminView() {
  const user = useAuthStore((state) => state.user);
  const authStatus = useAuthStore((state) => state.status);
  const { language, t, theme } = useUiPreferences();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [disputes, setDisputes] = useState<AdminDispute[]>([]);
  const [issues, setIssues] = useState<AdminIssue[]>([]);
  const [ops, setOps] = useState<OpsData | null>(null);
  const [tab, setTab] = useState<"disputes" | "ops">("disputes");
  const [search, setSearch] = useState("");
  const [banReasons, setBanReasons] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, DraftForm>>({});
  const [rulings, setRulings] = useState<Record<string, RulingDraft>>({});
  const [evidence, setEvidence] = useState<Record<string, EvidenceView[]>>({});
  const [hideReasons, setHideReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (term: string) => {
    setLoading(true); setError(null);
    try {
      const [statsData, usersData, disputesData, issuesData] = await Promise.all([
        graphqlRequest<{ adminStats: Omit<AdminStats, "completedBounties"> & { completedBounties: Array<{ symbol: string; formatted: string }> } }>(ADMIN_STATS),
        graphqlRequest<{ adminUsers: AdminUser[] }>(ADMIN_USERS, { search: term || undefined, first: 40 }),
        graphqlRequest<{ adminDisputes: AdminDispute[] }>(ADMIN_DISPUTES),
        graphqlRequest<{ adminIssues: AdminIssue[] }>(ADMIN_ISSUES),
      ]);
      const raw = statsData.adminStats;
      setStats({ ...raw, completedBounties: raw.completedBounties.map((row) => ({ symbol: row.symbol, amount: Number(row.formatted) })) });
      setUsers(usersData.adminUsers); setDisputes(disputesData.adminDisputes); setIssues(issuesData.adminIssues);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load administrator data."); }
    finally { setLoading(false); }
  }, []);

  const loadOps = useCallback(async () => {
    try { setOps(await graphqlRequest<OpsData>(OPS_QUERY)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load operations data."); }
  }, []);

  useEffect(() => {
    if (!user || user.role !== "ADMIN") { setLoading(false); return; }
    const timer = window.setTimeout(() => void load(search.trim()), search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, search, user]);

  useEffect(() => {
    if (tab === "ops" && user?.role === "ADMIN") void loadOps();
  }, [loadOps, tab, user]);

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

  // Drafts a ruling for the arbiter Safe. The admin's percentage is never filled from the AI suggestion.
  const draftRuling = async (dispute: AdminDispute) => {
    const form = drafts[dispute.id] ?? { kind: "INITIAL" as const, clientPercent: "50", rationale: "" };
    setWorking(dispute.id); setError(null); setNotice(null);
    try {
      const data = await graphqlRequest<{ draftRuling: RulingDraft }>(DRAFT_RULING, { issue: dispute.issueId, kind: form.kind, bps: Math.round(Number(form.clientPercent) * 100), rationale: form.rationale.trim() });
      setRulings((current) => ({ ...current, [dispute.issueId]: data.draftRuling }));
      setNotice("Ruling draft saved. Copy or download the Safe transaction and send it from the arbiter Safe.");
      await load(search.trim());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not draft the ruling."); }
    finally { setWorking(null); }
  };

  const copyRuling = (issueId: string) => {
    const draft = rulings[issueId];
    if (draft) void navigator.clipboard.writeText(draft.safeTransactionJson);
  };

  const downloadRuling = (issueId: string) => {
    const draft = rulings[issueId];
    if (!draft) return;
    const url = URL.createObjectURL(new Blob([draft.safeTransactionJson], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = `ruling-${issueId}.json`; link.click();
    URL.revokeObjectURL(url);
  };

  const analyzeDispute = async (dispute: AdminDispute) => {
    setWorking(dispute.id); setError(null); setNotice(null);
    try {
      await graphqlRequest(ANALYZE_DISPUTE, { issueId: dispute.issueId });
      setNotice("AI evidence report saved. Review it before drafting a ruling.");
      await load(search.trim());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not analyze dispute evidence."); }
    finally { setWorking(null); }
  };

  const loadEvidence = async (issueId: string) => {
    setWorking(issueId); setError(null);
    try {
      const data = await graphqlRequest<{ evidenceFiles: EvidenceView[] }>(EVIDENCE_QUERY, { issueId });
      setEvidence((current) => ({ ...current, [issueId]: data.evidenceFiles }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load evidence files."); }
    finally { setWorking(null); }
  };

  const setHidden = async (issue: AdminIssue, hidden: boolean) => {
    const reason = hideReasons[issue.id]?.trim() ?? "";
    if (hidden && reason.length < 3) { setError("Enter at least 3 characters for the hide reason."); return; }
    setWorking(issue.id); setError(null); setNotice(null);
    try {
      if (hidden) await graphqlRequest(HIDE_ISSUE, { issue: issue.id, reason });
      else await graphqlRequest(UNHIDE_ISSUE, { issue: issue.id });
      setNotice(hidden ? "Task hidden from the marketplace." : "Task visible again."); await load(search.trim());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not change visibility."); }
    finally { setWorking(null); }
  };

  if (authStatus === "restoring") return <main className="mx-auto max-w-3xl px-4 py-16"><div className="h-48 animate-pulse rounded-xl bg-[hsl(var(--card))]" /></main>;
  if (!user) return <main className="mx-auto max-w-3xl px-4 py-16"><AuthRequiredPanel title="Admin access requires wallet sign-in" description="Connect the wallet that has the administrator role to open the operations console." actionLabel="Connect administrator wallet" /></main>;
  if (user.role !== "ADMIN") return <main className="mx-auto max-w-3xl px-4 py-16 text-center"><ShieldAlert className="mx-auto h-8 w-8 text-[hsl(var(--warning))]" /><h1 className="mt-3 font-outfit text-3xl font-bold">Admin access required</h1><p className="mt-2 text-sm text-[hsl(var(--foreground-muted))]">This page is available to platform administrators only.</p></main>;

  return (
    <div className={`br min-h-screen ${theme === "dark" ? "dark" : ""}`}>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-fade-in">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand)]">{t("operations")}</p><h1 className="mt-1 font-outfit text-3xl font-bold text-[var(--ink)]">{t("admin")}</h1><p className="mt-1 text-sm text-[var(--ink-3)]">{t("manageAccounts")}</p></div>
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

      <nav className="mt-6 flex gap-2" aria-label="Admin sections">
        <Button size="sm" variant={tab === "disputes" ? "default" : "outline"} onClick={() => setTab("disputes")}>{t("disputes")}</Button>
        <Button size="sm" variant={tab === "ops" ? "default" : "outline"} onClick={() => setTab("ops")}>Operations</Button>
      </nav>

      {tab === "ops" ? <OpsPanel ops={ops} onRefresh={() => void loadOps()} /> : <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <section className="overflow-hidden glass rounded-xl animate-fade-in">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--border))] p-4 sm:p-5"><div><h2 className="font-semibold">{t("accounts")}</h2><p className="text-xs text-[hsl(var(--foreground-muted))]">{users.length} {t("matchingAccounts")}</p></div><div className="relative w-full sm:max-w-xs"><Search className="absolute left-3 top-3 h-4 w-4 text-[hsl(var(--foreground-subtle))]" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={language === "vi" ? "Ví hoặc tên GitHub" : "Wallet or GitHub handle"} className="pl-9" /></div></header>
          {loading ? <RowsSkeleton /> : <div className="divide-y divide-[hsl(var(--border))]">{users.map((account) => <article key={account.id} className="p-4 sm:p-5 hover:bg-[hsl(var(--background-secondary)/0.5)] transition-colors">
            <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{account.name || account.walletAddress.slice(0, 12)}</p><Badge variant={account.isBanned ? "danger" : "secondary"}>{account.isBanned ? "Suspended" : account.role}</Badge>{account.isGithubVerified && <span className="text-xs text-[hsl(var(--success))]">GitHub @{account.githubUsername}</span>}</div><p className="mt-1 break-all font-mono text-[10px] text-[hsl(var(--foreground-subtle))]">{account.walletAddress}</p>{account.bannedReason && <p className="mt-1 text-xs text-[hsl(var(--destructive))]">{account.bannedReason}</p>}</div>
              {account.isBanned ? <Button size="sm" variant="outline" disabled={working === account.id} onClick={() => void unbanUser(account)}>{t("restore")}</Button> : <div className="flex w-full gap-2 sm:w-auto"><Input value={banReasons[account.id] ?? ""} maxLength={500} onChange={(event) => setBanReasons((current) => ({ ...current, [account.id]: event.target.value }))} placeholder={language === "vi" ? "Lý do tạm khóa" : "Reason to suspend"} className="h-8 text-xs" /><Button size="sm" variant="destructive" disabled={working === account.id || account.id === user.id} onClick={() => void banUser(account)}>{t("suspend")}</Button></div>}
            </div>
          </article>)}{users.length === 0 && <p className="p-8 text-center text-sm text-[hsl(var(--foreground-muted))]">{t("noAccounts")}</p>}</div>}
          <header className="border-t border-b border-[hsl(var(--border))] p-4 sm:p-5"><h2 className="font-semibold">Tasks</h2><p className="text-xs text-[hsl(var(--foreground-muted))]">Hide a task from the marketplace; the escrow is not touched.</p></header>
          <div className="divide-y divide-[hsl(var(--border))]">{issues.map((issue) => <article key={issue.id} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5"><div className="min-w-0"><p className="font-medium">{issue.title}</p><p className="text-xs text-[hsl(var(--foreground-muted))]">{issue.status}</p></div><div className="flex w-full gap-2 sm:w-auto"><Input value={hideReasons[issue.id] ?? ""} maxLength={500} onChange={(event) => setHideReasons((current) => ({ ...current, [issue.id]: event.target.value }))} placeholder="Reason to hide" className="h-8 text-xs" /><Button size="sm" variant="outline" disabled={working === issue.id} onClick={() => void setHidden(issue, true)}>Hide</Button><Button size="sm" variant="ghost" disabled={working === issue.id} onClick={() => void setHidden(issue, false)}>Unhide</Button></div></article>)}{issues.length === 0 && <p className="p-8 text-center text-sm text-[hsl(var(--foreground-muted))]">No tasks yet.</p>}</div>
        </section>

        <section className="overflow-hidden glass rounded-xl animate-fade-in">
          <header className="border-b border-[hsl(var(--border))] p-4 sm:p-5"><h2 className="font-semibold">{t("disputes")}</h2><p className="text-xs text-[hsl(var(--foreground-muted))]">{t("reviewDisputes")}</p></header>
          {loading ? <RowsSkeleton /> : <div className="divide-y divide-[hsl(var(--border))]">{disputes.map((dispute) => {
            const form = drafts[dispute.id] ?? { kind: "INITIAL" as const, clientPercent: "50", rationale: "" };
            const draft = rulings[dispute.issueId];
            const canDraft = ["DISPUTED", "CHALLENGED", "INITIAL_RULING"].includes(dispute.status);
            return <article key={dispute.id} className="space-y-3 p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">Dispute · {dispute.status.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-[hsl(var(--foreground-muted))]">{dispute.reason}</p></div><Link href={`/issues/${dispute.issueId}`} className="inline-flex shrink-0 items-center gap-1 text-xs text-[hsl(var(--ring))]">Task <ExternalLink className="h-3 w-3" /></Link></div>
              {dispute.suggestedClientBps != null && <p className="rounded-md bg-[hsl(var(--background-secondary))] p-2.5 text-xs">AI suggestion (reference only): <strong>{(dispute.suggestedClientBps / 100).toFixed(2)}% client</strong>{dispute.aiConfidenceScore != null && <span className="text-[hsl(var(--foreground-muted))]"> · {Math.round(dispute.aiConfidenceScore * 100)}% confidence</span>}</p>}
              {aiSummary(dispute.aiReport) && <p className="text-xs text-[hsl(var(--foreground-muted))]">AI summary: {aiSummary(dispute.aiReport)}</p>}
              {dispute.aiStatus && <p className="text-xs text-[hsl(var(--foreground-muted))]">AI status: {dispute.aiStatus}</p>}
              {dispute.aiReport && <details className="rounded-md border border-[hsl(var(--border))] p-3"><summary className="cursor-pointer text-xs font-medium">Review AI evidence report</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-4 text-[hsl(var(--foreground-muted))]">{(() => { try { return JSON.stringify(JSON.parse(dispute.aiReport), null, 2); } catch { return dispute.aiReport; } })()}</pre></details>}
              <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={working === dispute.id} onClick={() => void analyzeDispute(dispute)}>{dispute.aiReport ? "Reanalyze evidence" : "Analyze evidence with AI"}</Button><Button size="sm" variant="outline" disabled={working === dispute.issueId} onClick={() => void loadEvidence(dispute.issueId)}>Evidence files</Button></div>
              {(evidence[dispute.issueId] ?? []).map((view) => <div key={view.id} className="rounded-md border border-[hsl(var(--border))] p-2.5 text-xs"><p className="font-medium">{view.side} · {view.manifestHash.slice(0, 12)}…</p><ul className="mt-1 space-y-1">{view.files.map((file) => <li key={file.downloadUrl}><a className="text-[hsl(var(--ring))] underline" href={file.downloadUrl}>{file.name}</a> <span className="font-mono text-[10px]">{file.sha256.slice(0, 12)}…</span></li>)}{view.files.length === 0 && <li>No files</li>}</ul></div>)}
              {dispute.challengeDeadline && <p className="text-[10px] text-[hsl(var(--foreground-subtle))]">Challenge deadline: {new Date(dispute.challengeDeadline).toLocaleString()}</p>}
              {canDraft && <div className="space-y-2">
                <label htmlFor={`ruling-kind-${dispute.id}`} className="block text-xs">Ruling</label>
                <select id={`ruling-kind-${dispute.id}`} value={form.kind} onChange={(event) => setDrafts((current) => ({ ...current, [dispute.id]: { ...form, kind: event.target.value as "INITIAL" | "FINAL" } }))} className="h-9 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background-secondary))] px-2 text-xs">
                  <option value="INITIAL">Initial ruling</option><option value="FINAL">Final ruling</option>
                </select>
                <label htmlFor={`client-percent-${dispute.id}`} className="block text-xs">Client share (%)</label>
                <Input id={`client-percent-${dispute.id}`} type="number" min={0} max={100} step="0.01" value={form.clientPercent} onChange={(event) => setDrafts((current) => ({ ...current, [dispute.id]: { ...form, clientPercent: event.target.value } }))} />
                <textarea value={form.rationale} onChange={(event) => setDrafts((current) => ({ ...current, [dispute.id]: { ...form, rationale: event.target.value } }))} minLength={20} maxLength={10000} rows={3} placeholder="Rationale for the ruling (at least 20 characters)" className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background-secondary))] p-3 text-xs outline-none" />
                <Button size="sm" disabled={working === dispute.id || form.rationale.trim().length < 20} onClick={() => void draftRuling(dispute)}>Draft ruling</Button>
              </div>}
              {draft && <div className="space-y-2"><p className="text-xs">Decision hash: <span className="font-mono text-[10px] break-all">{draft.decisionHash}</span></p><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-[hsl(var(--background-secondary))] p-2 text-[10px]">{draft.safeTransactionJson}</pre><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => copyRuling(dispute.issueId)}>Copy</Button><Button size="sm" variant="outline" onClick={() => downloadRuling(dispute.issueId)}>Download ruling-{dispute.issueId}.json</Button></div></div>}
            </article>;
          })}{disputes.length === 0 && <p className="p-8 text-center text-sm text-[hsl(var(--foreground-muted))]">{t("noDisputes")}</p>}</div>}
          <p className="border-t border-[hsl(var(--border))] p-4 text-[10px] leading-4 text-[hsl(var(--warning))]">Rulings are sent from the escrow&apos;s arbiter Safe. Initial rulings have a 7-day challenge period; final rulings have a 24-hour notice period. Allocated funds must be claimed separately.</p>
        </section>
      </div>}
      </main>
    </div>
  );
}

function OpsPanel({ ops, onRefresh }: { ops: OpsData | null; onRefresh: () => void }) {
  return (
    <section className="mt-6 grid gap-5 xl:grid-cols-3 animate-fade-in">
      <div className="glass rounded-xl p-4"><div className="flex items-center justify-between"><h2 className="font-semibold">Indexer</h2><Button size="sm" variant="outline" onClick={onRefresh}>Refresh</Button></div>
        {(ops?.indexerStatus ?? []).map((row) => <p key={row.contractAddress} className="mt-2 text-xs">Block {row.lastScannedBlock} · lag {row.lagSeconds}s</p>)}
        {ops && ops.indexerStatus.length === 0 && <p className="mt-2 text-xs">No checkpoints yet.</p>}
        {(ops?.contractConfig ?? []).map((cfg) => (
          <div key={cfg.contractAddress} className="mt-3 border-t border-[hsl(var(--border))] pt-2">
            <p className="mt-2 text-xs">Contract {cfg.paused ? "Paused" : "Active"}</p>
            <p className="mt-2 text-xs">Arbiter: {cfg.arbiter}{cfg.pendingArbiter ? ` (pending: ${cfg.pendingArbiter})` : ""}</p>
            <p className="mt-2 text-xs">Fee recipient: {cfg.feeRecipient}{cfg.pendingFeeRecipient ? ` (pending: ${cfg.pendingFeeRecipient})` : ""}</p>
          </div>
        ))}
      </div>
      <div className="glass rounded-xl p-4"><h2 className="font-semibold">Open findings</h2>
        {(ops?.reconciliationFindings ?? []).map((finding) => <p key={finding.id} className="mt-2 text-xs break-all">{finding.kind} · block {finding.blockNumber}</p>)}
        {ops && ops.reconciliationFindings.length === 0 && <p className="mt-2 text-xs">No open findings.</p>}
      </div>
      <div className="glass rounded-xl p-4"><h2 className="font-semibold">Stuck transactions</h2>
        {(ops?.stuckIntents ?? []).map((intent) => <p key={intent.id} className="mt-2 text-xs">{intent.method} · {intent.status}</p>)}
        {ops && ops.stuckIntents.length === 0 && <p className="mt-2 text-xs">None older than 30 minutes.</p>}
      </div>
    </section>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div className="glass rounded-xl p-4 transition-all hover:border-[hsl(var(--primary)/0.3)]"><div className="flex items-center gap-2 text-xs text-[hsl(var(--foreground-muted))]">{icon}{label}</div><p className="mt-2 font-outfit text-2xl font-bold">{value.toLocaleString()}</p></div>;
}

function RowsSkeleton() {
  return <div className="space-y-3 p-5">{[0, 1, 2].map((row) => <div key={row} className="h-16 animate-pulse rounded-lg bg-[hsl(var(--muted))]" />)}</div>;
}
