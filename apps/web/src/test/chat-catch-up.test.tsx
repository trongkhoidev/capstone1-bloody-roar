import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GraphQLRequestError } from "../lib/graphql-client";
import { ChatCatchUp } from "../components/chat/chat-catch-up";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../lib/graphql-client", async (original) => ({ ...await original<object>(), graphqlRequest: request }));

afterEach(() => { cleanup(); request.mockReset(); });

async function catchUp(result: Promise<unknown>) {
  request.mockReturnValue(result);
  render(<ChatCatchUp conversationId="room" />);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Catch up" })); });
}

describe("chat catch up (US-88)", () => {
  it("shows the AI summary as advisory and lets the user dismiss it", async () => {
    await catchUp(Promise.resolve({ summarizeConversation: { status: "OK", summary: "- Client approved the fix", messageCount: 3 } }));
    expect(request.mock.calls[0]?.[1]).toEqual({ id: "room" });
    expect(screen.getByText("- Client approved the fix")).toBeInTheDocument();
    expect(screen.getByText(/AI-generated summary/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss summary" }));
    expect(screen.queryByText("- Client approved the fix")).not.toBeInTheDocument();
  });

  it("says the user is caught up when nothing is unread", async () => {
    await catchUp(Promise.resolve({ summarizeConversation: { status: "EMPTY", summary: null, messageCount: 0 } }));
    expect(screen.getByText("You're all caught up")).toBeInTheDocument();
  });

  it("shows the unread count when AI is unavailable", async () => {
    await catchUp(Promise.resolve({ summarizeConversation: { status: "AI_UNAVAILABLE", summary: null, messageCount: 7 } }));
    expect(screen.getByText("AI unavailable · 7 unread messages")).toBeInTheDocument();
  });

  it("shows errors inline", async () => {
    await catchUp(Promise.reject(new GraphQLRequestError({ message: "Too many AI requests", extensions: { code: "RATE_LIMITED" } })));
    expect(screen.getByRole("alert")).toHaveTextContent("Too many AI requests");
  });

  it("announces results in a live region and marks the button busy while loading", async () => {
    let resolve: (value: unknown) => void = () => {};
    await catchUp(new Promise((r) => { resolve = r; }));
    const button = screen.getByRole("button", { name: /Catching up/ });
    expect(button).toHaveAttribute("aria-busy", "true");
    const live = document.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    await act(async () => { resolve({ summarizeConversation: { status: "EMPTY", summary: null, messageCount: 0 } }); });
    expect(live).toHaveTextContent("You're all caught up");
    expect(screen.getByRole("button", { name: "Catch up" })).toHaveAttribute("aria-busy", "false");
  });
});
