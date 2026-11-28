"use client";

import { useToastState } from "@/lib/toast";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { graphqlRequest } from "@/lib/graphql-client";
import { useAuthStore } from "@/lib/store/use-auth-store";
import { Button } from "@/components/ui/button";
import { issueStatus } from "@/lib/issue-status";
import { AuthRequiredPanel } from "@/components/auth/auth-required-panel";
import { useUiPreferences } from "@/lib/ui-preferences";
import { dashboardQueryOptions } from "./dashboard-query";
import type { PreparedCall } from "@/lib/web3/send-prepared";
import type * as SendPrepared from "@/lib/web3/send-prepared";

const sendPreparedCalls: typeof SendPrepared.sendPreparedCalls = async (...args) => (await import("@/lib/web3/send-prepared")).sendPreparedCalls(...args);

const CLAIMABLE_QUERY = `query MyClaimable { myClaimable { amountRaw autoClaimPending } }`;
const PREPARE_CLAIM = `mutation PrepareClaim($recipient: String!) { prepareClaim(recipient: $recipient) { intentId method contractAddress data value } }`;
const RECORD_TX = `mutation RecordTx($id: ID!, $hash: String!) { recordTransactionSubmitted(intentId: $id, txHash: $hash) { id } }`;

// Escrow balances use six decimal places (USDC raw units).
const formatRaw = (raw: string) => (Number(raw) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 });

type Tab = "all" | "posted" | "working" | "applications";

const APPLICATION_STATUS: Record<string, { label: string; badge: string }> = {
  PENDING: { label: "Pending", badge: "b-prog" },
  ACCEPTED: { label: "Accepted", badge: "b-open" },
  REJECTED: { label: "Not selected", badge: "b-mut" },
  WITHDRAWN: { label: "Withdrawn", badge: "b-mut" },
};
const TABS = [["all", "All work"], ["posted", "Posted"], ["working", "Assigned to me"], ["applications", "Applications"]] as const;

export function DashboardView() {
  const user = useAuthStore((state) => state.user);
  const authStatus = useAuthStore((state) => state.status);
  const { theme } = useUiPreferences();
  const queryTab = useSearchParams().get("tab");
  const [tab, setTab] = useState<Tab>(queryTab === "bounties" ? "posted" : "all");
  useEffect(() => { setTab(queryTab === "bounties" ? "posted" : "all"); }, [queryTab]);
  const [, setError] = useToastState("error");
  const [autoClaimPending, setAutoClaimPending] = useState(false);
  const [claimable, setClaimable] = useState<string>("0");
  const [claiming, setClaiming] = useState(false);
  const [, setClaimNotice] = useToastState("success");

  const { data, error, isPending: loading } = useQuery(dashboardQueryOptions(user?.id));

  useEffect(() => {
    if (error) setError(error.message);
  }, [error, setError]);

  const loadClaimable = () => graphqlRequest<{ myClaimable: Array<{ amountRaw: string; autoClaimPending: boolean }> }>(CLAIMABLE_QUERY)
    .then((result) => { setAutoClaimPending(result.myClaimable.some((row) => row.autoClaimPending)); setClaimable(result.myClaimable.reduce((sum, row) => sum + BigInt(row.amountRaw), 0n).toString()); })
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

  const tasks = useMemo(() => (data?.myIssues ?? []).filter((task) => {
    if (tab === "posted") return task.clientId === user?.id;
    if (tab === "working") return task.developerId === user?.id;
    return tab !== "applications";
  }), [data, tab, user?.id]);
  const applications = tab === "all" || tab === "applications" ? data?.myApplications ?? [] : [];


  if (authStatus === "restoring") return <main className="wrap"><div className="content"><div className="h-32 animate-pulse rounded-lg bg-[var(--sunk)]" /></div></main>;
  if (!user) return <main className="mx-auto max-w-4xl px-4 py-16"><AuthRequiredPanel title="Your workspace is ready after wallet sign-in" description="Connect your wallet to see the bounties you posted, tasks assigned to you, and every application in one place." actionLabel="Connect wallet to open dashboard" /></main>;

  const stats = data ? [
    ["Posted", data.userStats.postedTasks],
    ["In progress", data.userStats.workingTasks],
    ["Completed", data.userStats.completedTasks],
    ["Applications", data.userStats.applications],
    ["Paid escrows", data.userStats.completedPayouts],
  ] as const : [];

  return (
    <div className={`br min-h-screen ${theme === "dark" ? "dark" : ""}`}>
      <div className="wrap">
        <main className="content" style={{ flexBasis: "100%", display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="ph">
            <div>
              <h1 className="h1">Dashboard</h1>
              <p className="sub">Track the work you posted and the tasks you applied for.</p>
            </div>
          </div>

          <div id="wallet">
            {BigInt(claimable) > 0n && (
              <section className="claim">
                <div>
                  <span className="lab">Available to withdraw</span>
                  <p className="mono claim-v">{formatRaw(claimable)} <small>USDC</small></p>
                  {autoClaimPending && <p className="claim-note">Sending to your wallet automatically…</p>}
                </div>
                <Button className="btn btn-p" disabled={claiming} onClick={() => void claimFunds()}>Withdraw funds</Button>
              </section>
            )}
          </div>

          {data && (
            <section className="tiles" aria-label="Your numbers">
              {stats.map(([label, value]) => (
                <div key={label} className="tile">
                  <span className="lab">{label}</span>
                  <span className="mono v">{value}</span>
                </div>
              ))}
            </section>
          )}

          <section className="list">
            <div className="dl-head">
              <h2>Work and applications</h2>
              <div className="seg" role="group" aria-label="Filter work">
                {TABS.map(([key, label]) => (
                  <button key={key} type="button" className={tab === key ? "on" : ""} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="space-y-3 p-4">{[0, 1, 2].map((key) => <div key={key} className="h-14 animate-pulse rounded-md bg-[var(--sunk)]" />)}</div>
            ) : (
              <>
                {applications.map((application) => {
                  const status = APPLICATION_STATUS[application.status] ?? { label: issueStatus(application.status).label, badge: issueStatus(application.status).badge };
                  return (
                    <Link key={application.id} href={`/issues/${application.issue.id}`} className="drow">
                      <div className="min-w-0">
                        <p className="drow-t">{application.issue.title}</p>
                        <p className="drow-m">Application · Client {application.issue.client.name || "Wallet user"} · Applied {new Date(application.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="drow-r">
                        <span className={`badge ${status.badge}`}>{status.label}</span>
                        <span className="mono drow-a">{application.issue.bountyAmount.toLocaleString()} <small>{application.issue.token.symbol}</small></span>
                        <ChevronRight className="drow-i" aria-hidden />
                      </div>
                    </Link>
                  );
                })}
                {tab === "applications" && !applications.length && <EmptyState title="No applications yet" text="Browse open tasks and send your first application." />}
                {tab !== "applications" && tasks.map((task) => {
                  const status = issueStatus(task.status);
                  return (
                    <Link key={task.id} href={`/issues/${task.id}`} className="drow">
                      <div className="min-w-0">
                        <p className="drow-t">{task.title}</p>
                        <p className="drow-m">{task.clientId === user.id ? "Posted" : "Assigned"} · <span className="capitalize">{task.category.replaceAll("_", " ").toLowerCase()}</span> · Updated {new Date(task.updatedAt).toLocaleDateString()}</p>
                      </div>
                      <div className="drow-r">
                        <span className={`badge ${status.badge}`}>{status.label}</span>
                        <span className="mono drow-a">{task.bountyAmount.toLocaleString()} <small>{task.token.symbol}</small></span>
                        <ChevronRight className="drow-i" aria-hidden />
                      </div>
                    </Link>
                  );
                })}
                {tab !== "applications" && !tasks.length && !applications.length && <EmptyState title="No tasks here yet" text="Create a bounty or apply for a task from the marketplace." />}
              </>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="font-semibold text-[var(--ink)]">{title}</p>
      <p className="mt-1 text-sm text-[var(--ink-3)]">{text}</p>
      <Link href="/marketplace" className="btn btn-o btn-sm mt-4">Explore marketplace</Link>
    </div>
  );
}
