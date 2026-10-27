import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "socket.io";

const { verifyJWT, prisma, tx } = vi.hoisted(() => {
  const tx = {
    issue: { findUnique: vi.fn() },
    message: { create: vi.fn(), findUniqueOrThrow: vi.fn() },
    attachment: { create: vi.fn() },
  };
  const prisma = {
    ...tx,
    aILog: { create: vi.fn(() => Promise.resolve()) },
    notification: { create: vi.fn() },
    $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  return { verifyJWT: vi.fn(), prisma, tx };
});

vi.mock("../lib/auth", () => ({ tokenFromCookieHeader: () => null, verifyJWT }));
vi.mock("../lib/storage", () => ({
  getS3Storage: () => ({
    bucket: "uploads",
    client: {
      send: vi.fn(async () => ({
        ContentLength: 1234,
        ContentType: "application/pdf",
        Metadata: { uploader: "client-1" },
      })),
    },
  }),
  localUploadPath: () => null,
}));
vi.mock("@bloody-roar/database", () => ({
  prisma,
  AILogStatus: { SUCCESS: "SUCCESS" },
  NotificationType: { MESSAGE_RECEIVED: "MESSAGE_RECEIVED" },
  Prisma: { TransactionIsolationLevel: { Serializable: "Serializable" } },
}));

import { registerSocketHandlers } from "../socket/handlers";

const client = { id: "client-1", role: "CLIENT", name: "Client" };
const openIssue = { clientId: "client-1", developerId: "dev-1", status: "IN_PROGRESS", title: "Build" };

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
    data: { user: client, token: "token-1" },
    rooms: new Set<string>(["task:issue-1"]),
    join: vi.fn(),
    leave: vi.fn(),
    disconnect: vi.fn(),
    on: (event: string, handler: (...args: unknown[]) => unknown) => listeners.set(event, handler),
  };
  onConnection?.(socket);

  const send = (payload: Record<string, unknown>, callback: (error?: string) => void) =>
    listeners.get("message:send")?.({ issueId: "issue-1", ...payload }, callback);
  return { socket, send };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:4000");
  vi.stubEnv("AI_EXTERNAL_GUARD", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("socket message:send session check", () => {
  it("rejects and disconnects once the session has been revoked", async () => {
    const { socket, send } = connectSocket();
    verifyJWT.mockResolvedValueOnce(client);
    prisma.issue.findUnique.mockResolvedValueOnce(null);

    const first = vi.fn();
    await send({ content: "hi", type: "TEXT" }, first);
    expect(first).toHaveBeenCalledWith("Task not found");
    expect(socket.disconnect).not.toHaveBeenCalled();

    verifyJWT.mockResolvedValueOnce(null);
    const second = vi.fn();
    await send({ content: "hi", type: "TEXT" }, second);

    expect(verifyJWT).toHaveBeenLastCalledWith("token-1");
    expect(second).toHaveBeenCalledWith("Unauthorized");
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(prisma.issue.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe("socket message:send AI guard on files", () => {
  it("masks an email in the file name and a private key in the caption before saving", async () => {
    const { send } = connectSocket();
    const key = `0x${"c3".repeat(32)}`;
    verifyJWT.mockResolvedValueOnce(client);
    prisma.issue.findUnique.mockResolvedValueOnce(openIssue);
    tx.issue.findUnique.mockResolvedValueOnce(openIssue);
    tx.message.create.mockResolvedValueOnce({ id: "message-1" });
    tx.message.findUniqueOrThrow.mockResolvedValueOnce({
      id: "message-1",
      content: "key [REDACTED]",
      type: "FILE",
      issueId: "issue-1",
      senderId: "client-1",
      wasModified: true,
      createdAt: new Date(),
      attachments: [],
    });
    prisma.notification.create.mockResolvedValueOnce({
      id: "n1",
      type: "MESSAGE_RECEIVED",
      title: "t",
      body: "b",
      link: "/issues/issue-1",
      createdAt: new Date(),
    });

    const callback = vi.fn();
    await send({
      content: `key ${key}`,
      type: "FILE",
      fileUrl: "http://localhost:4000/api/uploads?key=client-1/a.pdf",
      fileName: "dev@example.com.pdf",
      fileSize: 1234,
      fileMime: "application/pdf",
    }, callback);

    expect(callback.mock.calls[0]).toEqual([]);
    expect(tx.message.create.mock.calls[0]?.[0].data).toMatchObject({ content: "key [REDACTED]", wasModified: true });
    expect(tx.attachment.create.mock.calls[0]?.[0].data.fileName).toBe("[REDACTED]");
  });
});
