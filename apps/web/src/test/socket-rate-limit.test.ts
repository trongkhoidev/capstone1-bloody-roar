import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "socket.io";

const { verifyJWT, prisma, tx } = vi.hoisted(() => {
  const tx = {
    issue: { findUnique: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([]),
    notification: { create: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    message: { create: vi.fn(), findFirst: vi.fn().mockResolvedValue(null), findUniqueOrThrow: vi.fn() },
    attachment: { create: vi.fn() },
    dispute: { findUnique: vi.fn(async (_args?: unknown) => null as { raisedAt: Date } | null) },
  };
  const prisma = {
    ...tx,
    aILog: { create: vi.fn(() => Promise.resolve()) },
    $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  return { verifyJWT: vi.fn(), prisma, tx };
});

vi.mock("../lib/auth", () => ({ tokenFromCookieHeader: () => null, verifyJWT }));
vi.mock("../lib/storage", () => ({ getS3Storage: () => ({}), localUploadPath: () => null }));
vi.mock("@bloody-roar/database", () => ({
  prisma,
  AILogStatus: { SUCCESS: "SUCCESS" },
  NotificationType: { MESSAGE_RECEIVED: "MESSAGE_RECEIVED" },
  Prisma: { TransactionIsolationLevel: { Serializable: "Serializable" }, PrismaClientKnownRequestError: class extends Error {} },
}));

import { registerSocketHandlers } from "../socket/handlers";

function connectSocket() {
  let onConnection: ((socket: unknown) => void) | undefined;
  const io = {
    use: vi.fn(),
    on: vi.fn((event: string, handler: (socket: unknown) => void) => {
      if (event === "connection") onConnection = handler;
    }),
    to: vi.fn(() => ({ emit: vi.fn() })),
  };
  registerSocketHandlers(io as unknown as Server);

  const listeners = new Map<string, (...args: unknown[]) => unknown>();
  const socket = {
    id: "socket-1",
    data: { token: "token-1" },
    rooms: new Set<string>(["task:issue-1"]),
    join: vi.fn(),
    leave: vi.fn(),
    disconnect: vi.fn(),
    on: (event: string, handler: (...args: unknown[]) => unknown) => listeners.set(event, handler),
  };
  onConnection?.(socket);

  return (payload: Record<string, unknown>, callback: (error?: string) => void) =>
    listeners.get("message:send")?.({ issueId: "issue-1", content: "hi", type: "TEXT", ...payload }, callback);
}

// Each test uses its own user: the rate limiter keeps counts in memory for the whole file.
function asUser(id: string) {
  verifyJWT.mockResolvedValue({ id, role: "CLIENT", name: id });
  const issue = { clientId: id, developerId: "dev-1", status: "IN_PROGRESS", title: "Build" };
  prisma.issue.findUnique.mockResolvedValue(issue);
  tx.issue.findUnique.mockResolvedValue(issue);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:4000");
  vi.stubEnv("AI_EXTERNAL_GUARD", "");
  tx.message.create.mockResolvedValue({ id: "message-1" });
  tx.message.findUniqueOrThrow.mockResolvedValue({
    id: "message-1",
    content: "hi",
    type: "TEXT",
    issueId: "issue-1",
    senderId: "rl-user",
    wasModified: false,
    createdAt: new Date(),
    attachments: [],
  });
  prisma.notification.create.mockResolvedValue({ id: "n1", type: "MESSAGE_RECEIVED", title: "t", body: "b", link: "/issues/issue-1", createdAt: new Date() });
});

describe("socket message:send rate limit", () => {
  it("accepts ten messages in ten seconds and rejects the eleventh", async () => {
    const send = connectSocket();
    asUser("rl-user");

    const callbacks = Array.from({ length: 11 }, () => vi.fn());
    for (const callback of callbacks) await send({}, callback);

    expect(callbacks.slice(0, 10).every((callback) => callback.mock.calls[0]?.length === 0)).toBe(true);
    expect(callbacks[10]).toHaveBeenCalledWith("Too many messages, slow down");
    expect(tx.message.create).toHaveBeenCalledTimes(10);
  });
});

describe("message notifications", () => {
  it("returns an error when notification persistence fails and accepts a retry", async () => {
    const send = connectSocket();
    asUser("notification-retry-user");
    prisma.notification.create.mockRejectedValueOnce(new Error("database unavailable"));
    const first = vi.fn();
    await send({ clientMessageId: "retry-1" }, first);
    expect(first).toHaveBeenCalledWith("Failed to send message");
    const retry = vi.fn();
    await send({ clientMessageId: "retry-1" }, retry);
    expect(retry).toHaveBeenCalledWith();
    expect(tx.message.create).toHaveBeenCalledTimes(2);
    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
  });
  it("replaces an unread notification inside the locked transaction", async () => {
    const send = connectSocket();
    asUser("notification-user");
    await send({}, vi.fn());
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({ where: { userId: "dev-1", type: "MESSAGE_RECEIVED", isRead: false, link: "/issues/issue-1" }, data: { isRead: true } });
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });
});

describe("socket message:send after a dispute", () => {
  it("marks a message sent after the dispute was raised as afterDispute", async () => {
    const send = connectSocket();
    asUser("rl-dispute");
    tx.dispute.findUnique.mockResolvedValueOnce({ raisedAt: new Date(Date.now() - 60_000) });

    const callback = vi.fn();
    await send({}, callback);

    expect(callback.mock.calls[0]).toEqual([]);
    expect(tx.message.create.mock.calls[0]?.[0].data).toMatchObject({ afterDispute: true });
  });

  it("does not mark messages sent before any dispute", async () => {
    const send = connectSocket();
    asUser("rl-plain");

    await send({}, vi.fn());

    expect(tx.message.create.mock.calls[0]?.[0].data).toMatchObject({ afterDispute: false });
  });
});
