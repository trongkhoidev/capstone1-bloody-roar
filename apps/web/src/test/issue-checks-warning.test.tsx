import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IssueDetailView } from "../components/marketplace/issue-detail-view";

const { request, session } = vi.hoisted(() => ({ request: vi.fn(), session: { user: { id: "client", role: "CLIENT", walletAddress: "0x1111111111111111111111111111111111111111" } } }));
vi.mock("../lib/graphql-client", async (original) => ({ ...await original<object>(), graphqlRequest: request }));
vi.mock("../lib/store/use-auth-store", () => ({ useAuthStore: (selector: (state: typeof session) => unknown) => selector(session) }));
vi.mock("../lib/ui-preferences", () => ({ useUiPreferences: () => ({ theme: "light" }) }));
vi.mock("socket.io-client", () => ({ io: () => ({ emit: vi.fn(), on: vi.fn(), disconnect: vi.fn() }) }));
vi.mock("../components/issues/source-panel", () => ({ SourcePanel: () => null }));
vi.mock("../components/issues/test-run-panel", () => ({ TestRunPanel: () => null }));
vi.mock("../components/marketplace/issue-comments", () => ({ IssueComments: () => null }));
vi.mock("../components/chat/chat-room", () => ({ IssueChatRoom: () => null }));

const headline = "This bounty has no automated checks.";
const explanation = "No automated patch checks or secret screening are enforced for this bounty.";
const person = (id: string) => ({ id, name: id, walletAddress: "0x1111111111111111111111111111111111111111", reputationScore: 0, isGithubVerified: false });
const criterion = { id: "case", title: "Addition works", description: "Verify addition", given: "two numbers", when: "adding", bddThen: "returns sum", isEdgeCase: false, priority: "NORMAL", isApproved: false, testCode: "test()", testFilePath: "__bloodyroar__/sum.test.ts", baseStatus: "passed", expectBaseFail: false };
let noChecks: boolean;
let cases: Array<typeof criterion>;
async function showIssue() {
  await act(async () => { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><IssueDetailView issueId="issue" /></QueryClientProvider>); });
}

beforeEach(() => {
  noChecks = true; cases = []; session.user = { ...session.user, id: "client", role: "CLIENT" };
  request.mockReset();
  request.mockImplementation(async (query: string) => {
    if (query.includes("query IssueDetail")) return { issue: {
      id: "issue", title: "Fix addition", description: "Fix the sum function.", category: "BUG_FIX", status: "OPEN",
      noExecutableTests: noChecks, bountyAmount: { formatted: "100", raw: "100000000", decimals: 6 },
      clientId: "client", developerId: "developer", client: person("client"), developer: person("developer"),
      token: { symbol: "USDC", name: "USD Coin" }, requiredSkills: [], createdAt: "2026-11-17T00:00:00Z", viewCount: 0,
      attachments: [], viewerCapabilities: {}, escrow: { availableActions: [] },
    } };
    if (query.includes("TaskTestCases")) return { testCases: cases };
    if (query.includes("UpdateTestCase")) { noChecks = false; cases = [{ ...criterion, isApproved: true }]; return { updateTestCase: cases[0] }; }
    if (query.includes("DeleteTestCase")) { noChecks = true; cases = []; return { deleteTestCase: true }; }
    if (query.includes("Reservation")) return { reservation: null };
    if (query.includes("IssueApplications")) return { applications: [] };
    if (query.includes("MyApplications")) return { myApplications: [] };
    if (query.includes("TaskSubmissions")) return { submissions: [] };
    if (query.includes("UnreadMessages")) return { unreadMessageCount: 0 };
    throw new Error(`Unexpected query: ${query}`);
  });
});
afterEach(cleanup);

describe("automated checks warning on the issue page", () => {
  it.each(["client", "developer"])("shows the warning and explanation for the %s across tabs", async (viewer) => {
    session.user = { ...session.user, id: viewer, role: viewer === "client" ? "CLIENT" : "DEVELOPER" };
    await showIssue();
    expect(await screen.findByText(headline)).toBeInTheDocument();
    expect(screen.getByText(explanation)).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith(expect.stringContaining("noExecutableTests"), { id: "issue", initial: true });
    await act(async () => { fireEvent.click(screen.getByRole("tab", { name: /delivery/i })); });
    expect(screen.getByText(headline)).toBeInTheDocument();
  });

  it("loads the issue and viewer data together while unread and view tracking run separately", async () => {
    await showIssue();
    await screen.findByText("Fix addition");
    const operations = request.mock.calls.map(([query]) => String(query));
    const issueRequests = operations.filter((query) => query.includes("query IssueDetail"));
    expect(issueRequests).toHaveLength(1);
    for (const field of ["reservation", "ownerApplications", "viewerApplication", "viewerSubmissions"]) {
      expect(issueRequests[0]).toContain(field + " @include");
    }
    expect(operations.filter((query) => query.includes("query UnreadMessages"))).toHaveLength(1);
    expect(operations.filter((query) => query.includes("mutation RecordIssueView"))).toHaveLength(1);
  });

  it("does not warn about missing checks when approved code exists", async () => {
    noChecks = false; cases = [{ ...criterion, isApproved: true }];
    await showIssue();
    await screen.findByText("Fix addition");
    await screen.findByText("Addition works");
    expect(screen.queryByText(headline)).not.toBeInTheDocument();
  });

  it("refreshes the server field and removes the warning after approving executable code", async () => {
    cases = [criterion];
    await showIssue();
    expect(await screen.findByText(headline)).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Approve" })); });
    await waitFor(() => expect(screen.queryByText(headline)).not.toBeInTheDocument());
    expect(request.mock.calls.filter(([query]) => String(query).includes("query IssueDetail")).length).toBeGreaterThan(1);
  });
  it("shows the warning again after deleting the last approved executable check", async () => {
    noChecks = false; cases = [{ ...criterion, isApproved: true }];
    await showIssue();
    expect(screen.queryByText(headline)).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Delete" })); });
    expect(await screen.findByText(headline)).toBeInTheDocument();
  });

  it("keeps the server field authoritative when loading criteria fails", async () => {
    noChecks = false;
    const handler = request.getMockImplementation()!;
    request.mockImplementation((query: string) => {
      if (query.includes("TaskTestCases")) return Promise.reject(new Error("offline"));
      return handler(query);
    });
    await showIssue();
    expect(screen.getByText("Fix addition")).toBeInTheDocument();
    expect(screen.queryByText(headline)).not.toBeInTheDocument();
  });
});

describe("approving a delivery", () => {
  it("does not offer release when the submission has no delivery hash", async () => {
    const handler = request.getMockImplementation()!;
    request.mockImplementation(async (query: string) => {
      if (query.includes("query IssueDetail")) {
        const { issue } = await handler(query) as { issue: object };
        return { issue: { ...issue, status: "IN_PROGRESS", viewerCapabilities: { canRelease: true }, escrow: { availableActions: [{ action: "releaseFunds", reasonDisabled: null }] }, viewerSubmissions: [{ id: "submission", status: "SUBMITTED", deliveryHash: null, submittedAt: "2026-11-17T00:00:00Z", developer: { name: "developer", walletAddress: "0x1111111111111111111111111111111111111111" } }] } };
      }
      return handler(query);
    });
    await showIssue();
    await screen.findByText("Fix addition");
    await act(async () => { fireEvent.click(screen.getByRole("tab", { name: /delivery/i })); });
    expect(await screen.findByRole("button", { name: "Approve delivery" })).toBeDisabled();
  });
});
