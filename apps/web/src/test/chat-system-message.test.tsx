import React from "react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatRoom } from "../components/chat/chat-room";

type Handler = (...args: unknown[]) => void;
const { request, session, handlers, emit } = vi.hoisted(() => ({
  request: vi.fn(),
  session: { user: { id: "dev", role: "DEVELOPER" } },
  handlers: new Map<string, Handler>(),
  emit: vi.fn((_event: string, _arg: unknown, callback?: () => void) => callback?.()),
}));
vi.mock("../lib/graphql-client", async (original) => ({ ...await original<object>(), graphqlRequest: request }));
vi.mock("../lib/store/use-auth-store", () => ({ useAuthStore: (selector: (state: typeof session) => unknown) => selector(session) }));
vi.mock("socket.io-client", () => ({ io: () => ({ connected: true, emit, on: (event: string, handler: Handler) => handlers.set(event, handler), disconnect: vi.fn() }) }));

const node = (id: string, content: string, type: "TEXT" | "SYSTEM", createdAt: string) => ({
  id, content, type, wasModified: false, conversationId: "conv", issueId: "issue", senderId: "client", replyToId: null, createdAt,
  sender: { name: "Client Co", avatar: null }, attachments: [],
});
const page = (...nodes: ReturnType<typeof node>[]) => ({ messages: { edges: nodes.map((n) => ({ cursor: n.id, node: n })), pageInfo: { hasNextPage: false, startCursor: null } } });

afterEach(() => { cleanup(); handlers.clear(); request.mockReset(); emit.mockClear(); });

describe("chat SYSTEM messages (US-87)", () => {
  it("renders a SYSTEM message as a plain centered row without avatar or sender", async () => {
    request.mockImplementation(async (query: string) => query.includes("TaskMessages") ? page(node("m1", "Hello", "TEXT", "2026-11-27T10:00:00Z"), node("s1", "Escrow funded", "SYSTEM", "2026-11-27T10:01:00Z")) : {});
    await act(async () => { render(<ChatRoom issueId="issue" conversationId="conv" />); });
    const row = (await screen.findByText("Escrow funded")).closest("[data-message-type]");
    expect(row).toHaveAttribute("data-message-type", "SYSTEM");
    expect(within(row as HTMLElement).queryByText("Client Co")).toBeNull();
    expect(within(row as HTMLElement).queryByText("CC")).toBeNull();
    expect(screen.getByText("Hello").closest("[data-message-type]")).toHaveAttribute("data-message-type", "TEXT");
  });

  it("joins the task room and reloads messages on escrow:invalidate", async () => {
    let released = false;
    request.mockImplementation(async (query: string) => query.includes("TaskMessages")
      ? page(node("s1", "Escrow funded", "SYSTEM", "2026-11-27T10:01:00Z"), ...(released ? [node("s2", "Funds released", "SYSTEM", "2026-11-27T11:00:00Z")] : []))
      : {});
    await act(async () => { render(<ChatRoom issueId="issue" conversationId="conv" kind="ISSUE_WORK" />); });
    await act(async () => { handlers.get("connect")?.(); });
    expect(emit).toHaveBeenCalledWith("task:join", "issue", expect.any(Function));
    released = true;
    await act(async () => { handlers.get("escrow:invalidate")?.({ escrowId: "esc", projectionVersion: 2 }); });
    expect(await screen.findByText("Funds released")).toBeInTheDocument();
    expect(screen.getByText("Escrow funded")).toBeInTheDocument();
  });

  it("does not join the task room or listen for escrow updates in an application conversation", async () => {
    request.mockImplementation(async (query: string) => query.includes("TaskMessages") ? page(node("m1", "Hello", "TEXT", "2026-11-27T10:00:00Z")) : {});
    await act(async () => { render(<ChatRoom issueId="issue" conversationId="conv" kind="APPLICATION" />); });
    await act(async () => { handlers.get("connect")?.(); });
    expect(emit).toHaveBeenCalledWith("conversation:join", "conv", expect.any(Function));
    expect(emit).not.toHaveBeenCalledWith("task:join", expect.anything(), expect.anything());
    expect(handlers.has("escrow:invalidate")).toBe(false);
  });
});
