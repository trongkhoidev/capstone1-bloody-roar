import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IssueDetailView } from "../components/marketplace/issue-detail-view";

const { request, session } = vi.hoisted(() => ({ request: vi.fn(), session: { user: { id: "dev", role: "DEVELOPER", walletAddress: "0x1111111111111111111111111111111111111111" } } }));
vi.mock("../lib/graphql-client", async (original) => ({ ...await original<object>(), graphqlRequest: request }));
vi.mock("../lib/store/use-auth-store", () => ({ useAuthStore: (selector: (state: typeof session) => unknown) => selector(session) }));
vi.mock("../lib/ui-preferences", () => ({ useUiPreferences: () => ({ theme: "light" }) }));
vi.mock("socket.io-client", () => ({ io: () => ({ emit: vi.fn(), on: vi.fn(), disconnect: vi.fn() }) }));
vi.mock("../components/issues/source-panel", () => ({ SourcePanel: () => null }));
vi.mock("../components/issues/test-run-panel", () => ({ TestRunPanel: () => null }));
vi.mock("../components/marketplace/issue-comments", () => ({ IssueComments: () => null }));
vi.mock("../components/chat/chat-room", () => ({ IssueChatRoom: () => null }));

const person = (id: string) => ({ id, name: id, walletAddress: "0x1111111111111111111111111111111111111111", reputationScore: 0, isGithubVerified: false });
function mockIssue(similarFixIssueId: string | null) {
  request.mockReset();
  request.mockImplementation(async (query: string) => {
    if (query.includes("query IssueDetail")) return { issue: {
      id: "issue", title: "Fix login", description: "Login spins.", category: "BUG_FIX", status: "OPEN", noExecutableTests: false,
      bountyAmount: { formatted: "100", raw: "100000000", decimals: 6 }, clientId: "client", developerId: null, client: person("client"),
      token: { symbol: "USDC", name: "USD Coin" }, requiredSkills: [], createdAt: "2026-11-17T00:00:00Z", viewCount: 0,
      attachments: [], viewerCapabilities: { canApply: true, similarFixIssueId }, escrow: null,
    } };
    if (query.includes("TaskTestCases")) return { testCases: [] };
    if (query.includes("UnreadMessages")) return { unreadMessageCount: 0 };
    return {};
  });
}
async function show() {
  await act(async () => { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><IssueDetailView issueId="issue" /></QueryClientProvider>); });
  await screen.findByText("Fix login");
}
afterEach(cleanup);

describe("similar fix label (US-107)", () => {
  it("links the developer who fixed a similar issue to it", async () => {
    mockIssue("old-issue");
    await show();
    expect(screen.getByTestId("similar-fix-label")).toHaveAttribute("href", "/issues/old-issue");
  });

  it("stays hidden when the server grants no similar fix", async () => {
    mockIssue(null);
    await show();
    expect(screen.queryByTestId("similar-fix-label")).not.toBeInTheDocument();
  });
});
