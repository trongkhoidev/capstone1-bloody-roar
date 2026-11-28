import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IssueDetailView } from "../components/marketplace/issue-detail-view";

const { request, send, session } = vi.hoisted(() => ({
  request: vi.fn(),
  send: vi.fn(),
  session: { user: { id: "client", role: "CLIENT", walletAddress: "0x1111111111111111111111111111111111111111" } },
}));
vi.mock("../lib/graphql-client", async (original) => ({ ...await original<object>(), graphqlRequest: request }));
vi.mock("../lib/store/use-auth-store", () => ({ useAuthStore: (selector: (state: typeof session) => unknown) => selector(session) }));
vi.mock("../lib/ui-preferences", () => ({ useUiPreferences: () => ({ theme: "light" }) }));
vi.mock("../lib/web3/send-prepared", () => ({ sendPreparedCalls: send }));
vi.mock("../lib/web3/funding-intent", () => ({ signFundingIntent: async () => ({ signature: "0xsig", nonce: "1", intentExpiry: "2" }) }));
vi.mock("socket.io-client", () => ({ io: () => ({ emit: vi.fn(), on: vi.fn(), disconnect: vi.fn() }) }));
vi.mock("../components/issues/source-panel", () => ({ SourcePanel: () => null }));
vi.mock("../components/issues/test-case-panel", () => ({ TestCasePanel: () => null }));
vi.mock("../components/issues/test-run-panel", () => ({ TestRunPanel: () => null }));
vi.mock("../components/marketplace/issue-comments", () => ({ IssueComments: () => null }));
vi.mock("../components/chat/chat-room", () => ({ IssueChatRoom: () => null }));

const person = (id: string) => ({ id, name: id, walletAddress: "0x1111111111111111111111111111111111111111", reputationScore: 0, isGithubVerified: false });
const step = (intentId: string, method: string) => ({ intentId, method, contractAddress: "0xescrow", data: "0x", value: "0" });
const reservation = { id: "reservation", status: "AWAITING_FUNDING", chainId: 84532, contractAddress: "0xescrow", tokenAddress: "0xusdc", escrowKey: "0xkey", termsHash: "0xterms", amountRaw: "110000000", deliveryDeadline: "2026-12-31T00:00:00Z", clientWallet: "0x1", developerWallet: "0x2" };
const submission = { id: "submission", status: "SUBMITTED", deliveryHash: "0xdelivery", description: "Fixed the sum.", pullRequestUrl: null, submittedAt: "2026-11-28T00:00:00Z", reviewedAt: null, reviewNotes: null, developer: { name: "developer", walletAddress: "0x2" } };
let status: string;
let transactions: Array<{ id: string; method: string; status: string; txHash: string | null; failureReason: string | null }>;

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue(undefined);
  request.mockReset();
  request.mockImplementation(async (query: string) => {
    if (query.includes("query IssueDetail") || query.includes("query IssueActions")) return { issue: {
      id: "issue", title: "Fix addition", description: "Fix the sum function.", category: "BUG_FIX", status,
      noExecutableTests: true, bountyAmount: { formatted: "100", raw: "100000000", decimals: 6 },
      clientId: "client", developerId: "developer", client: person("client"), developer: person("developer"),
      token: { symbol: "USDC", name: "USD Coin" }, requiredSkills: [], createdAt: "2026-11-17T00:00:00Z", viewCount: 0,
      attachments: [], viewerCapabilities: { canFund: true, canRelease: true },
      escrow: { availableActions: [{ action: "releaseFunds", reasonDisabled: null }] },
      ownerApplications: status === "OPEN" ? [{ id: "application", status: "ACCEPTED", message: "I can fix it.", createdAt: "2026-11-18T00:00:00Z", developer: person("developer") }] : [],
      reservation: status === "OPEN" ? reservation : null, viewerSubmissions: status === "IN_PROGRESS" ? [submission] : [],
    } };
    if (query.includes("query Reservation")) return { reservation };
    if (query.includes("mutation FundingIntent")) return { submitFundingIntent: { id: "reservation" } };
    if (query.includes("mutation PrepareDeposit")) return { prepareEscrowDeposit: { steps: [step("approve", "approve"), step("deposit", "deposit")] } };
    if (query.includes("mutation PrepareRelease")) return { prepareReleaseFunds: step("release", "releaseFunds") };
    if (query.includes("TaskSubmissions")) return { submissions: [submission] };
    if (query.includes("MyTransactions")) return { myTransactions: transactions };
    if (query.includes("UnreadMessages")) return { unreadMessageCount: 0 };
    return {};
  });
});
afterEach(cleanup);

async function show() {
  await act(async () => { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><IssueDetailView issueId="issue" /></QueryClientProvider>); });
  await screen.findByText("Fix addition");
}

describe("funding and release share the transaction status (US-39)", () => {
  it("tracks both funding calls with the shared status", async () => {
    status = "OPEN";
    transactions = [
      { id: "approve", method: "approve", status: "CONFIRMED", txHash: "0xa", failureReason: null },
      { id: "deposit", method: "deposit", status: "PENDING_SAFE_HEAD", txHash: "0xd", failureReason: null },
    ];
    await show();
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Fund escrow" })); });
    expect(send).toHaveBeenCalledWith([step("approve", "approve"), step("deposit", "deposit")], expect.any(Function), session.user.walletAddress);
    expect(await screen.findByTestId("transaction-status")).toHaveTextContent("Waiting for safe block");
  });

  it("tracks the release with the shared status", async () => {
    status = "IN_PROGRESS";
    transactions = [{ id: "release", method: "releaseFunds", status: "FAILED", txHash: "0xr", failureReason: "Reverted: delivery changed" }];
    await show();
    await act(async () => { fireEvent.click(screen.getByRole("tab", { name: /delivery/i })); });
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Approve delivery" })); });
    expect(send).toHaveBeenCalledWith([step("release", "releaseFunds")], expect.any(Function), session.user.walletAddress);
    const banner = await screen.findByTestId("transaction-status");
    expect(banner).toHaveTextContent("Failed");
    expect(banner).toHaveTextContent("Reverted: delivery changed");
  });

  it("still shows a release that has not confirmed after two minutes (U-4)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    status = "IN_PROGRESS";
    transactions = [{ id: "release", method: "releaseFunds", status: "SUBMITTED", txHash: "0xr", failureReason: null }];
    await show();
    await act(async () => { fireEvent.click(screen.getByRole("tab", { name: /delivery/i })); });
    await act(async () => { fireEvent.click(await screen.findByRole("button", { name: "Approve delivery" })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(130_000); });
    expect(screen.getByRole("status")).toHaveTextContent("Sent");
    vi.useRealTimers();
  });
});
