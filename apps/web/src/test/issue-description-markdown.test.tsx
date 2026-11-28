import React from "react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
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

async function showDescription(description: string) {
  request.mockReset();
  request.mockImplementation(async (query: string) => {
    if (query.includes("query IssueDetail")) return { issue: {
      id: "issue", title: "Fix login", description, category: "BUG_FIX", status: "OPEN", noExecutableTests: false,
      bountyAmount: { formatted: "100", raw: "100000000", decimals: 6 }, clientId: "client", developerId: null, client: person("client"),
      token: { symbol: "USDC", name: "USD Coin" }, requiredSkills: [], createdAt: "2026-11-17T00:00:00Z", viewCount: 0,
      attachments: [], viewerCapabilities: { canApply: true, similarFixIssueId: null }, escrow: null,
    } };
    if (query.includes("TaskTestCases")) return { testCases: [] };
    if (query.includes("UnreadMessages")) return { unreadMessageCount: 0 };
    return {};
  });
  await act(async () => { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><IssueDetailView issueId="issue" /></QueryClientProvider>); });
  await screen.findByText("Fix login");
  return screen.getByTestId("issue-description");
}

afterEach(() => cleanup());

describe("bounty description markdown (US-158)", () => {
  it("renders headings, lists, emphasis and code", async () => {
    const box = await showDescription("## Steps\n\n- open **login**\n- run `bun test`\n\n```\nconst x = 1;\n```");
    expect(within(box).getByRole("heading", { level: 2, name: "Steps" })).toBeInTheDocument();
    expect(within(box).getAllByRole("listitem")).toHaveLength(2);
    expect(within(box).getByText("login").tagName).toBe("STRONG");
    expect(within(box).getByText("bun test").tagName).toBe("CODE");
    expect(box.querySelector("pre code")?.textContent).toBe("const x = 1;\n");
  });

  it("renders GitHub-flavored tables, task lists and strikethrough", async () => {
    const box = await showDescription("| Case | Result |\n| --- | --- |\n| empty | 400 |\n\n- [x] repro\n- [ ] fix\n\n~~old scope~~");
    expect(within(box).getByRole("table")).toBeInTheDocument();
    expect(within(box).getByRole("cell", { name: "400" })).toBeInTheDocument();
    const boxes = within(box).getAllByRole("checkbox");
    expect(boxes.map((input) => (input as HTMLInputElement).checked)).toEqual([true, false]);
    expect(within(box).getByText("old scope").tagName).toBe("DEL");
  });

  it("does not render raw HTML, images or script links", async () => {
    const box = await showDescription("<b>raw</b> ![x](https://evil.test/x.png) [bad](javascript:alert(1)) [ok](https://example.com)");
    expect(box.querySelector("b")).toBeNull();
    expect(box.querySelector("img")).toBeNull();
    expect(within(box).getByText("bad").getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
    expect(within(box).getByRole("link", { name: "ok" })).toHaveAttribute("rel", "noopener noreferrer nofollow");
  });
});
