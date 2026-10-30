import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { fixture } from "./harness/fixture";
import { gqlAs } from "./harness/gql";

beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));

// Each row is one mutation from docs/AUTHZ_MATRIX.md with the refusal codes its guard can return for a non-participant.
type Row = { name: string; query: string; vars: (f: Awaited<ReturnType<typeof fixture>>) => Record<string, unknown>; outsider: string[] };
const rows: Row[] = [
  { name: "cancelIssue", query: "mutation($id: ID!) { cancelIssue(id: $id) { id } }", vars: (f) => ({ id: f.issueId }), outsider: ["FORBIDDEN"] },
  { name: "selectDeveloper", query: "mutation($issue: ID!, $application: ID!, $deadline: String!) { selectDeveloper(issueId: $issue, applicationId: $application, deliveryDeadline: $deadline) { id } }", vars: (f) => ({ issue: f.issueId, application: f.applicationId, deadline: f.deadline }), outsider: ["FORBIDDEN"] },
  { name: "rejectApplication", query: "mutation($id: ID!) { rejectApplication(id: $id) { id } }", vars: (f) => ({ id: f.applicationId }), outsider: ["FORBIDDEN"] },
  { name: "withdrawApplication", query: "mutation($id: ID!) { withdrawApplication(id: $id) { id } }", vars: (f) => ({ id: f.applicationId }), outsider: ["FORBIDDEN", "NOT_FOUND"] },
  { name: "createSubmissionDraft", query: "mutation($issue: ID!, $description: String!) { createSubmissionDraft(issueId: $issue, description: $description) { id } }", vars: (f) => ({ issue: f.issueId, description: "Outsider draft" }), outsider: ["FORBIDDEN", "NOT_FOUND"] },
  { name: "prepareReleaseFunds", query: "mutation($id: ID!) { prepareReleaseFunds(issueId: $id) { intentId } }", vars: (f) => ({ id: f.issueId }), outsider: ["FORBIDDEN", "NOT_FOUND", "NOTHING_TO_CLAIM", "INVALID_PHASE"] },
  { name: "prepareRaiseDispute", query: "mutation($issue: ID!, $manifest: ID!) { prepareRaiseDispute(issueId: $issue, manifestId: $manifest) { intentId } }", vars: (f) => ({ issue: f.issueId, manifest: "missing-manifest" }), outsider: ["FORBIDDEN", "NOT_FOUND", "INVALID_PHASE"] },
  { name: "analyzeDispute", query: "mutation($issueId: String!) { analyzeDispute(issueId: $issueId) { id } }", vars: (f) => ({ issueId: f.issueId }), outsider: ["FORBIDDEN"] },
  { name: "banUser", query: "mutation($input: BanUserInput!) { banUser(input: $input) { id } }", vars: (f) => ({ input: { userId: f.developer.id, reason: "Outsider attempt" } }), outsider: ["FORBIDDEN"] },
  { name: "unbanUser", query: "mutation($userId: ID!) { unbanUser(userId: $userId) { id } }", vars: (f) => ({ userId: f.developer.id }), outsider: ["FORBIDDEN"] },
  { name: "submitReview", query: "mutation($issue: ID!, $rating: Int!) { submitReview(issueId: $issue, rating: $rating) { id } }", vars: (f) => ({ issue: f.issueId, rating: 5 }), outsider: ["FORBIDDEN", "INVALID_STATE"] },
  { name: "adminHideIssue", query: "mutation($issue: ID!, $reason: String!) { adminHideIssue(issueId: $issue, reason: $reason) }", vars: (f) => ({ issue: f.issueId, reason: "Outsider attempt" }), outsider: ["FORBIDDEN"] },
  { name: "createIssueComment", query: "mutation($input: CreateIssueCommentInput!) { createIssueComment(input: $input) { id } }", vars: (f) => ({ input: { issueId: f.issueId, body: "Outsider comment" } }), outsider: [] },
  { name: "generateTestCases", query: "mutation($issueId: String!) { generateTestCases(issueId: $issueId) { id } }", vars: (f) => ({ issueId: f.issueId }), outsider: ["FORBIDDEN", "CLIENT_ROLE_REQUIRED"] },
  { name: "revokeSession", query: "mutation($id: ID!) { revokeSession(id: $id) }", vars: () => ({ id: "not-a-session" }), outsider: ["NOT_FOUND"] },
  { name: "markAllNotificationsRead", query: "mutation { markAllNotificationsRead }", vars: () => ({}), outsider: [] },
  { name: "revokeOtherSessions", query: "mutation { revokeOtherSessions }", vars: () => ({}), outsider: [] },
];

test("E28: every listed mutation refuses a guest with UNAUTHORIZED", async () => {
  const f = await fixture();
  const leaks: string[] = [];
  for (const row of rows) {
    const result = await gqlAs(null, row.query, row.vars(f));
    if (result.errors?.[0]?.extensions?.code !== "UNAUTHORIZED") leaks.push(`${row.name}: ${result.errors?.[0]?.extensions?.code ?? "no error"}`);
  }
  expect(leaks).toEqual([]);
}, 120_000);

test("E28: a non-participant is refused with the code the matrix documents", async () => {
  const f = await fixture();
  const mismatches: string[] = [];
  for (const row of rows.filter((item) => item.outsider.length > 0)) {
    const result = await gqlAs(f.outsider, row.query, row.vars(f));
    const code = result.errors?.[0]?.extensions?.code;
    if (!code || !row.outsider.includes(code)) mismatches.push(`${row.name}: ${code ?? "no error"}`);
  }
  expect(mismatches).toEqual([]);

  // Per the matrix, anyone signed in may comment on a public, open bounty.
  const comment = await gqlAs(f.outsider, "mutation($input: CreateIssueCommentInput!) { createIssueComment(input: $input) { id } }", { input: { issueId: f.issueId, body: "Outsider question" } });
  expect(comment.errors).toBeUndefined();
}, 120_000);
