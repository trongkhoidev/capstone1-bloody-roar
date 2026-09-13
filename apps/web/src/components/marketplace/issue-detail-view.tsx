"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, CalendarClock, Eye, MessageSquare, ShieldCheck, Users } from "lucide-react";
import { graphqlRequest } from "@/lib/graphql-client";
import { useAuthStore } from "@/lib/store/use-auth-store";
import { ChatRoom } from "@/components/chat/chat-room";
import { TestCasePanel } from "@/components/issues/test-case-panel";
import { IssueComments } from "@/components/marketplace/issue-comments";
import { Button } from "@/components/ui/button";
import { AuthRequiredPanel } from "@/components/auth/auth-required-panel";
import { MarketplaceEmpty } from "./marketplace-empty";
import { MOCK_ISSUES } from "./mock-issues";
import type { IssueItem } from "./issue-card";

const ISSUE_QUERY = `
  query IssueDetail($id: ID!) {
    issue(id: $id) {
      id title description category status bountyAmount requiredSkills difficulty timeEstimate
      expiresAt viewCount applicationCount createdAt clientId developerId
      token { symbol name }
      attachments { id fileName fileUrl fileMime }
      client { id name avatar walletAddress reputationScore isGithubVerified }
      developer { id name avatar walletAddress reputationScore isGithubVerified }
    }
  }
`;

const APPLICATIONS_QUERY = `
  query IssueApplications($issueId: String!) {
    applications(issueId: $issueId) {
      id status message createdAt
      developer { id name avatar walletAddress reputationScore isGithubVerified skills }
    }
  }
`;

const APPLY_MUTATION = `mutation Apply($input: ApplyToIssueInput!) { applyToIssue(input: $input) { id status } }`;
const ASSIGN_MUTATION = `mutation Assign($input: AssignDeveloperInput!) { assignDeveloper(input: $input) { id status developerId } }`;
const CANCEL_MUTATION = `mutation Cancel($id: ID!) { cancelIssue(id: $id) { id status } }`;
const DISPUTE_MUTATION = `mutation Dispute($input: RaiseDisputeInput!) { raiseDispute(input: $input) { id status } }`;
const SUBMISSIONS_QUERY = `query TaskSubmissions($issueId: String!) { submissions(issueId: $issueId) { id status description pullRequestUrl submittedAt reviewedAt reviewNotes developer { name walletAddress } } }`;
const SUBMIT_WORK = `mutation SubmitWork($input: SubmitWorkInput!) { submitWork(input: $input) { id status } }`;
const REVIEW_SUBMISSION = `mutation ReviewSubmission($input: ReviewSubmissionInput!) { reviewSubmission(input: $input) { id status } }`;

type IssueDetail = IssueItem & { clientId: string; developerId?: string | null; developer?: IssueItem["client"] | null };
type Application = { id: string; status: string; message?: string | null; createdAt: string; developer: IssueItem["client"] & { skills?: string[] } };

type DetailResponse = { issue: IssueDetail | null };
type ApplicationResponse = { applications: Application[] };
type Submission = { id: string; status: string; description?: string | null; pullRequestUrl?: string | null; submittedAt: string; reviewedAt?: string | null; reviewNotes?: string | null; developer: { name?: string | null; walletAddress: string } };
type SubmissionResponse = { submissions: Submission[] };

const CATEGORY_LABELS: Record<string, string> = {
  BUG_FIX: "Bug fix", FEATURE: "Feature", SMART_CONTRACT: "Smart contract", AUDIT: "Security & audit",
  UI_UX: "Frontend & design", DATA_SCIENCE: "AI & data", DEVOPS: "DevOps", DOCUMENTATION: "Documentation", OTHER: "Other",
};

export function IssueDetailView({ issueId }: { issueId: string }) {
  const user = useAuthStore((state) => state.user);
  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [applicationText, setApplicationText] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [deliveryDescription, setDeliveryDescription] = useState("");
  const [pullRequestUrl, setPullRequestUrl] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await graphqlRequest<DetailResponse>(ISSUE_QUERY, { id: issueId });
      setIssue(result.issue);
      setDemoMode(false);
    } catch (reason) {
      const demoIssue = MOCK_ISSUES.find((item) => item.id === issueId);
      if (demoIssue) {
        setIssue({ ...demoIssue, clientId: demoIssue.client.id, developerId: null });
        setDemoMode(true);
      }
      else setError(reason instanceof Error ? reason.message : "Could not load this task.");
    } finally {
      setIsLoading(false);
    }
  }, [issueId]);

  useEffect(() => { void load(); }, [load]);

  const isClient = Boolean(user && issue?.clientId === user.id);
  const isDeveloper = Boolean(user && issue?.developerId === user.id);
  const isAdmin = user?.role === "ADMIN";
  const canChat = Boolean(!demoMode && user && (isClient || isDeveloper || (isAdmin && issue?.status === "DISPUTED")));

  useEffect(() => {
    if (!isClient || !issue) return;
    let active = true;
    void graphqlRequest<ApplicationResponse>(APPLICATIONS_QUERY, { issueId })
      .then((result) => { if (active) setApplications(result.applications); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load applications."); });
    return () => { active = false; };
  }, [isClient, issue, issueId]);

  useEffect(() => {
    if (!canChat) return;
    let active = true;
    void graphqlRequest<SubmissionResponse>(SUBMISSIONS_QUERY, { issueId })
      .then((result) => { if (active) setSubmissions(result.submissions); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [canChat, issueId]);

  const submitDelivery = async (event: React.FormEvent) => {
    event.preventDefault(); setIsWorking(true); setError(null); setNotice(null);
    try {
      await graphqlRequest(SUBMIT_WORK, { input: { issueId, ...(deliveryDescription.trim() ? { description: deliveryDescription.trim() } : {}), ...(pullRequestUrl.trim() ? { pullRequestUrl: pullRequestUrl.trim() } : {}) } });
      setDeliveryDescription(""); setPullRequestUrl("");
      const refreshed = await graphqlRequest<SubmissionResponse>(SUBMISSIONS_QUERY, { issueId });
      setSubmissions(refreshed.submissions);
      setNotice("Work submitted for client review. Escrow release still requires the contract integration.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not submit work."); }
    finally { setIsWorking(false); }
  };

  const reviewDelivery = async (submissionId: string, approved: boolean) => {
    setIsWorking(true); setError(null); setNotice(null);
    try {
      await graphqlRequest(REVIEW_SUBMISSION, { input: { submissionId, approved, ...(reviewNotes.trim() ? { notes: reviewNotes.trim() } : {}) } });
      const refreshed = await graphqlRequest<SubmissionResponse>(SUBMISSIONS_QUERY, { issueId });
      setSubmissions(refreshed.submissions); setReviewNotes("");
      setNotice(approved ? "Delivery approved. The task remains open until on-chain escrow release is connected." : "Changes requested. The developer can submit a revised delivery.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not review delivery."); }
    finally { setIsWorking(false); }
  };

  const apply = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsWorking(true); setError(null); setNotice(null);
    try {
      await graphqlRequest(APPLY_MUTATION, { input: { issueId, ...(applicationText.trim() ? { message: applicationText.trim() } : {}) } });
      setNotice("Application sent. The client will be notified.");
      setApplicationText("");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not apply."); }
    finally { setIsWorking(false); }
  };

  const assign = async (applicationId: string) => {
    setIsWorking(true); setError(null); setNotice(null);
    try {
      await graphqlRequest(ASSIGN_MUTATION, { input: { issueId, applicationId } });
      setNotice("Developer selected. Contract deposit can be connected when the escrow module is ready.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not assign developer."); }
    finally { setIsWorking(false); }
  };

  const cancel = async () => {
    if (!window.confirm("Cancel this open task?")) return;
    setIsWorking(true); setError(null);
    try { await graphqlRequest(CANCEL_MUTATION, { id: issueId }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not cancel task."); }
    finally { setIsWorking(false); }
  };

  const raiseDispute = async (event: React.FormEvent) => {
    event.preventDefault(); setIsWorking(true); setError(null); setNotice(null);
    try {
      await graphqlRequest(DISPUTE_MUTATION, { input: { issueId, reason: disputeReason } });
      setNotice("Dispute recorded. On-chain escrow actions remain pending the contract integration.");
      setShowDisputeForm(false); setDisputeReason(""); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not open dispute."); }
    finally { setIsWorking(false); }
  };

  if (isLoading) return <div className="mx-auto max-w-5xl px-4 py-10"><div className="h-10 w-1/2 animate-pulse rounded bg-[hsl(var(--muted))]" /><div className="mt-6 h-64 animate-pulse rounded-2xl bg-[hsl(var(--card))]" /></div>;
  if (!issue) return <main className="mx-auto max-w-3xl px-4 py-16 text-center"><MarketplaceEmpty onResetFilters={() => { window.location.href = "/"; }} />{error && <p className="mt-4 text-sm text-[hsl(var(--destructive))]">{error}</p>}</main>;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 animate-fade-in">
      <Link href="/" className="inline-flex items-center gap-2 text-sm text-[hsl(var(--foreground-muted))] hover:text-[hsl(var(--foreground))]"><ArrowLeft className="h-4 w-4" /> Back to marketplace</Link>
      {demoMode && <p role="status" className="mt-4 rounded-lg border border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.08)] px-3 py-2 text-xs text-[hsl(var(--warning))]">This is a demo task because the API is unavailable. Actions are disabled until the database is connected.</p>}
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <article className="glass rounded-xl p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[hsl(var(--accent)/0.3)] bg-[hsl(var(--accent)/0.1)] px-3 py-1 text-xs font-semibold text-[hsl(var(--accent))]">{CATEGORY_LABELS[issue.category] ?? issue.category}</span>
              <span className="rounded-full bg-[hsl(var(--background-secondary))] px-3 py-1 text-xs text-[hsl(var(--foreground-muted))]">{issue.status.replaceAll("_", " ")}</span>
            </div>
            <h1 className="mt-4 font-outfit text-3xl font-extrabold leading-tight sm:text-4xl gradient-text">{issue.title}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-[hsl(var(--foreground-subtle))]">
              <span className="flex items-center gap-1.5"><Eye className="h-4 w-4" />{issue.viewCount} views</span>
              <span className="flex items-center gap-1.5"><Users className="h-4 w-4" />{issue.applicationCount ?? applications.length} applicants</span>
              <span className="flex items-center gap-1.5"><CalendarClock className="h-4 w-4" />Posted {new Date(issue.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="my-6 border-t border-[hsl(var(--border))]" />
            <div className="whitespace-pre-wrap break-words text-sm leading-7 text-[hsl(var(--foreground-muted))]">{issue.description}</div>
            {issue.attachments?.length ? <div className="mt-6 grid gap-3 sm:grid-cols-2">{issue.attachments.map((attachment) => <Image key={attachment.id} src={attachment.fileUrl} alt={attachment.fileName} width={960} height={540} unoptimized className="max-h-72 w-full rounded-lg border border-[hsl(var(--border))] object-cover" />)}</div> : null}
            <div className="mt-6 flex flex-wrap gap-2">
              {issue.requiredSkills.map((skill) => <span key={skill} className="rounded-md bg-[hsl(var(--background-secondary))] px-2.5 py-1 text-xs text-[hsl(var(--foreground-muted))]">{skill}</span>)}
            </div>
          </article>

          <IssueComments issueId={issue.id} demoMode={demoMode} />

          {isClient && issue.status === "OPEN" && applications.length > 0 && (
            <section className="glass rounded-xl p-5 sm:p-7">
              <h2 className="font-outfit text-xl font-bold">Applications <span className="text-sm font-medium text-[hsl(var(--foreground-subtle))">({applications.length})</span></h2>
              <div className="mt-4 space-y-3">
                {applications.map((application) => <article key={application.id} className="flex flex-col justify-between gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background-secondary)/0.5)] p-4 sm:flex-row sm:items-center hover:border-[hsl(var(--primary)/0.3)] transition-all">
                  <div className="min-w-0"><div className="flex items-center gap-2"><span className="font-semibold">{application.developer.name || application.developer.walletAddress.slice(0, 10)}</span>{application.developer.isGithubVerified && <ShieldCheck className="h-4 w-4 text-[hsl(var(--accent))]" />}</div><p className="mt-1 text-sm text-[hsl(var(--foreground-muted))]">{application.message || "No cover letter provided."}</p></div>
                  {application.status === "PENDING" && <Button size="sm" disabled={isWorking || demoMode} onClick={() => void assign(application.id)}>Select developer</Button>}
                </article>)}
              </div>
            </section>
          )}

          {!demoMode && <TestCasePanel issueId={issue.id} owner={isClient} issueStatus={issue.status} />}

          {isDeveloper && issue.status === "IN_PROGRESS" && (
            <section className="glass rounded-xl p-5 sm:p-7">
              <h2 className="font-outfit text-xl font-bold">Submit your work</h2>
              <p className="mt-1 text-sm text-[hsl(var(--foreground-muted))]">Share a short delivery summary and an optional GitHub pull request.</p>
              <form onSubmit={submitDelivery} className="mt-4 space-y-3">
                <textarea value={deliveryDescription} onChange={(event) => setDeliveryDescription(event.target.value)} maxLength={4000} rows={4} placeholder="What changed, and how can the client verify it?" className="w-full resize-y rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background-secondary))] p-3 text-sm outline-none focus:border-[hsl(var(--primary)/0.5)]" />
                <input type="url" value={pullRequestUrl} onChange={(event) => setPullRequestUrl(event.target.value)} placeholder="https://github.com/owner/repo/pull/123" className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background-secondary))] px-3 py-2.5 text-sm outline-none focus:border-[hsl(var(--primary)/0.5)]" />
                <Button type="submit" disabled={isWorking || demoMode || (!deliveryDescription.trim() && !pullRequestUrl.trim()) || submissions.some((item) => item.status === "SUBMITTED" || item.status === "UNDER_REVIEW")}>Submit for review</Button>
              </form>
            </section>
          )}

          {(isClient || isAdmin) && ["IN_PROGRESS", "DISPUTED"].includes(issue.status) && (
            <section className="glass rounded-xl p-5 sm:p-7">
              <h2 className="font-outfit text-xl font-bold">Work submissions</h2>
              {!submissions.length ? <p className="mt-3 text-sm text-[hsl(var(--foreground-muted))]">The developer has not submitted work yet.</p> : <div className="mt-4 space-y-3">
                {submissions.map((submission) => <article key={submission.id} className="rounded-lg border border-[hsl(var(--border))] p-4 hover:border-[hsl(var(--primary)/0.3)] transition-all">
                  <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold">{submission.developer.name || submission.developer.walletAddress.slice(0, 10)} · {new Date(submission.submittedAt).toLocaleString()}</span><span className="rounded-full bg-[hsl(var(--background-secondary))] px-2.5 py-1 text-[10px] font-semibold">{submission.status.replaceAll("_", " ")}</span></div>
                  {submission.description && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[hsl(var(--foreground-muted))]">{submission.description}</p>}
                  {submission.pullRequestUrl && <a href={submission.pullRequestUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm text-[hsl(var(--accent))] underline">Open GitHub pull request</a>}
                  {submission.reviewNotes && <p className="mt-3 rounded-lg bg-[hsl(var(--background-secondary))] p-3 text-xs text-[hsl(var(--foreground-muted))]">Review notes: {submission.reviewNotes}</p>}
                  {isClient && (submission.status === "SUBMITTED" || submission.status === "UNDER_REVIEW") && <div className="mt-4 space-y-2"><textarea value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} rows={2} maxLength={2000} placeholder="Optional review notes or requested changes" className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background-secondary))] p-3 text-xs outline-none" /><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={isWorking || demoMode} onClick={() => void reviewDelivery(submission.id, false)}>Request changes</Button><Button size="sm" disabled={isWorking || demoMode} onClick={() => void reviewDelivery(submission.id, true)}>Approve delivery</Button></div></div>}
                </article>)}
              </div>}
              <p className="mt-4 text-xs leading-5 text-[hsl(var(--warning))]">Approval is recorded off-chain. It does not move funds; contract release will be enabled after Kiên’s escrow integration.</p>
            </section>
          )}

          {canChat && issue.developerId && <ChatRoom issueId={issue.id} issueTitle={issue.title} readOnly={Boolean(isAdmin || issue.status !== "IN_PROGRESS")} />}
        </div>

        <aside className="space-y-4">
          <section className="glass rounded-xl p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--foreground-subtle))]">Bounty</p>
            <p className="mt-2 font-outfit text-3xl font-extrabold text-[hsl(var(--success))]">{issue.bountyAmount.toLocaleString()} <span className="text-sm uppercase">{issue.token.symbol}</span></p>
            <p className="mt-1 text-xs text-[hsl(var(--foreground-muted))]">Escrow is initiated after a developer is selected.</p>
            {issue.expiresAt && <p className="mt-3 text-xs text-[hsl(var(--foreground-muted))]">Deadline: {new Date(issue.expiresAt).toLocaleString()}</p>}
            <div className="my-4 border-t border-[hsl(var(--border))]" />
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[hsl(var(--secondary))] font-bold">{issue.client.avatar ? <Image src={issue.client.avatar} alt="" width={40} height={40} unoptimized className="h-full w-full object-cover" /> : issue.client.name?.[0] ?? "U"}</div>
              <div className="min-w-0"><p className="truncate text-sm font-semibold">{issue.client.name || "Client"}{issue.client.isGithubVerified && <ShieldCheck className="ml-1 inline h-4 w-4 text-[hsl(var(--accent))]" />}</p><p className="truncate font-mono text-[10px] text-[hsl(var(--foreground-subtle))">{issue.client.walletAddress}</p></div>
            </div>
            {issue.developer && <p className="mt-3 text-xs text-[hsl(var(--foreground-muted))]">Assigned to <strong>{issue.developer.name || issue.developer.walletAddress.slice(0, 10)}</strong></p>}
            {!user && issue.status === "OPEN" && <div className="mt-4"><AuthRequiredPanel compact title="Ready to apply?" description="Connect your wallet, then send your application to this bounty owner." actionLabel="Connect wallet to apply" /></div>}
            {user && !isClient && issue.status === "OPEN" && (user.role === "DEVELOPER" ? <form onSubmit={apply} className="mt-4 space-y-2"><textarea value={applicationText} onChange={(event) => setApplicationText(event.target.value)} maxLength={1000} rows={3} placeholder="Introduce yourself (optional)" className="w-full resize-y rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background-secondary))] p-3 text-xs outline-none focus:border-[hsl(var(--primary)/0.5)]" /><Button type="submit" className="w-full" disabled={isWorking || demoMode}><MessageSquare className="mr-2 h-4 w-4" />Apply to this task</Button></form> : <p className="mt-4 rounded-lg bg-[hsl(var(--background-secondary))] p-3 text-xs leading-5 text-[hsl(var(--foreground-muted))]">Only developer accounts can apply. Switch to the developer role in <Link className="font-medium text-[hsl(var(--primary))] underline" href="/profile">profile settings</Link>.</p>)}
            {isClient && issue.status === "OPEN" && <Button variant="outline" className="mt-3 w-full" disabled={isWorking || demoMode} onClick={() => void cancel()}>Cancel task</Button>}
            {canChat && issue.status === "IN_PROGRESS" && <Button variant="outline" className="mt-3 w-full" disabled={isWorking || demoMode} onClick={() => setShowDisputeForm((value) => !value)}>Raise a dispute</Button>}
            {showDisputeForm && <form onSubmit={raiseDispute} className="mt-3 space-y-2"><textarea value={disputeReason} onChange={(event) => setDisputeReason(event.target.value)} required minLength={20} maxLength={3000} rows={4} placeholder="Describe the issue and why this should be reviewed…" className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background-secondary))] p-3 text-xs outline-none" /><Button type="submit" variant="destructive" className="w-full" disabled={isWorking}>Open dispute record</Button></form>}
          </section>
          <section className="glass rounded-xl p-4 text-xs leading-5 text-[hsl(var(--foreground-muted))]">
            <p className="font-semibold text-[hsl(var(--warning))]">Escrow integration</p>
            <p className="mt-1">Selecting a developer records the assignment. Wallet deposit and release buttons appear after the contract interface is connected.</p>
          </section>
          {error && <p role="status" className="rounded-lg border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.08)] p-3 text-xs text-[hsl(var(--destructive))]">{error}</p>}
          {notice && <p role="status" className="rounded-lg border border-[hsl(var(--success)/0.3)] bg-[hsl(var(--success)/0.08)] p-3 text-xs text-[hsl(var(--success))]">{notice}</p>}
        </aside>
      </div>
    </main>
  );
}
