import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "socket.io";

const { verifyJWT, prisma } = vi.hoisted(() => ({
  verifyJWT: vi.fn(),
  prisma: { issue: { findUnique: vi.fn() } },
}));

vi.mock("../lib/auth", () => ({ tokenFromCookieHeader: () => null, verifyJWT }));
vi.mock("@bloody-roar/database", () => ({
  prisma,
  AILogStatus: {},
  NotificationType: {},
  Prisma: {},
}));

import { registerSocketHandlers } from "../socket/handlers";

const client = { id: "client-1", role: "CLIENT" };

function connectSocket() {
  let onConnection: ((socket: unknown) => void) | undefined;
  const io = {
    use: vi.fn(),
    on: vi.fn((event: string, handler: (socket: unknown) => void) => {
      if (event === "connection") onConnection = handler;
    }),
  };
  registerSocketHandlers(io as unknown as Server);

  const listeners = new Map<string, (...args: unknown[]) => unknown>();
  const socket = {
    id: "socket-1",
    data: { user: client, token: "token-1" },
    rooms: new Set<string>(),
    join: vi.fn(),
    leave: vi.fn(),
    disconnect: vi.fn(),
    on: (event: string, handler: (...args: unknown[]) => unknown) => listeners.set(event, handler),
  };
  onConnection?.(socket);

  const send = (callback: (error?: string) => void) =>
    listeners.get("message:send")?.({ content: "hi", type: "TEXT", issueId: "issue-1" }, callback);
  return { socket, send };
}

describe("socket message:send session check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects and disconnects once the session has been revoked", async () => {
    const { socket, send } = connectSocket();
    verifyJWT.mockResolvedValueOnce(client);
    prisma.issue.findUnique.mockResolvedValueOnce(null);

    const first = vi.fn();
    await send(first);
    expect(first).toHaveBeenCalledWith("Task not found");
    expect(socket.disconnect).not.toHaveBeenCalled();

    verifyJWT.mockResolvedValueOnce(null);
    const second = vi.fn();
    await send(second);

    expect(verifyJWT).toHaveBeenLastCalledWith("token-1");
    expect(second).toHaveBeenCalledWith("Unauthorized");
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(prisma.issue.findUnique).toHaveBeenCalledTimes(1);
  });
});
