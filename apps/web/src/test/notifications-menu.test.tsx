import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { useAuthStore } from "@/lib/store/use-auth-store";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/graphql-client", () => ({ graphqlRequest: request }));

class FakeEvents {
  static instance: FakeEvents;
  onopen: (() => void) | null = null;
  listener: (() => void) | null = null;
  constructor() { FakeEvents.instance = this; }
  addEventListener(_name: string, listener: () => void) { this.listener = listener; }
  close() {}
}

const notification = { id: "n1", type: "MESSAGE_RECEIVED", title: "New message", body: "Hello", isRead: false, createdAt: "2026-01-01T00:00:00Z" };
const user = { id: "user-1", role: "CLIENT" } as never;

beforeEach(() => {
  vi.stubGlobal("EventSource", FakeEvents);
  request.mockReset();
  request.mockResolvedValue({ unreadNotificationCount: 1, notifications: [notification] });
  useAuthStore.setState({ user, status: "authenticated" });
});
afterEach(() => vi.unstubAllGlobals());

function renderMenu(client: QueryClient) {
  return render(<QueryClientProvider client={client}><NotificationsMenu /></QueryClientProvider>);
}

describe("notifications menu", () => {
  it("restores the cached badge and does not fetch on bell clicks", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
    client.setQueryData(["notifications", "user-1"], { unreadNotificationCount: 1, notifications: [notification] });
    renderMenu(client);
    expect(screen.getByRole("button", { name: "Notifications, 1 unread" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    fireEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    expect(request).not.toHaveBeenCalled();
  });

  it("links a similar-issue notification to the new bounty", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
    const similar = { id: "n2", type: "SIMILAR_ISSUE_POSTED", title: "Similar issue posted", body: 'A new bounty looks like an issue you fixed: "Fix login".', isRead: false, link: "/issues/new-1", createdAt: "2026-01-01T00:00:00Z" };
    client.setQueryData(["notifications", "user-1"], { unreadNotificationCount: 1, notifications: [similar] });
    renderMenu(client);
    fireEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    expect(screen.getByText(similar.body).closest("a")?.getAttribute("href")).toBe("/issues/new-1");
  });

  it("only displays the signed-in user's cached notifications", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
    client.setQueryData(["notifications", "user-1"], { unreadNotificationCount: 7, notifications: [notification] });
    client.setQueryData(["notifications", "user-2"], { unreadNotificationCount: 2, notifications: [] });
    useAuthStore.setState({ user: { id: "user-2", role: "CLIENT" } as never });
    renderMenu(client);
    expect(screen.getByRole("button", { name: "Notifications, 2 unread" })).toBeTruthy();
  });

  it("refreshes after an SSE event and marks a notification read immediately", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let finish!: () => void;
    request.mockImplementation((query: string) => query.includes("MarkNotificationRead")
      ? new Promise<void>((resolve) => { finish = resolve; })
      : Promise.resolve({ unreadNotificationCount: 1, notifications: [notification] }));
    renderMenu(client);
    await screen.findByRole("button", { name: "Notifications, 1 unread" });
    act(() => FakeEvents.instance.listener?.());
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    const link = screen.getByRole("link", { name: /New message/ });
    link.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(link);
    await screen.findByRole("button", { name: "Notifications" });
    expect(request.mock.calls.some(([query]) => String(query).includes("MarkNotificationRead"))).toBe(true);
    await act(async () => { finish(); });
  });

  it("restores an unread badge if marking it read fails", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
    client.setQueryData(["notifications", "user-1"], { unreadNotificationCount: 1, notifications: [notification] });
    let fail!: () => void;
    request.mockImplementation((query: string) => query.includes("MarkNotificationRead")
      ? new Promise<void>((_resolve, reject) => { fail = () => reject(new Error("offline")); })
      : Promise.resolve({ unreadNotificationCount: 1, notifications: [notification] }));
    renderMenu(client);
    fireEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    const link = screen.getByRole("link", { name: /New message/ });
    link.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(link);
    await screen.findByRole("button", { name: "Notifications" });
    await act(async () => { fail(); });
    await screen.findByRole("button", { name: "Notifications, 1 unread" });
  });
});
