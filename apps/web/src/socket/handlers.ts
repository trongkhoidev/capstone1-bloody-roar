// apps/web/src/socket/handlers.ts
// =============================================================================
// Socket.io event handlers — Sprint 0 scaffold
// Sprint 1: Add auth middleware + room management
// Sprint 2: Add AI Guard integration
// =============================================================================

import type { Server } from "socket.io";
import type { ServerToClientEvents, ClientToServerEvents, ChatMessagePayload } from "@bloody-roar/shared";
import { prisma, type Prisma } from "@bloody-roar/database";
import { createLogger } from "../lib/logger";
import { tokenFromCookieHeader, verifyJWT } from "../lib/auth";
import { accessibleConversation, workConversation } from "../lib/conversations";
import { saveConversationMessage, enforceMessageRate } from "../lib/chat-messages";
import { canReadConversation } from "../lib/chat-access";

const log = createLogger("socket.io");
type StoredMessage = Prisma.MessageGetPayload<{
  include: { attachments: true };
}>;
type ChatRoom = Prisma.ConversationGetPayload<{
  include: { issue: true; application: true; participants: true };
}>;
type BroadcastMessage = StoredMessage & {
  sender: { id: string; name: string | null; avatar: string | null };
};
type EvictableSocket = {
  id: string;
  data: { token?: string };
  leave(room: string): Promise<void> | void;
  disconnect(close?: boolean): void;
};
type RoomServer = {
  in(room: string): { fetchSockets(): Promise<EvictableSocket[]> };
};

const roomNames = (room: ChatRoom) => room.kind === "ISSUE_WORK" ? [`conv:${room.id}`, `task:${room.issueId}`] : [`conv:${room.id}`];

async function socketUser(token: string | undefined) {
  const verified = token ? await verifyJWT(token) : null;
  if (!verified) return null;
  const user = await prisma.user.findUnique({
    where: { id: verified.id },
    select: { id: true, role: true, isBanned: true },
  });
  return user && !user.isBanned ? user : null;
}

async function evictUnauthorized(io: RoomServer, room: ChatRoom, rooms: string[]): Promise<void> {
  const sockets = new Map<string, EvictableSocket>();
  for (const name of rooms) for (const socket of await io.in(name).fetchSockets()) sockets.set(socket.id, socket);
  await Promise.all([...sockets.values()].map(async (socket) => {
    const user = await socketUser(socket.data.token);
    const member = Boolean(user && room.participants.some((participant) => participant.userId === user.id));
    if (user && canReadConversation(room, room.issue, room.application, user, member)) return;
    await Promise.all(rooms.map((name) => socket.leave(name)));
    if (!user) socket.disconnect(true);
  }));
}

export async function evictIssueChat(io: RoomServer, issueId: string): Promise<void> {
  const room = await prisma.conversation.findFirst({
    where: { issueId, kind: "ISSUE_WORK" },
    include: { issue: true, application: true, participants: true },
  });
  if (room) await evictUnauthorized(io, room, roomNames(room));
}

export function notifyIssueAccessChanged(issueId: string): void {
  try {
    void evictIssueChat(getSocketIO(), issueId).catch((error) => log.error({ error, issueId }, "Failed to update chat room access"));
  } catch {
    return;
  }
}

export function toMessagePayload(
  message: StoredMessage,
  sender: { id: string; name: string | null; avatar: string | null },
): ChatMessagePayload {
  const attachment = message.attachments[0];
  return {
    id: message.id,
    content: message.content,
    type: message.type as "TEXT" | "FILE",
    senderId: sender.id,
    senderName: sender.name || "Anonymous",
    ...(sender.avatar ? { senderAvatar: sender.avatar } : {}),
    issueId: message.issueId,
    conversationId: message.conversationId ?? "",
    wasModified: message.wasModified,
    ...(attachment?.fileUrl ? { fileUrl: attachment.fileUrl } : {}),
    ...(attachment?.fileName ? { fileName: attachment.fileName } : {}),
    ...(message.replyToId ? { replyToId: message.replyToId } : {}),
    createdAt: message.createdAt.toISOString(),
  };
}

/**
 * Register all Socket.io event handlers
 * Called once when the server starts
 */
export function registerSocketHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
): void {
  log.info("Socket.io handlers registered");

  // -----------------------------------------------------------------------
  // Global middleware — runs before any event handler
  // -----------------------------------------------------------------------
  io.use(async (socket, next) => {
    const token =
      (socket.handshake.auth.token as string | undefined) ??
      tokenFromCookieHeader(socket.handshake.headers.cookie ?? null) ??
      undefined;

    if (token) {
      const user = await verifyJWT(token);
      if (!user) return next(new Error("Unauthorized"));
      socket.data.user = user;
      socket.data.token = token;
    } else {
      return next(new Error("Unauthorized"));
    }

    next();
  });

  // -----------------------------------------------------------------------
  // Connection handler
  // -----------------------------------------------------------------------
  io.on("connection", (socket) => {
    log.info({ socketId: socket.id }, "Client connected");
    const connectedUser = socket.data.user;
    if (connectedUser?.id) void socket.join(`user:${connectedUser.id}`);

    // -------------------------------------------------------------------
    // Room Management — join/leave task chat rooms
    // -------------------------------------------------------------------
    socket.on("conversation:join", async (conversationId, callback) => {
      try {
        const user = await verifyJWT(socket.data.token);
        if (!user) return callback?.("Unauthorized");
        await accessibleConversation(prisma, conversationId, user);
        await socket.join(`conv:${conversationId}`); callback?.();
      } catch { callback?.("You cannot access this conversation"); }
    });
    socket.on("conversation:leave", async (conversationId, callback) => { await socket.leave(`conv:${conversationId}`); callback?.(); });
    socket.on("task:join", async (issueId, callback) => {
      try {
        const user = await verifyJWT(socket.data.token);
        if (!user) return callback?.("Unauthorized");
        const room = await prisma.$transaction((tx) => workConversation(tx, issueId, user));
        await socket.join(`conv:${room.id}`); await socket.join(`task:${issueId}`); callback?.();
      } catch { callback?.("You cannot access this task room"); }
    });
    socket.on("task:leave", async (issueId, callback) => {
      const room = await prisma.conversation.findFirst({ where: { issueId, kind: "ISSUE_WORK" } });
      if (room) await socket.leave(`conv:${room.id}`);
      await socket.leave(`task:${issueId}`); callback?.();
    });

    // -------------------------------------------------------------------
    // Message handler
    // Sprint 2: Add AI Guard scanning before broadcast
    // -------------------------------------------------------------------
    socket.on("message:send", async (data, callback) => {
      try {
        const user = await verifyJWT(socket.data.token);
        if (!user) { socket.disconnect(true); return callback?.("Unauthorized"); }
        enforceMessageRate(user.id);
        if (user.role === "ADMIN") return callback?.("Administrators have read-only access to task evidence");
        const room = data.conversationId ? await accessibleConversation(prisma, data.conversationId, user, true) : await prisma.$transaction((tx) => workConversation(tx, data.issueId, user));
        if (!socket.rooms.has(`conv:${room.id}`) && !(room.kind === "ISSUE_WORK" && socket.rooms.has(`task:${room.issueId}`))) return callback?.("Join this task room before sending a message");
        const result = await saveConversationMessage(prisma, user, { ...data, conversationId: room.id });
        callback?.();
        void broadcastConversationMessage(io, result).catch((error) => log.error({ error, conversationId: room.id }, "Failed to broadcast message"));
      } catch (error) {
        log.error({ error }, "Failed to process message");
        const code = error && typeof error === "object" && "extensions" in error ? (error.extensions as { code?: string }).code : null;
        if (code === "FORBIDDEN") return callback?.(data.conversationId ? "You cannot send messages in this conversation" : "You cannot send messages in this task");
        callback?.(error instanceof Error && ["RATE_LIMITED", "NOT_FOUND"].includes(code ?? "") ? error.message : "Failed to send message");
      }
    });

    // -------------------------------------------------------------------
    // Disconnect
    // -------------------------------------------------------------------
    socket.on("disconnect", (reason) => {
      log.info({ socketId: socket.id, reason }, "Client disconnected");
    });

    socket.on("error", (error) => {
      log.error({ socketId: socket.id, error }, "Socket error");
    });
  });
}

/**
 * Get the global Socket.io instance
 * Use in GraphQL mutations to broadcast events
 */
export function getSocketIO(): Server<ClientToServerEvents, ServerToClientEvents> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const io = (global as any).__socketIO;
  if (!io) throw new Error("Socket.io not initialized");
  return io;
}

/** Close every active connection after a user's session is revoked or banned. */
export function disconnectUserSockets(userId: string): void {
  getSocketIO().in(`user:${userId}`).disconnectSockets(true);
}

export async function broadcastConversationMessage(io: Server<ClientToServerEvents, ServerToClientEvents>, result: Awaited<ReturnType<typeof saveConversationMessage>>) {
  const { room } = result;
  await evictUnauthorized(io, room, roomNames(room));
  io.to(`conv:${room.id}`).emit("message:new", toMessagePayload(result.message, result.message.sender));
  if (!result.duplicate) for (const member of result.room.participants.filter((p) => p.userId !== result.message.senderId)) {
    io.to(`user:${member.userId}`).emit("inbox:update", { conversationId: result.room.id, lastMessageAt: result.message.createdAt.toISOString(), unreadDelta: 1 });
  }
}

export async function broadcastMessageModified(io: Server<ClientToServerEvents, ServerToClientEvents>, message: BroadcastMessage): Promise<void> {
  if (!message.conversationId) return;
  const room = await prisma.conversation.findUnique({
    where: { id: message.conversationId },
    include: { issue: true, application: true, participants: true },
  });
  if (!room) return;
  await evictUnauthorized(io, room, roomNames(room));
  io.to(`conv:${room.id}`).emit("message:modified", toMessagePayload(message, message.sender));
}
