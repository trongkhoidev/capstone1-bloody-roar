"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Eye, MessageSquare, ShieldCheck, Users, ExternalLink, Clock } from "lucide-react";
import { graphqlRequest } from "@/lib/graphql-client";
import { useAuthStore } from "@/lib/store/use-auth-store";
import { ChatRoom } from "@/components/chat/chat-room";
import { TestCasePanel } from "@/components/issues/test-case-panel";
import { IssueComments } from "@/components/marketplace/issue-comments";
import { Button } from "@/components/ui/button";
import { AuthRequiredPanel } from "@/components/auth/auth-required-panel";
import { useUiPreferences } from "@/lib/ui-preferences";
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
  const { theme } = useUiPreferences();
  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [applicationText, setApplicationText] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeTxHash, setDisputeTxHash] = useState("");
  const [disputeEvidenceHash, setDisputeEvidenceHash] = useState("");
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [deliveryDescription, setDeliveryDescription] = useState("");
  const [pullRequestUrl, setPullRequestUrl] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "delivery" | "chat" | "escrow">("overview");
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
      } else {
        setError(reason instanceof Error ? reason.message : "Could not load this task.");
      }
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
      await graphqlRequest(SUBMIT_WORK, {
        input: {
          issueId,
          ...(deliveryDescription.trim() ? { description: deliveryDescription.trim() } : {}),
          ...(pullRequestUrl.trim() ? { pullRequestUrl: pullRequestUrl.trim() } : {}),
        },
      });
      setDeliveryDescription(""); setPullRequestUrl("");
      const refreshed = await graphqlRequest<SubmissionResponse>(SUBMISSIONS_QUERY, { issueId });
      setSubmissions(refreshed.submissions);
      setNotice("Work submitted for client review. Escrow release will be finalized on-chain.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not submit work."); }
    finally { setIsWorking(false); }
  };

  const reviewDelivery = async (submissionId: string, approved: boolean) => {
    setIsWorking(true); setError(null); setNotice(null);
    try {
      await graphqlRequest(REVIEW_SUBMISSION, {
        input: {
          submissionId,
          approved,
          ...(reviewNotes.trim() ? { notes: reviewNotes.trim() } : {}),
        },
      });
      const refreshed = await graphqlRequest<SubmissionResponse>(SUBMISSIONS_QUERY, { issueId });
      setSubmissions(refreshed.submissions); setReviewNotes("");
      setNotice(approved ? "Delivery approved. Client can now release escrow on-chain." : "Changes requested. The developer has been notified.");
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
      setNotice("Developer selected. You can now proceed to fund the escrow contract.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not assign developer."); }
    finally { setIsWorking(false); }
  };

  const cancel = async () => {
    if (!window.confirm("Cancel this open bounty?")) return;
    setIsWorking(true); setError(null);
    try { await graphqlRequest(CANCEL_MUTATION, { id: issueId }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not cancel bounty."); }
    finally { setIsWorking(false); }
  };

  const raiseDispute = async (event: React.FormEvent) => {
    event.preventDefault(); setIsWorking(true); setError(null); setNotice(null);
    try {
      await graphqlRequest(DISPUTE_MUTATION, { input: { issueId, reason: disputeReason, txHash: disputeTxHash, evidenceManifestHash: disputeEvidenceHash } });
      setNotice("Dispute transaction recorded. The arbiter will review the evidence.");
      setShowDisputeForm(false); setDisputeReason(""); setDisputeTxHash(""); setDisputeEvidenceHash(""); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not open dispute."); }
    finally { setIsWorking(false); }
  };

  if (isLoading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="h-8 w-48 animate-pulse rounded bg-[var(--sunk)] mb-6" />
        <div className="h-96 animate-pulse rounded-xl bg-[var(--surface)]" />
      </main>
    );
  }

  if (!issue) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <MarketplaceEmpty onResetFilters={() => { window.location.href = "/marketplace"; }} />
        {error && <p className="mt-4 text-sm" style={{ color: "var(--bad)" }}>{error}</p>}
      </main>
    );
  }

  const devShare = (issue.bountyAmount * 0.975).toFixed(2);
  const platformFee = (issue.bountyAmount * 0.025).toFixed(2);

  const statusBadgeClass =
    issue.status === "OPEN"
      ? "b-open"
      : issue.status === "IN_PROGRESS"
      ? "b-prog"
      : issue.status === "COMPLETED"
      ? "b-open"
      : issue.status === "DISPUTED"
      ? "b-bad"
      : "b-mut";

  return (
    <div className={`br ${theme === "dark" ? "dark" : ""}`}>
      <main className="wrap">
        <div className="content" style={{ flexBasis: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Breadcrumbs */}
          <div style={{ fontSize: "12.5px", color: "var(--ink-3)" }}>
            <Link href="/marketplace" style={{ color: "var(--ink-2)", display: "inline-flex", alignItems: "center", gap: 4 }}>
              <ArrowLeft style={{ width: 13, height: 13 }} /> Bounties
            </Link>{" "}
            / <span className="mono">BR-{issue.id.slice(0, 6)}</span> / Workroom
          </div>

          {/* Page Header */}
          <div className="ph">
            <div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <h1 className="h1" style={{ fontSize: 24 }}>{issue.title}</h1>
                <span className={`badge ${statusBadgeClass}`}>
                  {issue.status.replaceAll("_", " ")}
                </span>
              </div>
              <p className="sub">
                Client <b>{issue.client.name || "Client"}</b> ·{" "}
                {issue.developer ? (
                  <>Developer <b>{issue.developer.name || issue.developer.walletAddress.slice(0, 8)}</b></>
                ) : (
                  "Accepting applications"
                )}
                {" · "}
                <span className="mono" style={{ color: "var(--ink-3)" }}>BR-{issue.id.slice(0, 8)}</span>
              </p>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span className="cd">
                <Clock className="ico" style={{ width: 14, height: 14 }} />
                Deadline: {issue.expiresAt ? new Date(issue.expiresAt).toLocaleDateString() : "Flexible"}
              </span>
              <span className="cd hot">2.5% fee on release</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "overview"}
              className={activeTab === "overview" ? "on" : ""}
              onClick={() => setActiveTab("overview")}
            >
              Overview &amp; Scope
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "delivery"}
              className={activeTab === "delivery" ? "on" : ""}
              onClick={() => setActiveTab("delivery")}
            >
              Delivery &amp; Submissions {submissions.length > 0 && <span className="mono">({submissions.length})</span>}
            </button>
            {canChat && (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "chat"}
                className={activeTab === "chat" ? "on" : ""}
                onClick={() => setActiveTab("chat")}
              >
                Bounty Chat
              </button>
            )}
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "escrow"}
              className={activeTab === "escrow" ? "on" : ""}
              onClick={() => setActiveTab("escrow")}
            >
              Escrow terms
            </button>
          </div>

          {/* Notices & Banners */}
          {notice && <div className="banner bn-info"><div><b>Notice:</b> {notice}</div></div>}
          {error && <div className="banner bn-bad"><div><b>Error:</b> {error}</div></div>}
          {demoMode && (
            <div className="banner bn-warn">
              <div><b>Demo task:</b> Database is offline. UI operates in local simulation mode.</div>
            </div>
          )}

          {/* Main 2-column Grid */}
          <div className="cols">
            {/* Left Content Area */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
              {/* TAB 1: OVERVIEW */}
              {activeTab === "overview" && (
                <>
                  <section className="card">
                    <div className="card-h">
                      <h2>Task Description &amp; Requirements</h2>
                      <span className="badge b-info" style={{ marginLeft: "auto" }}>
                        {CATEGORY_LABELS[issue.category] ?? issue.category}
                      </span>
                    </div>
                    <div className="card-b">
                      <div style={{ whiteSpace: "pre-wrap", color: "var(--ink-2)", lineHeight: 1.65 }}>
                        {issue.description}
                      </div>

                      {issue.attachments?.length ? (
                        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginTop: 12 }}>
                          {issue.attachments.map((att) => (
                            <Image
                              key={att.id}
                              src={att.fileUrl}
                              alt={att.fileName}
                              width={480}
                              height={270}
                              unoptimized
                              style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)" }}
                            />
                          ))}
                        </div>
                      ) : null}

                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                        {issue.requiredSkills.map((skill) => (
                          <span key={skill} className="tag">
                            {skill}
                          </span>
                        ))}
                      </div>

                      <div style={{ display: "flex", gap: 16, fontSize: "12.5px", color: "var(--ink-3)", marginTop: 8, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Eye className="ico" style={{ width: 14, height: 14 }} /> {issue.viewCount} views</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Users className="ico" style={{ width: 14, height: 14 }} /> {issue.applicationCount ?? applications.length} applicants</span>
                        <span>Posted on {new Date(issue.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </section>

                  {/* Client: Review Applicants */}
                  {isClient && issue.status === "OPEN" && applications.length > 0 && (
                    <section className="card">
                      <div className="card-h">
                        <h2>Review Applicants</h2>
                        <span className="badge b-open" style={{ marginLeft: "auto" }}>{applications.length} pending</span>
                      </div>
                      <div className="card-b">
                        {applications.map((app) => (
                          <div
                            key={app.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 12,
                              padding: "12px 14px",
                              border: "1px solid var(--line)",
                              borderRadius: 6,
                              background: "var(--surface-2)",
                              alignItems: "center",
                              flexWrap: "wrap",
                            }}
                          >
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <b>{app.developer.name || app.developer.walletAddress.slice(0, 10)}</b>
                                {app.developer.isGithubVerified && <ShieldCheck className="ico" style={{ color: "var(--ok)", width: 15, height: 15 }} />}
                                <span className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>
                                  {app.developer.reputationScore} rep
                                </span>
                              </div>
                              <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "var(--ink-2)" }}>
                                {app.message || "No cover letter provided."}
                              </p>
                            </div>
                            {app.status === "PENDING" && (
                              <button
                                type="button"
                                className="btn btn-p btn-sm"
                                disabled={isWorking || demoMode}
                                onClick={() => void assign(app.id)}
                              >
                                Select developer
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {!demoMode && <TestCasePanel issueId={issue.id} owner={isClient} issueStatus={issue.status} />}
                  <IssueComments issueId={issue.id} demoMode={demoMode} />
                </>
              )}

              {/* TAB 2: DELIVERY & SUBMISSIONS */}
              {activeTab === "delivery" && (
                <>
                  {/* Developer: Submit work */}
                  {isDeveloper && issue.status === "IN_PROGRESS" && (
                    <section className="card">
                      <div className="card-h">
                        <h2>Submit your delivery</h2>
                        <span className="badge b-prog" style={{ marginLeft: "auto" }}>Awaiting submission</span>
                      </div>
                      <div className="card-b">
                        <p style={{ color: "var(--ink-2)", fontSize: "13px", margin: 0 }}>
                          Submit your pull request link and verification notes. The client will review against the contract terms.
                        </p>
                        <form onSubmit={submitDelivery} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                          <textarea
                            className="inp"
                            style={{ height: 90, padding: 10, resize: "vertical" }}
                            value={deliveryDescription}
                            onChange={(e) => setDeliveryDescription(e.target.value)}
                            placeholder="Summary of changes and test instructions..."
                          />
                          <input
                            type="url"
                            className="inp"
                            value={pullRequestUrl}
                            onChange={(e) => setPullRequestUrl(e.target.value)}
                            placeholder="https://github.com/org/repo/pull/123"
                          />
                          <button
                            type="submit"
                            className="btn btn-p"
                            style={{ alignSelf: "flex-start" }}
                            disabled={isWorking || demoMode || (!deliveryDescription.trim() && !pullRequestUrl.trim())}
                          >
                            Submit for review
                          </button>
                        </form>
                      </div>
                    </section>
                  )}

                  {/* Submissions list */}
                  <section className="card">
                    <div className="card-h">
                      <h2>Work Submissions</h2>
                      <span className="badge b-mut" style={{ marginLeft: "auto" }}>{submissions.length} total</span>
                    </div>
                    <div className="card-b">
                      {submissions.length === 0 ? (
                        <p style={{ color: "var(--ink-3)", margin: 0 }}>No delivery submitted yet.</p>
                      ) : (
                        submissions.map((sub, idx) => (
                          <div
                            key={sub.id}
                            style={{
                              border: "1px solid var(--line)",
                              borderRadius: 6,
                              padding: 14,
                              background: "var(--surface)",
                              display: "flex",
                              flexDirection: "column",
                              gap: 10,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontWeight: 600, fontSize: "13.5px" }}>
                                Delivery v{submissions.length - idx}
                              </span>
                              <span className="badge b-open">{sub.status.replaceAll("_", " ")}</span>
                            </div>

                            {sub.pullRequestUrl && (
                              <div className="pr">
                                <span className="mono" style={{ fontSize: 13, color: "var(--link)" }}>
                                  <ExternalLink className="ico" style={{ width: 14, height: 14, display: "inline" }} /> {sub.pullRequestUrl}
                                </span>
                              </div>
                            )}

                            {sub.description && (
                              <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 13, whiteSpace: "pre-wrap" }}>
                                {sub.description}
                              </p>
                            )}

                            {sub.reviewNotes && (
                              <div style={{ background: "var(--surface-2)", padding: 10, borderRadius: 6, fontSize: 12.5, color: "var(--ink-2)" }}>
                                <b>Review notes:</b> {sub.reviewNotes}
                              </div>
                            )}

                            {isClient && issue.status === "IN_PROGRESS" && (sub.status === "SUBMITTED" || sub.status === "UNDER_REVIEW") && (
                              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                                <textarea
                                  className="inp"
                                  style={{ height: 60, padding: 8 }}
                                  value={reviewNotes}
                                  onChange={(e) => setReviewNotes(e.target.value)}
                                  placeholder="Review notes or requested fixes..."
                                />
                                <div style={{ display: "flex", gap: 8 }}>
                                  <button
                                    type="button"
                                    className="btn btn-o btn-sm"
                                    disabled={isWorking || demoMode}
                                    onClick={() => void reviewDelivery(sub.id, false)}
                                  >
                                    Request changes
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ok btn-sm"
                                    disabled={isWorking || demoMode}
                                    onClick={() => void reviewDelivery(sub.id, true)}
                                  >
                                    Approve delivery
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                </>
              )}

              {/* TAB 3: CHAT */}
              {activeTab === "chat" && canChat && issue.developerId && (
                <section className="card">
                  <div className="card-h">
                    <h2>Bounty Room</h2>
                    <span style={{ fontSize: "12px", color: "var(--ink-3)", marginLeft: "auto" }}>
                      Encrypted &amp; AI-guarded communication
                    </span>
                  </div>
                  <div style={{ padding: 14 }}>
                    <ChatRoom
                      issueId={issue.id}
                      issueTitle={issue.title}
                      readOnly={Boolean(isAdmin || issue.status !== "IN_PROGRESS")}
                    />
                  </div>
                </section>
              )}

              {/* TAB 4: ESCROW TERMS */}
              {activeTab === "escrow" && (
                <section className="card">
                  <div className="card-h">
                    <h2>Escrow Contract Rules &amp; Breakdown</h2>
                    <span className="badge b-info" style={{ marginLeft: "auto" }}>Base Sepolia</span>
                  </div>
                  <div className="card-b">
                    <div className="calldata">
                      <dl className="kv">
                        <dt>Escrow ID</dt>
                        <dd className="mono">BR-{issue.id.slice(0, 12)}</dd>
                        <dt>Total Locked</dt>
                        <dd className="mono" style={{ color: "var(--gold)", fontWeight: 600 }}>
                          {issue.bountyAmount.toLocaleString()} USDC
                        </dd>
                        <dt>Developer Net (97.5%)</dt>
                        <dd className="mono">{devShare} USDC</dd>
                        <dt>Platform Fee (2.5%)</dt>
                        <dd className="mono">{platformFee} USDC</dd>
                        <dt>Review Timeout</dt>
                        <dd className="mono">+7 days after delivery deadline</dd>
                        <dt>Dispute Window</dt>
                        <dd className="mono">72 hours evidence window</dd>
                      </dl>
                    </div>

                    <div className="banner bn-info" style={{ marginTop: 8 }}>
                      <div>
                        <b>On-chain guarantee:</b> Funds are held in the BloodyRoarEscrow smart contract. Neither
                        the client nor the platform can withdraw unilaterally once funded.
                      </div>
                    </div>
                  </div>
                </section>
              )}
            </div>

            {/* Right Sidebar Column */}
            <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Escrow Lock Card */}
              <section className="escrow" aria-label="Escrow summary">
                <div className="esc-top">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="lab" style={{ color: "var(--gold)" }}>Escrow Bounty</span>
                    <span className={`badge ${statusBadgeClass}`}>{issue.status.replaceAll("_", " ")}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginTop: 6 }}>
                    <span className="big mono">{issue.bountyAmount.toLocaleString()}</span>
                    <span className="mono" style={{ color: "var(--gold)" }}>{issue.token.symbol}</span>
                  </div>
                </div>

                <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                  <div className="bd" role="img" aria-label="Developer 97.5 percent, fee 2.5 percent">
                    <i style={{ width: "97.5%", background: "var(--ok)" }} />
                    <i style={{ width: "2.5%", background: "var(--ink-3)" }} />
                  </div>
                  <div className="legend">
                    <span><i style={{ background: "var(--ok)" }} /> Developer: <b className="mono">{devShare}</b></span>
                    <span><i style={{ background: "var(--ink-3)" }} /> Fee: <b className="mono">{platformFee}</b></span>
                  </div>

                  {/* Actions for Client */}
                  {isClient && issue.status === "OPEN" && (
                    <Button variant="outline" className="w-full" disabled={isWorking || demoMode} onClick={() => void cancel()}>
                      Cancel bounty
                    </Button>
                  )}

                  {/* Actions for Developer */}
                  {!user && issue.status === "OPEN" && (
                    <AuthRequiredPanel
                      compact
                      title="Ready to apply?"
                      description="Connect your wallet to submit an application."
                      actionLabel="Connect wallet"
                    />
                  )}

                  {user && !isClient && issue.status === "OPEN" && (
                    user.role === "DEVELOPER" ? (
                      <form onSubmit={apply} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <textarea
                          className="inp"
                          style={{ height: 68, padding: 8, fontSize: 12.5 }}
                          value={applicationText}
                          onChange={(e) => setApplicationText(e.target.value)}
                          placeholder="Why are you a good fit? (optional)"
                        />
                        <button type="submit" className="btn btn-p" disabled={isWorking || demoMode}>
                          <MessageSquare className="ico" style={{ width: 14, height: 14 }} /> Apply to this task
                        </button>
                      </form>
                    ) : (
                      <p style={{ fontSize: 12, color: "var(--ink-3)", margin: 0 }}>
                        Switch to Developer role in <Link href="/profile" style={{ color: "var(--link)" }}>profile</Link> to apply.
                      </p>
                    )
                  )}

                  {canChat && issue.status === "IN_PROGRESS" && (
                    <button
                      type="button"
                      className="btn btn-o btn-sm"
                      onClick={() => setShowDisputeForm((val) => !val)}
                    >
                      Raise dispute
                    </button>
                  )}

                  {showDisputeForm && (
                    <form onSubmit={raiseDispute} style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                      <textarea
                        className="inp"
                        style={{ height: 70, padding: 8, fontSize: 12 }}
                        value={disputeReason}
                        onChange={(e) => setDisputeReason(e.target.value)}
                        required
                        minLength={20}
                        placeholder="State dispute reason clearly..."
                      />
                      <input
                        className="inp"
                        style={{ height: 32, fontSize: 12 }}
                        placeholder="Tx hash (0x...)"
                        required
                        value={disputeTxHash}
                        onChange={(e) => setDisputeTxHash(e.target.value)}
                      />
                      <input
                        className="inp"
                        style={{ height: 32, fontSize: 12 }}
                        placeholder="Evidence hash (0x...)"
                        required
                        value={disputeEvidenceHash}
                        onChange={(e) => setDisputeEvidenceHash(e.target.value)}
                      />
                      <button type="submit" className="btn btn-bad btn-sm" disabled={isWorking}>
                        Confirm dispute
                      </button>
                    </form>
                  )}
                </div>
              </section>

              {/* Members Panel */}
              <section className="panel">
                <div className="panel-h">Members</div>
                <div className="panel-b members">
                  <div className="mem">
                    <span className="av av1">CL</span>
                    <span style={{ fontSize: 13 }}>
                      <b>{issue.client.name || "Client"}</b>{" "}
                      <span style={{ color: "var(--ink-3)" }}>· client</span>
                    </span>
                    <span className="online" title="Online" />
                  </div>

                  {issue.developer && (
                    <div className="mem">
                      <span className="av av2">DV</span>
                      <span style={{ fontSize: 13 }}>
                        <b>{issue.developer.name || issue.developer.walletAddress.slice(0, 8)}</b>{" "}
                        <span style={{ color: "var(--ink-3)" }}>· developer</span>
                      </span>
                      <span className="online" title="Online" />
                    </div>
                  )}

                  <p style={{ fontSize: 11.5, color: "var(--ink-3)", margin: "4px 0 0 0" }}>
                    The arbiter enters this workroom only if a dispute is formally submitted.
                  </p>
                </div>
              </section>

              {/* What you are agreeing to */}
              <section className="panel note">
                <div className="panel-h">Escrow agreement</div>
                <div className="panel-b">
                  <ol className="steps">
                    <li><b>24 h</b> client funding reservation</li>
                    <li><b>+7 days</b> review window after deadline</li>
                    <li><b>72 h</b> dispute evidence submission</li>
                  </ol>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
