import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
function mockIssue(similarFixIssueId: string | null, extra: Record<string, unknown> = {}) {
  request.mockReset();
  request.mockImplementation(async (query: string) => {
    if (query.includes("query IssueDetail")) return { issue: {
      id: "issue", title: "Fix login", description: "Login spins.", category: "BUG_FIX", status: "OPEN", noExecutableTests: false,
      bountyAmount: { formatted: "100", raw: "100000000", decimals: 6 }, clientId: "client", developerId: null, client: person("client"),
      token: { symbol: "USDC", name: "USD Coin" }, requiredSkills: [], createdAt: "2026-11-17T00:00:00Z", viewCount: 0,
      attachments: [], viewerCapabilities: { canApply: true, similarFixIssueId }, escrow: null, ...extra,
    } };
    if (query.includes("mutation Apply")) return { applyToIssue: { id: "app", status: "PENDING" } };
    if (query.includes("TaskTestCases")) return { testCases: [] };
    if (query.includes("UnreadMessages")) return { unreadMessageCount: 0 };
    return {};
  });
}
async function show() {
  await act(async () => { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><IssueDetailView issueId="issue" /></QueryClientProvider>); });
  await screen.findByText("Fix login");
}
afterEach(() => {
  cleanup();
  session.user.id = "dev";
  session.user.role = "DEVELOPER";
});

describe("similar fix label (US-107)", () => {
  it("links the developer who fixed a similar issue to it", async () => {
    mockIssue("old-issue");
    await show();
    expect(screen.getByTestId("similar-fix-label")).toHaveAttribute("href", "/issues/old-issue");
  });

  it("applies at the reuse price only when the developer ticks the reuse box (US-108)", async () => {
    mockIssue("old-issue");
    await show();
    fireEvent.click(screen.getByRole("checkbox", { name: /Reuse my fix of issue BR-old-issu for 50 USDC/ }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Apply to this task/ })); });
    const call = request.mock.calls.find(([query]) => String(query).includes("mutation Apply"));
    expect(call?.[1]).toEqual({ input: { issueId: "issue", reuseOfIssueId: "old-issue" } });
  });

  it("shows the client the bounty, the reuse price and the deposit for a reuse application", async () => {
    session.user = { ...session.user, id: "client", role: "CLIENT" };
    mockIssue(null, { viewerCapabilities: { canSelect: true }, ownerApplications: [
      { id: "app", status: "PENDING", message: null, createdAt: "2026-11-17T00:00:00Z", reuseOfIssueId: "old-issue", developer: { ...person("dev"), skills: [] } },
    ] });
    await show();
    expect((await screen.findByTestId("reuse-price")).textContent).toMatch(/Bounty 100 USDC, reuse price 50 USDC, you deposit 55 USDC/);
    session.user = { ...session.user, id: "dev", role: "DEVELOPER" };
  });

  it("shows the reserved reuse amount instead of the bounty once selected", async () => {
    session.user = { ...session.user, id: "client", role: "CLIENT" };
    mockIssue(null, { status: "AWAITING_FUNDING", developerId: "dev", reservation: { id: "r", status: "AWAITING_FUNDING", amountRaw: "50000000" } });
    await show();
    await act(async () => { fireEvent.click(screen.getByRole("tab", { name: /escrow/i })); });
    expect(screen.getByText("Total Locked (client pays)").nextElementSibling?.textContent).toBe("55 USDC");
    session.user = { ...session.user, id: "dev", role: "DEVELOPER" };
  });

  it("stays hidden when the server grants no similar fix", async () => {
    mockIssue(null);
    await show();
    expect(screen.queryByTestId("similar-fix-label")).not.toBeInTheDocument();
  });
});

it("updates the escrow total when selecting a reuse application and cancelling its reservation", async () => {
  session.user.id = "client";
  session.user.role = "CLIENT";
  mockIssue(null);
  const baseRequest = request.getMockImplementation()!;
  const applications = [{ id: "application", status: "PENDING", developer: person("dev"), reuseOfIssueId: "old-issue" }];
  let reserved = false;
  request.mockImplementation(async (query: string) => {
    if (query.includes("mutation SelectDeveloper")) {
      reserved = true;
      return { selectDeveloper: { id: "reservation", amountRaw: "50000000" } };
    }
    if (query.includes("cancelReservation(")) {
      reserved = false;
      return { cancelReservation: { id: "reservation" } };
    }
    if (query.includes("query IssueApplications")) return { applications };
    const result = await baseRequest(query);
    if (!query.includes("query IssueDetail")) return result;
    return { issue: {
      ...result.issue,
      status: reserved ? "AWAITING_FUNDING" : "OPEN",
      ownerApplications: applications,
      viewerCapabilities: { canSelect: !reserved, canFund: reserved },
    } };
  });
  await show();
  expect(screen.getByRole("img", { name: /client pays 110$/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Select developer" }));
  await screen.findByRole("button", { name: "Cancel reservation" });
  expect(screen.getByRole("img", { name: /client pays 55$/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cancel reservation" }));
  await screen.findByRole("button", { name: "Select developer" });
  expect(screen.getByRole("img", { name: /client pays 110$/ })).toBeInTheDocument();
});
