import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IssueDetailView } from "../components/marketplace/issue-detail-view";

const { request, send, session } = vi.hoisted(() => ({
  request: vi.fn(),
  send: vi.fn(),
  session: { user: { id: "developer", role: "DEVELOPER", walletAddress: "0x2222222222222222222222222222222222222222" } },
}));
vi.mock("../lib/graphql-client", async (original) => ({ ...await original<object>(), graphqlRequest: request }));
vi.mock("../lib/store/use-auth-store", () => ({ useAuthStore: (selector: (state: typeof session) => unknown) => selector(session) }));
vi.mock("../lib/ui-preferences", () => ({ useUiPreferences: () => ({ theme: "light" }) }));
vi.mock("../lib/web3/send-prepared", () => ({ sendPreparedCalls: send }));
vi.mock("socket.io-client", () => ({ io: () => ({ emit: vi.fn(), on: vi.fn(), disconnect: vi.fn() }) }));
vi.mock("../components/issues/source-panel", () => ({ SourcePanel: () => null }));
vi.mock("../components/issues/test-case-panel", () => ({ TestCasePanel: () => null }));
vi.mock("../components/issues/test-run-panel", () => ({
  TestRunPanel: ({ onPassed }: { onPassed?: (passed: boolean) => void }) => <button type="button" onClick={() => onPassed?.(true)}>Simulate passing run</button>,
}));
vi.mock("../components/marketplace/issue-comments", () => ({ IssueComments: () => null }));
vi.mock("../components/chat/chat-room", () => ({ IssueChatRoom: () => null }));

const person = (id: string) => ({ id, name: id, walletAddress: "0x2222222222222222222222222222222222222222", reputationScore: 0, isGithubVerified: false });
const prepared = { intentId: "intent", method: "submitWork", contractAddress: "0xescrow", data: "0x", value: "0" };
let drafts: number;

beforeEach(() => {
  drafts = 0;
  send.mockReset();
  send.mockResolvedValue(undefined);
  request.mockReset();
  request.mockImplementation(async (query: string) => {
    if (query.includes("query IssueDetail") || query.includes("query IssueActions")) return { issue: {
      id: "issue", title: "Fix addition", description: "Fix the sum function.", category: "BUG_FIX", status: "IN_PROGRESS",
      noExecutableTests: false, bountyAmount: { formatted: "100", raw: "100000000", decimals: 6 },
      clientId: "client", developerId: "developer", client: person("client"), developer: person("developer"),
      token: { symbol: "USDC", name: "USD Coin" }, requiredSkills: [], createdAt: "2026-11-17T00:00:00Z", viewCount: 0,
      attachments: [], viewerCapabilities: { canSubmit: true }, escrow: { availableActions: [{ action: "submitWork", reasonDisabled: null }] },
      viewerSubmissions: [],
    } };
    if (query.includes("mutation CreateDraft")) { drafts += 1; return { createSubmissionDraft: { id: `draft-${drafts}` } }; }
    if (query.includes("mutation PrepareSubmit")) return { prepareSubmitWork: prepared };
    if (query.includes("TaskSubmissions")) return { submissions: [] };
    if (query.includes("MyTransactions")) return { myTransactions: [{ ...prepared, id: "intent", status: "SUBMITTED", txHash: "0xabc", failureReason: null }] };
    if (query.includes("UnreadMessages")) return { unreadMessageCount: 0 };
    return {};
  });
});
afterEach(cleanup);

async function openDelivery() {
  await act(async () => { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><IssueDetailView issueId="issue" /></QueryClientProvider>); });
  await screen.findByText("Fix addition");
  await act(async () => { fireEvent.click(screen.getByRole("tab", { name: /delivery/i })); });
  const form = screen.getByRole("form", { name: "Submit your delivery" });
  fireEvent.change(within(form).getByLabelText("Summary of changes"), { target: { value: "Fixed the sum." } });
  return form;
}

describe("developer submission steps (US-39)", () => {
  it("shows four steps and keeps Prepare locked until the current draft passes", async () => {
    const form = await openDelivery();
    const steps = within(form).getAllByRole("listitem").map((item) => item.textContent);
    expect(steps).toEqual([expect.stringContaining("Upload patch"), expect.stringContaining("Run tests"), expect.stringContaining("Prepare"), expect.stringContaining("Sign")]);
    const prepare = within(form).getByRole("button", { name: "Prepare submission" });
    expect(prepare).toBeDisabled();
    await act(async () => { fireEvent.click(within(form).getByRole("button", { name: "Save draft to run tests" })); });
    expect(prepare).toBeDisabled();
    await act(async () => { fireEvent.click(within(form).getByRole("button", { name: "Simulate passing run" })); });
    expect(prepare).toBeEnabled();
  });

  it("locks Prepare again when the draft is edited after a pass", async () => {
    const form = await openDelivery();
    await act(async () => { fireEvent.click(within(form).getByRole("button", { name: "Save draft to run tests" })); });
    await act(async () => { fireEvent.click(within(form).getByRole("button", { name: "Simulate passing run" })); });
    fireEvent.change(within(form).getByLabelText("Summary of changes"), { target: { value: "Fixed the sum and the docs." } });
    expect(within(form).getByRole("button", { name: "Prepare submission" })).toBeDisabled();
  });

  it("signs only the prepared call, after a warning, and then tracks it", async () => {
    const form = await openDelivery();
    await act(async () => { fireEvent.click(within(form).getByRole("button", { name: "Save draft to run tests" })); });
    await act(async () => { fireEvent.click(within(form).getByRole("button", { name: "Simulate passing run" })); });
    const sign = within(form).getByRole("button", { name: "Submit for review" });
    expect(sign).toBeDisabled();
    await act(async () => { fireEvent.click(within(form).getByRole("button", { name: "Prepare submission" })); });
    expect(request).toHaveBeenCalledWith(expect.stringContaining("mutation PrepareSubmit"), { id: "draft-1" });
    expect(within(form).getByText("You cannot change this delivery after you sign.")).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(sign); });
    expect(send).toHaveBeenCalledWith([prepared], expect.any(Function), session.user.walletAddress);
    expect(await screen.findByText("Sent")).toBeInTheDocument();
  });
});
