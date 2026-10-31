import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { fixture } from "./harness/fixture";
import { fund } from "./harness/funding";
import { gqlAs } from "./harness/gql";

beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));

type Fixture = Awaited<ReturnType<typeof fixture>>;
type Extra = { notificationId: string; sessionId: string };

// One row per mutation in docs/AUTHZ_MATRIX.md. `outsider` lists the refusal codes the matrix gives a signed-in non-participant.
// `allowed` marks rows where the matrix grants anyone signed in: the call must pass the permission check, and a later state error is fine.
// Escrow rows run against an issue with no escrow, so the guard answers NOT_FOUND before it reaches the participant check.
type Row = {
  name: string;
  decl: string;
  args: string;
  ret: string;
  vars: (f: Fixture, x: Extra) => Record<string, unknown>;
  outsider?: string[];
  allowed?: boolean;
};

const obj = "{ __typename }";
const rows: Row[] = [
  // Hồ sơ và thông báo
  { name: "unlinkGithub", decl: "", args: "", ret: obj, vars: () => ({}), allowed: true },
  { name: "updateProfile", decl: "$input: UpdateProfileInput!", args: "input: $input", ret: obj, vars: () => ({ input: { bio: "Outsider bio" } }), allowed: true },
  { name: "markNotificationRead", decl: "$id: ID!", args: "id: $id", ret: obj, vars: (_f, x) => ({ id: x.notificationId }), outsider: ["NOT_FOUND"] },
  { name: "markAllNotificationsRead", decl: "", args: "", ret: "", vars: () => ({}), allowed: true },
  // Bài toán, ứng tuyển, bài nộp
  { name: "createIssue", decl: "$input: CreateIssueInput!", args: "input: $input", ret: obj, vars: (f) => ({ input: { title: "Outsider bounty title", description: "Outsider bounty description, long enough.", category: "BUG_FIX", bountyAmount: "100", tokenId: f.token.id } }), allowed: true },
  { name: "updateIssue", decl: "$input: UpdateIssueInput!", args: "input: $input", ret: obj, vars: (f) => ({ input: { id: f.issueId, title: "Outsider edit attempt" } }), outsider: ["FORBIDDEN"] },
  { name: "cancelIssue", decl: "$id: ID!", args: "id: $id", ret: obj, vars: (f) => ({ id: f.issueId }), outsider: ["FORBIDDEN"] },
  { name: "createIssueComment", decl: "$input: CreateIssueCommentInput!", args: "input: $input", ret: obj, vars: (f) => ({ input: { issueId: f.issueId, body: "Outsider question" } }), allowed: true },
  { name: "generateTestCases", decl: "$issueId: String!", args: "issueId: $issueId", ret: obj, vars: (f) => ({ issueId: f.issueId }), outsider: ["FORBIDDEN", "CLIENT_ROLE_REQUIRED"] },
  { name: "updateTestCase", decl: "$input: UpdateTestCaseInput!", args: "input: $input", ret: obj, vars: (f) => ({ input: { id: f.criterionId, isApproved: false } }), outsider: ["FORBIDDEN"] },
  { name: "applyToIssue", decl: "$input: ApplyToIssueInput!", args: "input: $input", ret: obj, vars: (f) => ({ input: { issueId: f.issueId, message: "Outsider application" } }), allowed: true },
  { name: "withdrawApplication", decl: "$id: ID!", args: "id: $id", ret: obj, vars: (f) => ({ id: f.applicationId }), outsider: ["FORBIDDEN", "NOT_FOUND"] },
  { name: "rejectApplication", decl: "$id: ID!", args: "id: $id", ret: obj, vars: (f) => ({ id: f.applicationId }), outsider: ["FORBIDDEN"] },
  { name: "selectDeveloper", decl: "$issue: ID!, $application: ID!, $deadline: String!", args: "issueId: $issue, applicationId: $application, deliveryDeadline: $deadline", ret: obj, vars: (f) => ({ issue: f.issueId, application: f.applicationId, deadline: f.deadline }), outsider: ["FORBIDDEN"] },
  { name: "createSubmissionDraft", decl: "$issue: ID!, $description: String", args: "issueId: $issue, description: $description", ret: obj, vars: (f) => ({ issue: f.issueId, description: "Outsider draft" }), outsider: ["FORBIDDEN", "NOT_FOUND"] },
  // Tranh chấp
  { name: "prepareRaiseDispute", decl: "$issue: ID!, $manifest: ID!", args: "issueId: $issue, manifestId: $manifest", ret: obj, vars: (f) => ({ issue: f.issueId, manifest: "missing-manifest" }), outsider: ["FORBIDDEN", "NOT_FOUND"] },
  { name: "analyzeDispute", decl: "$issueId: String!", args: "issueId: $issueId", ret: obj, vars: (f) => ({ issueId: f.issueId }), outsider: ["FORBIDDEN"] },
  // Quản trị
  { name: "banUser", decl: "$input: BanUserInput!", args: "input: $input", ret: obj, vars: (f) => ({ input: { userId: f.developer.id, reason: "Outsider attempt" } }), outsider: ["FORBIDDEN"] },
  { name: "unbanUser", decl: "$userId: ID!", args: "userId: $userId", ret: obj, vars: (f) => ({ userId: f.developer.id }), outsider: ["FORBIDDEN"] },
  { name: "adminHideIssue", decl: "$issue: ID!, $reason: String!", args: "issueId: $issue, reason: $reason", ret: "", vars: (f) => ({ issue: f.issueId, reason: "Outsider attempt" }), outsider: ["FORBIDDEN"] },
  { name: "adminUnhideIssue", decl: "$issue: ID!", args: "issueId: $issue", ret: "", vars: (f) => ({ issue: f.issueId }), outsider: ["FORBIDDEN"] },
  // Phase D–F: escrow, phán quyết, bằng chứng, đánh giá
  { name: "prepareReleaseFunds", decl: "$issue: ID!", args: "issueId: $issue", ret: obj, vars: (f) => ({ issue: f.issueId }), outsider: ["NOT_FOUND", "FORBIDDEN"] },
  { name: "prepareSubmitCounterpartyEvidence", decl: "$issue: ID!, $manifest: ID!", args: "issueId: $issue, manifestId: $manifest", ret: obj, vars: (f) => ({ issue: f.issueId, manifest: "missing-manifest" }), outsider: ["NOT_FOUND", "FORBIDDEN"] },
  { name: "prepareChallengeRuling", decl: "$issue: ID!", args: "issueId: $issue", ret: obj, vars: (f) => ({ issue: f.issueId }), outsider: ["NOT_FOUND", "FORBIDDEN"] },
  { name: "prepareFinalizeRuling", decl: "$issue: ID!", args: "issueId: $issue", ret: obj, vars: (f) => ({ issue: f.issueId }), allowed: true },
  { name: "prepareFinalizeArbiterTimeoutSplit", decl: "$issue: ID!", args: "issueId: $issue", ret: obj, vars: (f) => ({ issue: f.issueId }), allowed: true },
  { name: "prepareClaimMissedDeliveryRefund", decl: "$issue: ID!", args: "issueId: $issue", ret: obj, vars: (f) => ({ issue: f.issueId }), allowed: true },
  { name: "prepareClaimReviewTimeout", decl: "$issue: ID!", args: "issueId: $issue", ret: obj, vars: (f) => ({ issue: f.issueId }), allowed: true },
  { name: "prepareClaim", decl: "$recipient: String!", args: "recipient: $recipient", ret: obj, vars: (f) => ({ recipient: f.client.walletAddress }), outsider: ["FORBIDDEN"] },
  { name: "prepareProposeSettlement", decl: "$issue: ID!, $clientBps: Int!", args: "issueId: $issue, clientBps: $clientBps", ret: obj, vars: (f) => ({ issue: f.issueId, clientBps: 3000 }), outsider: ["NOT_FOUND", "FORBIDDEN"] },
  { name: "prepareAcceptSettlement", decl: "$issue: ID!", args: "issueId: $issue", ret: obj, vars: (f) => ({ issue: f.issueId }), outsider: ["NOT_FOUND", "FORBIDDEN"] },
  { name: "prepareRevokeSettlement", decl: "$issue: ID!", args: "issueId: $issue", ret: obj, vars: (f) => ({ issue: f.issueId }), outsider: ["NOT_FOUND", "FORBIDDEN"] },
  { name: "draftRuling", decl: "$issueId: ID!, $kind: RulingDraftKind!, $clientBps: Int!, $rationale: String!", args: "issueId: $issueId, kind: $kind, clientBps: $clientBps, rationale: $rationale", ret: obj, vars: (f) => ({ issueId: f.issueId, kind: "INITIAL", clientBps: 5000, rationale: "Outsider ruling" }), outsider: ["FORBIDDEN"] },
  { name: "createEvidenceManifest", decl: "$issue: ID!, $statement: String!", args: "issueId: $issue, statement: $statement", ret: obj, vars: (f) => ({ issue: f.issueId, statement: "Outsider evidence" }), outsider: ["FORBIDDEN", "NOT_FOUND"] },
  { name: "submitReview", decl: "$issue: ID!, $rating: Int!", args: "issueId: $issue, rating: $rating", ret: obj, vars: (f) => ({ issue: f.issueId, rating: 5 }), outsider: ["FORBIDDEN", "INVALID_STATE"] },
  // Phiên đăng nhập
  { name: "revokeSession", decl: "$id: ID!", args: "id: $id", ret: "", vars: (_f, x) => ({ id: x.sessionId }), outsider: ["NOT_FOUND"] },
  { name: "revokeOtherSessions", decl: "", args: "", ret: "", vars: () => ({}), allowed: true },
  // Phase E–F: tiêu chí, tin nhắn, giữ chỗ, ví, đính kèm, quản trị
  { name: "attachIssueFile", decl: "$issue: ID!, $attachment: ID!", args: "issueId: $issue, attachmentId: $attachment", ret: obj, vars: (f) => ({ issue: f.issueId, attachment: "missing-attachment" }), outsider: ["FORBIDDEN"] },
  { name: "cancelReservation", decl: "$id: ID!", args: "reservationId: $id", ret: obj, vars: () => ({ id: "missing-reservation" }), outsider: ["NOT_FOUND"] },
  { name: "createTestCase", decl: "$input: CreateTestCaseInput!", args: "input: $input", ret: obj, vars: (f) => ({ input: { issueId: f.issueId, title: "Outsider criterion", description: "Outsider attempt", given: "a task", when: "it is done", then: "it passes" } }), outsider: ["FORBIDDEN"] },
  { name: "deleteTestCase", decl: "$id: ID!", args: "id: $id", ret: "", vars: (f) => ({ id: f.criterionId }), outsider: ["FORBIDDEN"] },
  { name: "editMessage", decl: "$id: ID!, $content: String!", args: "id: $id, content: $content", ret: obj, vars: () => ({ id: "missing-message", content: "Outsider edit" }), outsider: ["NOT_FOUND"] },
  { name: "deleteMessage", decl: "$id: ID!", args: "id: $id", ret: "", vars: () => ({ id: "missing-message" }), outsider: ["NOT_FOUND"] },
  { name: "recordIssueView", decl: "$issue: ID!", args: "issueId: $issue", ret: "", vars: (f) => ({ issue: f.issueId }), allowed: true },
  { name: "recordTransactionSubmitted", decl: "$intent: ID!, $hash: String!", args: "intentId: $intent, txHash: $hash", ret: obj, vars: () => ({ intent: "missing-intent", hash: `0x${"1".repeat(64)}` }), outsider: ["NOT_FOUND"] },
  { name: "submitFundingIntent", decl: "$id: ID!, $sig: String!, $nonce: String!, $expiry: String!", args: "reservationId: $id, signature: $sig, nonce: $nonce, intentExpiry: $expiry", ret: obj, vars: () => ({ id: "missing-reservation", sig: `0x${"1".repeat(130)}`, nonce: "1", expiry: new Date(Date.now() + 600_000).toISOString() }), outsider: ["NOT_FOUND"] },
  { name: "setUserRole", decl: "$userId: ID!, $role: String!", args: "userId: $userId, role: $role", ret: obj, vars: (f) => ({ userId: f.developer.id, role: "ADMIN" }), outsider: ["FORBIDDEN"] },
];

// Mutations the matrix records as removed. None may exist in the schema.
const removed = ["assignDeveloper", "cancelEscrow", "challengeDisputeResolution", "confirmEscrowTransaction", "depositToEscrow", "proposeDisputeResolution", "raiseDispute", "releaseFunds", "reviewSubmission", "submitWork"];

const build = (row: Row) => `mutation${row.decl ? `(${row.decl})` : ""} { ${row.name}${row.args ? `(${row.args})` : ""}${row.ret ? ` ${row.ret}` : ""} }`;

async function extras(f: Fixture): Promise<Extra> {
  const notification = await f.prisma.notification.create({ data: { userId: f.client.id, type: "MESSAGE_RECEIVED", title: "Outsider check", body: "Only the client may read this." } });
  const session = await f.prisma.session.create({ data: { userId: f.client.id, refreshHash: `e28-${crypto.randomUUID()}`, expiresAt: new Date(Date.now() + 86_400_000) } });
  return { notificationId: notification.id, sessionId: session.id };
}

test("E28: every matrix mutation refuses a guest with UNAUTHORIZED", async () => {
  const f = await fixture();
  const x = await extras(f);
  const leaks: string[] = [];
  for (const row of rows) {
    const result = await gqlAs(null, build(row), row.vars(f, x));
    if (result.errors?.[0]?.extensions?.code !== "UNAUTHORIZED") leaks.push(`${row.name}: ${result.errors?.[0]?.extensions?.code ?? "no error"}`);
  }
  expect(leaks).toEqual([]);
}, 120_000);

test("E28: a signed-in non-participant gets the matrix code, or passes the permission check where the matrix allows it", async () => {
  const f = await fixture();
  const x = await extras(f);
  const mismatches: string[] = [];
  for (const row of rows) {
    if (!row.outsider && !row.allowed) continue;
    const result = await gqlAs(f.outsider, build(row), row.vars(f, x));
    const code = result.errors?.[0]?.extensions?.code;
    if (row.outsider && (!code || !row.outsider.includes(code))) mismatches.push(`${row.name}: expected ${row.outsider.join("|")}, got ${code ?? "no error"}`);
    if (row.allowed && (code === "UNAUTHORIZED" || code === "FORBIDDEN")) mismatches.push(`${row.name}: matrix allows anyone signed in, got ${code}`);
  }
  expect(mismatches).toEqual([]);
}, 120_000);

test("E28: on a funded escrow, a signed-in non-participant still gets the matrix code", async () => {
  // With an escrow, the guards answer FORBIDDEN instead of NOT_FOUND (see BỔ SUNG K9).
  const f = await fixture();
  await fund(f);
  const x = await extras(f);
  const mismatches: string[] = [];
  for (const row of rows) {
    if (!row.outsider) continue;
    const result = await gqlAs(f.outsider, build(row), row.vars(f, x));
    const code = result.errors?.[0]?.extensions?.code;
    if (!code) mismatches.push(`${row.name}: no error, a non-participant got through`);
    else if (!row.outsider.includes(code)) mismatches.push(`${row.name}: expected ${row.outsider.join("|")}, got ${code}`);
  }
  expect(mismatches).toEqual([]);
}, 240_000);

test("E28: removed mutations are absent from the schema", async () => {
  const present: string[] = [];
  for (const name of removed) {
    const result = await gqlAs(null, `mutation { ${name} }`);
    if (!result.errors?.[0]?.message.includes(`Cannot query field "${name}" on type "Mutation"`)) present.push(name);
  }
  expect(present).toEqual([]);
});
