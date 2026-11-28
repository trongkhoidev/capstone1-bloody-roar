import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IssueDetailView } from "../components/marketplace/issue-detail-view";
import { GraphQLRequestError } from "../lib/graphql-client";

const { request, send, session, socketHandlers } = vi.hoisted(() => ({
  request: vi.fn(),
  send: vi.fn(),
  session: { user: { id: "client", role: "CLIENT", walletAddress: "0x1111111111111111111111111111111111111111" } },
  socketHandlers: new Map<string, () => void>(),
}));
vi.mock("../lib/graphql-client", async (original) => ({ ...await original<object>(), graphqlRequest: request }));
vi.mock("../lib/store/use-auth-store", () => ({ useAuthStore: (selector: (state: typeof session) => unknown) => selector(session) }));
vi.mock("../lib/ui-preferences", () => ({ useUiPreferences: () => ({ theme: "light" }) }));
vi.mock("../lib/web3/send-prepared", () => ({ sendPreparedCalls: send }));
vi.mock("socket.io-client", () => ({ io: () => ({ emit: vi.fn(), on: (event: string, handler: () => void) => socketHandlers.set(event, handler), disconnect: vi.fn() }) }));
vi.mock("../components/issues/source-panel", () => ({ SourcePanel: () => null }));
vi.mock("../components/issues/test-case-panel", () => ({ TestCasePanel: () => null }));
vi.mock("../components/issues/test-run-panel", () => ({ TestRunPanel: ({ submissionId }: { submissionId?: string }) => <p>Checks for {submissionId}</p> }));
vi.mock("../components/marketplace/issue-comments", () => ({ IssueComments: () => null }));
vi.mock("../components/chat/chat-room", () => ({ IssueChatRoom: () => null }));

const person = (id: string) => ({ id, name: id, walletAddress: "0x1111111111111111111111111111111111111111", reputationScore: 0, isGithubVerified: false });
const hashOld = `0x${"a".repeat(64)}`;
const hashSeen = `0x${"b".repeat(60)}beef`;
const hashNew = `0x${"c".repeat(60)}cafe`;
const delivery = (id: string, deliveryHash: string, status = "SUBMITTED") => ({
  id, status, deliveryHash, description: `Delivery ${id}`, pullRequestUrl: null, submittedAt: "2026-11-28T00:00:00Z",
  reviewedAt: null, reviewNotes: null, developer: { name: "developer", walletAddress: "0x2" },
});
const prepared = { intentId: "release", method: "releaseFunds", contractAddress: "0xescrow", data: "0x", value: "0" };
let submissions: ReturnType<typeof delivery>[];
let releaseError: Error | null;

beforeEach(() => {
  submissions = [delivery("seen", hashSeen), delivery("old", hashOld, "SUPERSEDED")];
  releaseError = null;
  socketHandlers.clear();
  send.mockReset();
  send.mockResolvedValue(undefined);
  request.mockReset();
  request.mockImplementation(async (query: string) => {
    if (query.includes("query IssueDetail") || query.includes("query IssueActions")) return { issue: {
      id: "issue", title: "Fix addition", description: "Fix the sum function.", category: "BUG_FIX", status: "IN_PROGRESS",
      noExecutableTests: false, bountyAmount: { formatted: "100", raw: "100000000", decimals: 6 },
      clientId: "client", developerId: "developer", client: person("client"), developer: person("developer"),
      token: { symbol: "USDC", name: "USD Coin" }, requiredSkills: [], createdAt: "2026-11-17T00:00:00Z", viewCount: 0,
      attachments: [], viewerCapabilities: { canRelease: true },
      escrow: { availableActions: [{ action: "releaseFunds", reasonDisabled: null }] },
      viewerSubmissions: submissions,
    } };
    if (query.includes("mutation PrepareRelease")) { if (releaseError) throw releaseError; return { prepareReleaseFunds: prepared }; }
    if (query.includes("TaskSubmissions")) return { submissions };
    if (query.includes("MyTransactions")) return { myTransactions: [{ id: "release", method: "releaseFunds", status: "SUBMITTED", txHash: "0xr", failureReason: null }] };
    if (query.includes("UnreadMessages")) return { unreadMessageCount: 0 };
    return {};
  });
});
afterEach(cleanup);

async function openDeliveries() {
  await act(async () => { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><IssueDetailView issueId="issue" /></QueryClientProvider>); });
  await screen.findByText("Fix addition");
  await act(async () => { fireEvent.click(screen.getByRole("tab", { name: /delivery/i })); });
}
const releaseButton = () => screen.getByRole("button", { name: "Release" });

describe("client review of deliveries (US-38)", () => {
  it("shows each delivery's full hash next to its own checks, with the disclaimer", async () => {
    await openDeliveries();
    expect(screen.getByText(hashSeen)).toBeInTheDocument();
    expect(screen.getByText(hashOld)).toBeInTheDocument();
    expect(screen.getByText("Checks for seen")).toBeInTheDocument();
    expect(screen.getByText("Checks for old")).toBeInTheDocument();
    expect(screen.getAllByText("Automated checks are a signal, not a guarantee.")).toHaveLength(2);
  });

  it("confirms the exact payout and fee before releasing the version on screen", async () => {
    await openDeliveries();
    await act(async () => { fireEvent.click(releaseButton()); });
    const dialog = screen.getByRole("dialog", { name: "Release payment" });
    expect(within(dialog).getByText(`${hashSeen.slice(0, 10)}…${hashSeen.slice(-6)}`)).toBeInTheDocument();
    expect(within(dialog).getByTestId("release-developer")).toHaveTextContent("100 USDC");
    expect(within(dialog).getByTestId("release-fee")).toHaveTextContent("10 USDC");
    expect(within(dialog).getByText("Platform fee (10%)")).toBeInTheDocument();
    expect(within(dialog).getByTestId("release-total")).toHaveTextContent("110 USDC");
    expect(request).not.toHaveBeenCalledWith(expect.stringContaining("mutation PrepareRelease"), expect.anything());
    expect(send).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Confirm release" })); });
    expect(request).toHaveBeenCalledWith(expect.stringContaining("mutation PrepareRelease"), { id: "issue", deliveryHash: hashSeen });
    expect(send).toHaveBeenCalledWith([prepared], expect.any(Function), session.user.walletAddress);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(await screen.findByTestId("transaction-status")).toHaveTextContent("Sent");
  });

  it("cancelling the dialog sends nothing", async () => {
    await openDeliveries();
    await act(async () => { fireEvent.click(releaseButton()); });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it("locks release when the server reports a newer delivery, until the client opens it", async () => {
    await openDeliveries();
    releaseError = new GraphQLRequestError({ message: "A newer Submission was made. Refresh and review it before releasing", extensions: { code: "DELIVERY_CHANGED" } });
    submissions = [delivery("new", hashNew), delivery("seen", hashSeen, "SUPERSEDED"), delivery("old", hashOld, "SUPERSEDED")];
    await act(async () => { fireEvent.click(releaseButton()); });
    await act(async () => { fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm release" })); });
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByText("The developer submitted a new version. Review it before releasing.")).toBeInTheDocument();
    expect(releaseButton()).toBeDisabled();
    releaseError = null;
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Open the new version" })); });
    expect(screen.queryByText("The developer submitted a new version. Review it before releasing.")).toBeNull();
    expect(releaseButton()).toBeEnabled();
    await act(async () => { fireEvent.click(releaseButton()); });
    await act(async () => { fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm release" })); });
    expect(request).toHaveBeenCalledWith(expect.stringContaining("mutation PrepareRelease"), { id: "issue", deliveryHash: hashNew });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("locks release when a new version arrives over the socket", async () => {
    await openDeliveries();
    expect(releaseButton()).toBeEnabled();
    submissions = [delivery("new", hashNew), delivery("seen", hashSeen, "SUPERSEDED"), delivery("old", hashOld, "SUPERSEDED")];
    await act(async () => { socketHandlers.get("escrow:invalidate")?.(); });
    expect(await screen.findByText("The developer submitted a new version. Review it before releasing.")).toBeInTheDocument();
    expect(releaseButton()).toBeDisabled();
  });

  it("says that requested changes stay off-chain", async () => {
    await openDeliveries();
    expect(screen.getByText("Change requests are saved on Bloody-Roar only. Nothing is sent on-chain.")).toBeInTheDocument();
  });
});
