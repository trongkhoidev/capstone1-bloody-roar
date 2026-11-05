"use client";

import { useCallback, useEffect, useState } from "react";
import { io } from "socket.io-client";
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
import type { IssueItem } from "./issue-card";
import { sendPreparedCalls } from "@/lib/web3/send-prepared";
import { signFundingIntent } from "@/lib/web3/funding-intent";
import { uploadFile } from "@/lib/upload";

// Date input value (YYYY-MM-DD) seven days out; the contract deadline is the end of that day in UTC.
const defaultDeliveryDeadline = () => new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

const ISSUE_QUERY = `
  query IssueDetail($id: ID!) {
    issue(id: $id) {
      id title description category status bountyAmount { formatted } requiredSkills difficulty timeEstimate
      expiresAt viewCount applicationCount createdAt clientId developerId
      viewerCapabilities { canApply canSelect canFund canSubmit canRelease canRequestChanges canDispute canProposeSettlement canRevokeSettlement canAcceptSettlement canSubmitEvidence canChallengeRuling canFinalizeRuling canFinalizeArbiterTimeoutSplit canClaimMissedDeliveryRefund canClaimReviewTimeout }
      escrow { availableActions { action reasonDisabled } }
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

const MY_APPLICATIONS_QUERY = `
  query MyApplications {
    myApplications {
      id
      issueId
      status
      message
    }
  }
`;

const APPLY_MUTATION = `mutation Apply($input: ApplyToIssueInput!) { applyToIssue(input: $input) { id status } }`;
const WITHDRAW_APPLICATION = `mutation WithdrawApp($id: ID!) { withdrawApplication(id: $id) { id status } }`;
const REJECT_APPLICATION = `mutation RejectApp($id: ID!) { rejectApplication(id: $id) { id status } }`;
const UPDATE_ISSUE = `mutation UpdateIssue($input: UpdateIssueInput!) { updateIssue(input: $input) { id title description category status bountyAmount { formatted } } }`;
const SELECT_DEVELOPER = `mutation SelectDeveloper($issue: ID!, $application: ID!, $deadline: String!) { selectDeveloper(issueId: $issue, applicationId: $application, deliveryDeadline: $deadline) { id status escrowKey termsHash amountRaw deliveryDeadline } }`;
const RESERVATION_QUERY = `query Reservation($issueId: ID!) { reservation(issueId: $issueId) { id status chainId contractAddress tokenAddress escrowKey termsHash amountRaw deliveryDeadline clientWallet developerWallet } }`;
const SUBMIT_FUNDING_INTENT = `mutation FundingIntent($id: ID!, $signature: String!, $nonce: String!, $expiry: String!) { submitFundingIntent(reservationId: $id, signature: $signature, nonce: $nonce, intentExpiry: $expiry) { id } }`;
const PREPARE_DEPOSIT = `mutation PrepareDeposit($id: ID!) { prepareEscrowDeposit(reservationId: $id) { steps { intentId method contractAddress data value } } }`;
const CANCEL_RESERVATION = `mutation CancelReservation($id: ID!) { cancelReservation(reservationId: $id) { id status } }`;
const RECORD_TX = `mutation RecordTx($id: ID!, $hash: String!) { recordTransactionSubmitted(intentId: $id, txHash: $hash) { id } }`;
const CREATE_DRAFT = `mutation CreateDraft($issue: ID!, $description: String!, $pullRequestUrl: String, $commitSha: String, $files: [ID!]) { createSubmissionDraft(issueId: $issue, description: $description, pullRequestUrl: $pullRequestUrl, commitSha: $commitSha, attachmentIds: $files) { id } }`;
const PREPARE_SUBMIT = `mutation PrepareSubmit($id: ID!) { prepareSubmitWork(submissionId: $id) { intentId method contractAddress data value } }`;
const PREPARE_RELEASE = `mutation PrepareRelease($id: ID!) { prepareReleaseFunds(issueId: $id) { intentId method contractAddress data value } }`;
const REQUEST_CHANGES = `mutation RequestChanges($id: ID!, $notes: String!) { requestChanges(submissionId: $id, notes: $notes) { changesRequested } }`;
const CREATE_EVIDENCE = `mutation CreateEvidence($issue: ID!, $statement: String!, $files: [ID!]) { createEvidenceManifest(issueId: $issue, statement: $statement, attachmentIds: $files) { id } }`;
const SUBMIT_COUNTERPARTY = `mutation PrepareCounterparty($issue: ID!, $manifest: ID!) { prepareSubmitCounterpartyEvidence(issueId: $issue, manifestId: $manifest) { intentId method contractAddress data value } }`;
const SUBMIT_REVIEW = `mutation SubmitReview($issue: ID!, $rating: Int!, $comment: String) { submitReview(issueId: $issue, rating: $rating, comment: $comment) { id } }`;
// Escrow actions the server allows for this viewer. Each row names the capability flag, the prepare mutation, and its arguments.
const ESCROW_ACTIONS: Array<{ action: string; flag: keyof ViewerCapabilities; label: string; mutation: string; field: string; needsPercent?: boolean }> = [
  { action: "revokeSettlement", flag: "canRevokeSettlement", label: "Revoke settlement", mutation: "mutation($issue: ID!) { prepareRevokeSettlement(issueId: $issue) { intentId method contractAddress data value } }", field: "prepareRevokeSettlement" },
  { action: "acceptSettlement", flag: "canAcceptSettlement", label: "Accept settlement", mutation: "mutation($issue: ID!) { prepareAcceptSettlement(issueId: $issue) { intentId method contractAddress data value } }", field: "prepareAcceptSettlement" },
  { action: "challengeRuling", flag: "canChallengeRuling", label: "Challenge ruling", mutation: "mutation($issue: ID!) { prepareChallengeRuling(issueId: $issue) { intentId method contractAddress data value } }", field: "prepareChallengeRuling" },
  { action: "finalizeRuling", flag: "canFinalizeRuling", label: "Finalize ruling", mutation: "mutation($issue: ID!) { prepareFinalizeRuling(issueId: $issue) { intentId method contractAddress data value } }", field: "prepareFinalizeRuling" },
  { action: "finalizeArbiterTimeoutSplit", flag: "canFinalizeArbiterTimeoutSplit", label: "Split after arbiter timeout", mutation: "mutation($issue: ID!) { prepareFinalizeArbiterTimeoutSplit(issueId: $issue) { intentId method contractAddress data value } }", field: "prepareFinalizeArbiterTimeoutSplit" },
  { action: "claimMissedDeliveryRefund", flag: "canClaimMissedDeliveryRefund", label: "Claim missed-delivery refund", mutation: "mutation($issue: ID!) { prepareClaimMissedDeliveryRefund(issueId: $issue) { intentId method contractAddress data value } }", field: "prepareClaimMissedDeliveryRefund" },
  { action: "claimReviewTimeout", flag: "canClaimReviewTimeout", label: "Claim review timeout", mutation: "mutation($issue: ID!) { prepareClaimReviewTimeout(issueId: $issue) { intentId method contractAddress data value } }", field: "prepareClaimReviewTimeout" },
  { action: "proposeSettlement", flag: "canProposeSettlement", label: "Propose settlement", mutation: "mutation($issue: ID!, $bps: Int!) { prepareProposeSettlement(issueId: $issue, clientBps: $bps) { intentId method contractAddress data value } }", field: "prepareProposeSettlement", needsPercent: true },
];
const PREPARE_RAISE_DISPUTE = `mutation PrepareRaise($issue: ID!, $manifest: ID!) { prepareRaiseDispute(issueId: $issue, manifestId: $manifest) { intentId method contractAddress data value } }`;
const CANCEL_MUTATION = `mutation Cancel($id: ID!) { cancelIssue(id: $id) { id status } }`;
const SUBMISSIONS_QUERY = `query TaskSubmissions($issueId: String!) { submissions(issueId: $issueId) { id status description pullRequestUrl submittedAt reviewedAt reviewNotes developer { name walletAddress } } }`;

type PreparedStep = { intentId: string; method: string; contractAddress: string; data: string; value: string };

type ReservationRow = { id: string; status: string; chainId: number; contractAddress: string; tokenAddress: string; escrowKey: string; termsHash: string; amountRaw: string; deliveryDeadline: string; clientWallet: string; developerWallet: string };

type ViewerCapabilities = { canApply?: boolean; canSelect: boolean; canFund: boolean; canSubmit: boolean; canRelease: boolean; canRequestChanges: boolean; canDispute: boolean; canProposeSettlement: boolean; canRevokeSettlement: boolean; canAcceptSettlement: boolean; canSubmitEvidence: boolean; canChallengeRuling: boolean; canFinalizeRuling: boolean; canFinalizeArbiterTimeoutSplit: boolean; canClaimMissedDeliveryRefund: boolean; canClaimReviewTimeout: boolean };
type IssueDetail = IssueItem & { clientId: string; developerId?: string | null; developer?: IssueItem["client"] | null; viewerCapabilities?: ViewerCapabilities | null; escrow?: { availableActions: Array<{ action: string; reasonDisabled: string | null }> } | null };
type Application = { id: string; status: string; message?: string | null; createdAt: string; developer: IssueItem["client"] & { skills?: string[] } };

type DetailResponse = { issue: (Omit<IssueDetail, "bountyAmount"> & { bountyAmount: { formatted: string } }) | null };

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
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [settlementPercent, setSettlementPercent] = useState("50");
  const [counterStatement, setCounterStatement] = useState("");
  const [deliveryFiles, setDeliveryFiles] = useState<string[]>([]);
  const [evidenceFiles, setEvidenceFiles] = useState<string[]>([]);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [deliveryDeadline, setDeliveryDeadline] = useState(defaultDeliveryDeadline);
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [deliveryDescription, setDeliveryDescription] = useState("");
  const [pullRequestUrl, setPullRequestUrl] = useState("");
  const [commitSha, setCommitSha] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "delivery" | "chat" | "escrow">("overview");
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [myApplication, setMyApplication] = useState<{ id: string; status: string; message?: string | null } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState("BUG_FIX");
  const [editBounty, setEditBounty] = useState<number>(0);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await graphqlRequest<DetailResponse>(ISSUE_QUERY, { id: issueId });
      if (result.issue) {
        setIssue({ ...result.issue, bountyAmount: Number(result.issue.bountyAmount.formatted) });
      } else {
        setIssue(null);
        setError("Không tìm thấy bài toán.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Không tìm thấy bài toán.");
    } finally {
      setIsLoading(false);
    }
  }, [issueId]);

  useEffect(() => { void load(); }, [load]);

  // Live refresh: the server emits escrow:invalidate to the task room when a confirmed transaction changes the escrow.
  useEffect(() => {
    if (!user) return;
    const socket = io({ withCredentials: true, transports: ["websocket"] });
    socket.emit("task:join", issueId);
    socket.on("escrow:invalidate", () => { void load(); });
    return () => { socket.disconnect(); };
  }, [user, issueId, load]);

  // Fallback after an on-chain action: refresh every 4 seconds, up to 30 times, while the chain confirms.
  const [chainPending, setChainPending] = useState(false);
  const awaitChain = useCallback(() => {
    setChainPending(true);
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      void load();
      if (tries >= 30) { window.clearInterval(timer); setChainPending(false); }
    }, 4000);
  }, [load]);

  const isClient = Boolean(user && issue?.clientId === user.id);
  // The server's availability entry for an action; absent means the action does not apply to this task right now.
  const actionOf = (name: string) => issue?.escrow?.availableActions.find((item) => item.action === name) ?? null;
  const actionEnabled = (name: string) => { const entry = actionOf(name); return Boolean(entry && !entry.reasonDisabled); };
  const reasonLine = (name: string) => { const reason = actionOf(name)?.reasonDisabled; return reason ? <p className="mut" style={{ fontSize: 12 }}>{reason}</p> : null; };
  // The card shows only when the server lists an action or evidence step for this viewer; the status check lives there.
  const escrowCardVisible = Boolean(issue?.viewerCapabilities?.canSubmitEvidence || ESCROW_ACTIONS.some((action) => issue?.viewerCapabilities?.[action.flag] && actionOf(action.action)));

  useEffect(() => {
    if (!isClient) return;
    let active = true;
    void graphqlRequest<{ reservation: ReservationRow | null }>(RESERVATION_QUERY, { issueId })
      .then((result) => { if (active) setReservationId(result.reservation?.status === "AWAITING_FUNDING" ? result.reservation.id : null); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [isClient, issueId]);
  const isDeveloper = Boolean(user && issue?.developerId === user.id);
  const isAdmin = user?.role === "ADMIN";
  const canChat = Boolean(user && (isClient || isDeveloper || (isAdmin && issue?.status === "DISPUTED")));

  useEffect(() => {
    if (!isClient || !issue) return;
    let active = true;
    void graphqlRequest<ApplicationResponse>(APPLICATIONS_QUERY, { issueId })
      .then((result) => { if (active) setApplications(result.applications); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load applications."); });
    return () => { active = false; };
  }, [isClient, issue, issueId]);

  useEffect(() => {
    if (!user || isClient || isAdmin) return;
    let active = true;
    void graphqlRequest<{ myApplications: Array<{ id: string; issueId: string; status: string; message?: string | null }> }>(MY_APPLICATIONS_QUERY)
      .then((result) => {
        if (active) {
          const app = result.myApplications?.find((a) => a.issueId === issueId) ?? null;
          setMyApplication(app);
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [user, isClient, isAdmin, issueId]);

  useEffect(() => {
    if (!canChat) return;
    let active = true;
    void graphqlRequest<SubmissionResponse>(SUBMISSIONS_QUERY, { issueId })
      .then((result) => { if (active) setSubmissions(result.submissions); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [canChat, issueId]);

  // Each on-chain step is recorded against its intent before its receipt is awaited (see sendPreparedCalls).
  const recordTx = async (intentId: string, txHash: string) => {
    await graphqlRequest(RECORD_TX, { id: intentId, hash: txHash });
  };

  // Uploads one file for this task and returns its attachment id; the server checks the uploader's role in the task.
  const attachFile = async (file: File, purpose: "DELIVERY" | "EVIDENCE") => {
    setUploadStatus(`Uploading ${file.name}…`);
    try {
      const { attachmentId } = await uploadFile(file, purpose, issueId);
      setUploadStatus(`${file.name} uploaded.`);
      return attachmentId;
    } catch (reason) {
      setUploadStatus(null);
      throw reason;
    }
  };

  const submitDelivery = async (event: React.FormEvent) => {
    event.preventDefault(); setIsWorking(true); setError(null); setNotice(null);
    try {
      const draft = await graphqlRequest<{ createSubmissionDraft: { id: string } }>(CREATE_DRAFT, {
        issue: issueId,
        description: deliveryDescription.trim(),
        pullRequestUrl: pullRequestUrl.trim() || null,
        commitSha: commitSha.trim() || null,
        files: deliveryFiles,
      });
      const prepared = await graphqlRequest<{ prepareSubmitWork: PreparedStep }>(PREPARE_SUBMIT, { id: draft.createSubmissionDraft.id });
      await sendPreparedCalls([prepared.prepareSubmitWork], recordTx, user!.walletAddress);
      setDeliveryDescription(""); setPullRequestUrl(""); setCommitSha(""); setDeliveryFiles([]); setUploadStatus(null);
      const refreshed = await graphqlRequest<SubmissionResponse>(SUBMISSIONS_QUERY, { issueId });
      setSubmissions(refreshed.submissions);
      setNotice("Work submitted on-chain. The client can review it now.");
      awaitChain();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not submit work."); }
    finally { setIsWorking(false); }
  };

  const reviewDelivery = async (submissionId: string, approved: boolean) => {
    setIsWorking(true); setError(null); setNotice(null);
    try {
      if (approved) {
        const prepared = await graphqlRequest<{ prepareReleaseFunds: PreparedStep }>(PREPARE_RELEASE, { id: issueId });
        await sendPreparedCalls([prepared.prepareReleaseFunds], recordTx, user!.walletAddress);
        setNotice("Escrow released on-chain. The developer can claim the payout.");
        awaitChain();
      } else {
        await graphqlRequest(REQUEST_CHANGES, { id: submissionId, notes: reviewNotes.trim() });
        setNotice("Changes requested. The developer has been notified.");
      }
      const refreshed = await graphqlRequest<SubmissionResponse>(SUBMISSIONS_QUERY, { issueId });
      setSubmissions(refreshed.submissions); setReviewNotes("");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not review delivery."); }
    finally { setIsWorking(false); }
  };

  // Runs one prepare mutation from ESCROW_ACTIONS: the server builds the call, the wallet sends it.
  const runEscrowAction = async (action: (typeof ESCROW_ACTIONS)[number], percent?: string) => {
    setIsWorking(true); setError(null); setNotice(null);
    try {
      const variables: Record<string, unknown> = action.needsPercent
        ? { issue: issueId, bps: Math.round(Number(percent) * 100) }
        : { issue: issueId };
      const prepared = await graphqlRequest<Record<string, PreparedStep>>(action.mutation, variables);
      await sendPreparedCalls([prepared[action.field]!], recordTx, user!.walletAddress);
      setNotice(`${action.label}: sent on-chain.`);
      awaitChain();
    } catch (reason) { setError(reason instanceof Error ? reason.message : `Could not ${action.label.toLowerCase()}.`); }
    finally { setIsWorking(false); }
  };

  const submitCounterpartyEvidence = async (event: React.FormEvent) => {
    event.preventDefault(); setIsWorking(true); setError(null); setNotice(null);
    try {
      const evidence = await graphqlRequest<{ createEvidenceManifest: { id: string } }>(CREATE_EVIDENCE, { issue: issueId, statement: counterStatement.trim(), files: [] });
      const prepared = await graphqlRequest<{ prepareSubmitCounterpartyEvidence: PreparedStep }>(SUBMIT_COUNTERPARTY, { issue: issueId, manifest: evidence.createEvidenceManifest.id });
      await sendPreparedCalls([prepared.prepareSubmitCounterpartyEvidence], recordTx, user!.walletAddress);
      setCounterStatement(""); setNotice("Counterparty evidence sent on-chain."); awaitChain();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not submit evidence."); }
    finally { setIsWorking(false); }
  };

  const submitReview = async (event: React.FormEvent) => {
    event.preventDefault(); setIsWorking(true); setError(null); setNotice(null);
    try {
      await graphqlRequest(SUBMIT_REVIEW, { issue: issueId, rating: reviewRating, comment: reviewComment.trim() || null });
      setNotice("Thanks for the review."); setReviewComment(""); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save the review."); }
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
      const myRes = await graphqlRequest<{ myApplications: Array<{ id: string; issueId: string; status: string; message?: string | null }> }>(MY_APPLICATIONS_QUERY).catch(() => null);
      if (myRes) setMyApplication(myRes.myApplications?.find((a) => a.issueId === issueId) ?? null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not apply."); }
    finally { setIsWorking(false); }
  };

  const withdraw = async (applicationId: string) => {
    setIsWorking(true); setError(null); setNotice(null);
    try {
      await graphqlRequest(WITHDRAW_APPLICATION, { id: applicationId });
      setNotice("Application withdrawn.");
      setMyApplication(null);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not withdraw application."); }
    finally { setIsWorking(false); }
  };

  const reject = async (applicationId: string) => {
    setIsWorking(true); setError(null); setNotice(null);
    try {
      await graphqlRequest(REJECT_APPLICATION, { id: applicationId });
      setNotice("Applicant rejected.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not reject applicant."); }
    finally { setIsWorking(false); }
  };

  const startEditing = () => {
    if (!issue) return;
    setEditTitle(issue.title);
    setEditDescription(issue.description);
    setEditCategory(issue.category);
    setEditBounty(issue.bountyAmount);
    setIsEditing(true);
  };

  const updateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issue) return;
    setIsWorking(true); setError(null); setNotice(null);
    try {
      const input: Record<string, unknown> = { id: issueId };
      const nextTitle = editTitle.trim();
      if (nextTitle !== issue.title) input.title = nextTitle;
      const nextDescription = editDescription.trim();
      if (nextDescription !== issue.description) input.description = nextDescription;
      if (editCategory !== issue.category) input.category = editCategory;
      if (Number(editBounty) !== Number(issue.bountyAmount)) input.bountyAmount = String(editBounty);

      await graphqlRequest(UPDATE_ISSUE, { input });
      setNotice("Task updated successfully.");
      setIsEditing(false);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update task."); }
    finally { setIsWorking(false); }
  };

  const assign = async (applicationId: string) => {
    setIsWorking(true); setError(null); setNotice(null);
    try {
      const result = await graphqlRequest<{ selectDeveloper: { id: string } }>(SELECT_DEVELOPER, {
        issue: issueId,
        application: applicationId,
        deadline: new Date(`${deliveryDeadline}T23:59:59Z`).toISOString(),
      });
      setReservationId(result.selectDeveloper.id);
      setNotice("Developer selected. Fund the escrow to start the work.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not select developer."); }
    finally { setIsWorking(false); }
  };

  // Client funding: sign the funding intent, submit it, then send the approve and deposit calls the server prepared.
  const fundEscrow = async () => {
    setIsWorking(true); setError(null); setNotice(null);
    try {
      const { reservation } = await graphqlRequest<{ reservation: ReservationRow | null }>(RESERVATION_QUERY, { issueId });
      if (!reservation) throw new Error("No funding reservation is waiting for this task.");
      const intent = await signFundingIntent(reservation, reservation.clientWallet, reservation.developerWallet);
      await graphqlRequest(SUBMIT_FUNDING_INTENT, { id: reservation.id, signature: intent.signature, nonce: intent.nonce, expiry: intent.intentExpiry });
      const prepared = await graphqlRequest<{ prepareEscrowDeposit: { steps: PreparedStep[] } }>(PREPARE_DEPOSIT, { id: reservation.id });
      await sendPreparedCalls(prepared.prepareEscrowDeposit.steps, recordTx, user!.walletAddress);
      setReservationId(null);
      setNotice("Escrow funded. The developer can start the work.");
      awaitChain();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not fund the escrow."); }
    finally { setIsWorking(false); }
  };

  // Client drops a reservation that is still waiting for funding.
  const cancelFunding = async () => {
    if (!reservationId) return;
    setIsWorking(true); setError(null); setNotice(null);
    try {
      await graphqlRequest(CANCEL_RESERVATION, { id: reservationId });
      setReservationId(null);
      setNotice("Reservation cancelled.");
      void load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not cancel the reservation."); }
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
      const evidence = await graphqlRequest<{ createEvidenceManifest: { id: string } }>(CREATE_EVIDENCE, { issue: issueId, statement: disputeReason.trim(), files: evidenceFiles });
      const prepared = await graphqlRequest<{ prepareRaiseDispute: PreparedStep }>(PREPARE_RAISE_DISPUTE, { issue: issueId, manifest: evidence.createEvidenceManifest.id });
      await sendPreparedCalls([prepared.prepareRaiseDispute], recordTx, user!.walletAddress);
      setNotice("Dispute opened on-chain. The arbiter will review the evidence.");
      setShowDisputeForm(false); setDisputeReason(""); setEvidenceFiles([]); setUploadStatus(null); awaitChain();
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
          {chainPending && <div className="banner bn-info"><div>Đang chờ chain xác nhận</div></div>}
          {error && <div className="banner bn-bad"><div><b>Error:</b> {error}</div></div>}

          {/* Main 2-column Grid */}
          <div className="cols">
            {/* Left Content Area */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
              {/* TAB 1: OVERVIEW */}
              {activeTab === "overview" && (
                <>
                  {isEditing ? (
                    <section className="card">
                      <div className="card-h">
                        <h2>Edit Bounty</h2>
                        <button type="button" className="btn btn-o btn-sm" onClick={() => setIsEditing(false)}>
                          Cancel
                        </button>
                      </div>
                      <div className="card-b">
                        <form onSubmit={updateTask} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 500 }}>
                            Title
                            <input
                              type="text"
                              className="inp"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              required
                            />
                          </label>
                          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 500 }}>
                            Category
                            <select
                              className="inp"
                              value={editCategory}
                              onChange={(e) => setEditCategory(e.target.value)}
                            >
                              {Object.keys(CATEGORY_LABELS).map((cat) => (
                                <option key={cat} value={cat}>
                                  {CATEGORY_LABELS[cat] ?? cat}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 500 }}>
                            Bounty Amount ({issue.token.symbol})
                            <input
                              type="number"
                              className="inp"
                              value={editBounty}
                              onChange={(e) => setEditBounty(Number(e.target.value))}
                              min={1}
                              required
                            />
                          </label>
                          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 500 }}>
                            Description
                            <textarea
                              className="inp"
                              style={{ minHeight: 120 }}
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              required
                            />
                          </label>
                          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                            <button type="button" className="btn btn-o" onClick={() => setIsEditing(false)}>
                              Cancel
                            </button>
                            <button type="submit" className="btn btn-p" disabled={isWorking}>
                              Save changes
                            </button>
                          </div>
                        </form>
                      </div>
                    </section>
                  ) : (
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
                  )}

                  {/* Client: Review Applicants */}
                  {isClient && (issue.status === "OPEN" || issue.status === "AWAITING_FUNDING") && applications.length > 0 && (
                    <section className="card">
                      <div className="card-h">
                        <h2>Review Applicants</h2>
                        <span className="badge b-open" style={{ marginLeft: "auto" }}>
                          {applications.filter((a) => a.status === "PENDING").length} pending
                        </span>
                      </div>
                      <div className="card-b">
                        {issue.status === "OPEN" && (
                          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, marginBottom: 12 }}>
                            Delivery deadline
                            <input
                              type="date"
                              className="inp"
                              style={{ height: 32, fontSize: 12 }}
                              value={deliveryDeadline}
                              min={new Date().toISOString().slice(0, 10)}
                              onChange={(e) => setDeliveryDeadline(e.target.value)}
                            />
                          </label>
                        )}
                        {reservationId && issue.viewerCapabilities?.canFund && (
                          <button
                            type="button"
                            className="btn btn-p btn-sm"
                            style={{ marginBottom: 12 }}
                            disabled={isWorking}
                            onClick={() => void fundEscrow()}
                          >
                            Fund escrow
                          </button>
                        )}
                        {reservationId && issue.viewerCapabilities?.canFund && (
                          <button type="button" className="btn btn-o btn-sm" style={{ marginBottom: 12 }} disabled={isWorking} onClick={() => void cancelFunding()}>
                            Hủy giữ chỗ
                          </button>
                        )}
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
                                {app.status === "REJECTED" && (
                                  <span className="badge b-closed" style={{ fontSize: 11 }}>Rejected</span>
                                )}
                                {app.status === "WITHDRAWN" && (
                                  <span className="badge b-closed" style={{ fontSize: 11 }}>Withdrawn</span>
                                )}
                              </div>
                              <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "var(--ink-2)" }}>
                                {app.message || "No cover letter provided."}
                              </p>
                            </div>
                            {app.status === "PENDING" && issue.status === "OPEN" && issue.viewerCapabilities?.canSelect && (
                              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <button
                                  type="button"
                                  className="btn btn-p btn-sm"
                                  disabled={isWorking}
                                  onClick={() => void assign(app.id)}
                                >
                                  Select developer
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-o btn-sm"
                                  style={{ color: "var(--err, #ef4444)", borderColor: "var(--err, #ef4444)" }}
                                  disabled={isWorking}
                                  onClick={() => void reject(app.id)}
                                >
                                  Reject
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  <TestCasePanel issueId={issue.id} owner={isClient} issueStatus={issue.status} />
                  <IssueComments issueId={issue.id} ownerId={issue.clientId} />
                </>
              )}

              {/* TAB 2: DELIVERY & SUBMISSIONS */}
              {activeTab === "delivery" && (
                <>
                  {/* Developer: Submit work */}
                  {isDeveloper && issue.status === "IN_PROGRESS" && issue.viewerCapabilities?.canSubmit && actionOf("submitWork") && (
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
                          <input
                            className="inp"
                            value={commitSha}
                            onChange={(e) => setCommitSha(e.target.value)}
                            placeholder="Mã commit (không bắt buộc)"
                          />
                          <label style={{ fontSize: 12 }}>
                            Attach files (optional)
                            <input
                              type="file"
                              multiple
                              style={{ display: "block", marginTop: 6, fontSize: 12 }}
                              disabled={isWorking}
                              onChange={async (e) => {
                                const picked = Array.from(e.target.files ?? []);
                                try {
                                  const ids = await Promise.all(picked.map((file) => attachFile(file, "DELIVERY")));
                                  setDeliveryFiles((current) => [...current, ...ids]);
                                } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not upload the file."); }
                                e.target.value = "";
                              }}
                            />
                            {deliveryFiles.length > 0 && <span className="mut"> {deliveryFiles.length} file(s) attached</span>}
                          </label>
                          {uploadStatus && <p className="mut" style={{ fontSize: 12 }}>{uploadStatus}</p>}
                          <button
                            type="submit"
                            className="btn btn-p"
                            style={{ alignSelf: "flex-start" }}
                            disabled={isWorking || !actionEnabled("submitWork") || (!deliveryDescription.trim() && !pullRequestUrl.trim() && deliveryFiles.length === 0)}
                            title={actionOf("submitWork")?.reasonDisabled ?? undefined}
                          >
                            Submit for review
                          </button>
                          {reasonLine("submitWork")}
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

                            {isClient && issue.status === "IN_PROGRESS" && issue.viewerCapabilities?.canRelease && actionOf("releaseFunds") && (sub.status === "SUBMITTED" || sub.status === "UNDER_REVIEW") && (
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
                                    disabled={isWorking}
                                    onClick={() => void reviewDelivery(sub.id, false)}
                                  >
                                    Request changes
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ok btn-sm"
                                    disabled={isWorking || !actionEnabled("releaseFunds")}
                                    title={actionOf("releaseFunds")?.reasonDisabled ?? undefined}
                                    onClick={() => void reviewDelivery(sub.id, true)}
                                  >
                                    Approve delivery
                                  </button>
                                  {reasonLine("releaseFunds")}
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
              {escrowCardVisible && (
                <section className="card">
                  <div className="card-h"><h2>Escrow actions</h2></div>
                  <div className="card-b" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {ESCROW_ACTIONS.filter((action) => issue.viewerCapabilities?.[action.flag] && actionOf(action.action)).map((action) => {
                      const disabled = isWorking || !actionEnabled(action.action);
                      const reason = actionOf(action.action)?.reasonDisabled;
                      return action.needsPercent ? (
                        <div key={action.flag} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <input className="inp" type="number" min={0} max={100} step="0.01" style={{ height: 32, width: 90, fontSize: 12 }} value={settlementPercent} onChange={(e) => setSettlementPercent(e.target.value)} aria-label="Client share (%)" />
                          <button type="button" className="btn btn-o btn-sm" disabled={disabled} title={reason ?? undefined} onClick={() => void runEscrowAction(action, settlementPercent)}>{action.label}</button>
                          {reason && <span className="mut" style={{ fontSize: 12 }}>{reason}</span>}
                        </div>
                      ) : (
                        <div key={action.flag} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <button type="button" className="btn btn-o btn-sm" disabled={disabled} title={reason ?? undefined} onClick={() => void runEscrowAction(action)}>{action.label}</button>
                          {reason && <span className="mut" style={{ fontSize: 12 }}>{reason}</span>}
                        </div>
                      );
                    })}
                    {issue.viewerCapabilities?.canSubmitEvidence && (
                      <form onSubmit={submitCounterpartyEvidence} style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
                        <textarea className="inp" rows={3} minLength={10} maxLength={5000} required value={counterStatement} onChange={(e) => setCounterStatement(e.target.value)} placeholder="Counterparty evidence statement (at least 10 characters)" />
                        <button type="submit" className="btn btn-o btn-sm" disabled={isWorking || counterStatement.trim().length < 10}>Submit counterparty evidence</button>
                      </form>
                    )}
                  </div>
                </section>
              )}
              {isClient && issue.status === "COMPLETED" && (
                <section className="card">
                  <div className="card-h"><h2>Review the developer</h2></div>
                  <form onSubmit={submitReview} className="card-b" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <label style={{ fontSize: 12 }}>Rating
                      <select className="inp" value={reviewRating} onChange={(e) => setReviewRating(Number(e.target.value))} style={{ height: 32, marginLeft: 8, fontSize: 12 }}>
                        {[5, 4, 3, 2, 1].map((stars) => <option key={stars} value={stars}>{stars} stars</option>)}
                      </select>
                    </label>
                    <textarea className="inp" rows={3} maxLength={2000} value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="Optional comment" />
                    <button type="submit" className="btn btn-p btn-sm" disabled={isWorking}>Submit review</button>
                  </form>
                </section>
              )}
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
                          {issue.bountyAmount.toLocaleString()} {issue.token.symbol}
                        </dd>
                        <dt>Developer Net (97.5%)</dt>
                        <dd className="mono">{devShare} {issue.token.symbol}</dd>
                        <dt>Platform Fee (2.5%)</dt>
                        <dd className="mono">{platformFee} {issue.token.symbol}</dd>
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
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <Button variant="outline" className="w-full" disabled={isWorking} onClick={startEditing}>
                        Edit bounty
                      </Button>
                      <Button variant="outline" className="w-full" disabled={isWorking} onClick={() => void cancel()}>
                        Cancel bounty
                      </Button>
                    </div>
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

                  {user && !isClient && !isAdmin && (
                    <>
                      {myApplication && myApplication.status === "PENDING" && (
                        <div
                          style={{
                            padding: 12,
                            background: "var(--surface-2)",
                            borderRadius: 6,
                            border: "1px solid var(--line)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--brand)" }}>
                              Applied
                            </span>
                            <span className="badge b-open">Pending review</span>
                          </div>
                          {myApplication.message && (
                            <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-2)" }}>{myApplication.message}</p>
                          )}
                          {issue.status === "OPEN" && (
                            <button
                              type="button"
                              className="btn btn-o btn-sm"
                              style={{ alignSelf: "flex-start", marginTop: 4 }}
                              disabled={isWorking}
                              onClick={() => void withdraw(myApplication.id)}
                            >
                              Withdraw application
                            </button>
                          )}
                        </div>
                      )}

                      {myApplication && myApplication.status === "REJECTED" && (
                        <div
                          style={{
                            padding: 12,
                            background: "var(--surface-2)",
                            borderRadius: 6,
                            border: "1px solid var(--line)",
                          }}
                        >
                          <span className="badge b-closed">Application not selected</span>
                        </div>
                      )}

                      {issue.status === "OPEN" && (!myApplication || myApplication.status === "WITHDRAWN") && (
                        <form onSubmit={apply} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <textarea
                            className="inp"
                            style={{ height: 68, padding: 8, fontSize: 12.5 }}
                            value={applicationText}
                            onChange={(e) => setApplicationText(e.target.value)}
                            placeholder="Why are you a good fit? (optional)"
                          />
                          <button type="submit" className="btn btn-p" disabled={isWorking || Boolean(issue.viewerCapabilities && !issue.viewerCapabilities.canApply)}>
                            <MessageSquare className="ico" style={{ width: 14, height: 14 }} /> Apply to this task
                          </button>
                        </form>
                      )}
                    </>
                  )}

                  {canChat && issue.status === "IN_PROGRESS" && issue.viewerCapabilities?.canDispute && actionOf("raiseDispute") && (
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
                      <label style={{ fontSize: 12 }}>
                        Evidence files (optional)
                        <input
                          type="file"
                          multiple
                          style={{ display: "block", marginTop: 6, fontSize: 12 }}
                          disabled={isWorking}
                          onChange={async (e) => {
                            const picked = Array.from(e.target.files ?? []);
                            try {
                              const ids = await Promise.all(picked.map((file) => attachFile(file, "EVIDENCE")));
                              setEvidenceFiles((current) => [...current, ...ids]);
                            } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not upload the file."); }
                            e.target.value = "";
                          }}
                        />
                        {evidenceFiles.length > 0 && <span className="mut"> {evidenceFiles.length} file(s) attached</span>}
                      </label>
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
