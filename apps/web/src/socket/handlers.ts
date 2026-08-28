// apps/web/src/socket/handlers.ts
// =============================================================================
// Socket.io event handlers — Sprint 0 scaffold
// Sprint 1: Add auth middleware + room management
// Sprint 2: Add AI Guard integration
// =============================================================================

import type { Server } from "socket.io";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from "@bloody-roar/shared";
import { createLogger } from "../lib/logger";
import { verifyJWT } from "../lib/auth";
import { prisma } from "@bloody-roar/database";
import { canAccessIssue } from "../lib/access";
import { z } from "zod";

const log = createLogger("socket.io");

/**
 * Register all Socket.io event handlers
 * Called once when the server starts
 */
export function registerSocketHandlers(
  io: Server<ClientToServerEvents, ServerToClientEvents>
): void {
  log.info("Socket.io handlers registered");

  // -----------------------------------------------------------------------
  // Global middleware — runs before any event handler
  // -----------------------------------------------------------------------
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;

    if (token) {
      const user = await verifyJWT(token);
      if (!user) return next(new Error("Unauthorized"));
      socket.data.user = user;
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

    // -------------------------------------------------------------------
    // Room Management — join/leave task chat rooms
    // -------------------------------------------------------------------
    socket.on("task:join", async (issueId: string, callback) => {
      const user = socket.data.user;
      if (!user) return callback?.("Unauthorized");
      
      const hasAccess = await canAccessIssue(prisma, issueId, user.id);
      if (!hasAccess) return callback?.("Forbidden");

      const roomName = `task:${issueId}`;
      void socket.join(roomName);
      log.debug({ socketId: socket.id, roomName }, "Joined task room");
      callback?.();
    });

    socket.on("task:leave", (issueId: string, callback) => {
      const roomName = `task:${issueId}`;
      void socket.leave(roomName);
      log.debug({ socketId: socket.id, roomName }, "Left task room");
      callback?.();
    });

    // -------------------------------------------------------------------
    // Message handler
    // Sprint 2: Add AI Guard scanning before broadcast
    // -------------------------------------------------------------------
    socket.on("message:send", async (data, callback) => {
      try {
        log.debug({ issueId: data.issueId, type: data.type }, "Incoming message");

        const user = socket.data.user;
        if (!user) return callback?.("Unauthorized");

        const parsed = z.object({
          content: z.string().min(1).max(4000),
          type: z.enum(["TEXT", "FILE"]),
          issueId: z.string().min(1),
          clientMessageId: z.string().optional(),
          replyToId: z.string().optional(),
          fileUrl: z.string().optional(),
          fileName: z.string().optional(),
          fileSize: z.number().optional(),
          fileMime: z.string().optional(),
        }).safeParse(data);

        if (!parsed.success) {
          return callback?.("Invalid message format");
        }

        const {
          content,
          type,
          issueId,
          clientMessageId,
          replyToId,
          fileUrl,
          fileName,
          fileSize,
          fileMime
        } = parsed.data;

        const hasAccess = await canAccessIssue(prisma, issueId, user.id);
        if (!hasAccess) return callback?.("Forbidden");

        // Idempotency check
        // Note: clientMessageId only has an @@index, not @unique, so there is a minor race condition 
        // if two concurrent requests share the same id, but it is acceptable here.
        if (clientMessageId) {
          const existing = await prisma.message.findFirst({
            where: { clientMessageId, senderId: user.id },
            include: { attachments: true }
          });
          if (existing) {
            const roomName = `task:${issueId}`;
            io.to(roomName).emit("message:new", {
              id: existing.id,
              content: existing.content,
              type: existing.type as "TEXT" | "FILE",
              senderId: user.id,
              senderName: user.name || "Anonymous",
              senderAvatar: user.avatar || undefined,
              issueId: existing.issueId,
              wasModified: existing.wasModified,
              ...(existing.attachments?.[0]?.fileUrl ? { fileUrl: existing.attachments[0].fileUrl } : {}),
              ...(existing.attachments?.[0]?.fileName ? { fileName: existing.attachments[0].fileName } : {}),
              ...(existing.replyToId ? { replyToId: existing.replyToId } : {}),
              createdAt: existing.createdAt.toISOString(),
            });
            callback?.(); // Already processed
            return;
          }
        }

        const message = await prisma.message.create({
          data: {
            content,
            type,
            issueId,
            senderId: user.id,
            clientMessageId: clientMessageId || null,
            replyToId: replyToId || null,
          }
        });

        if (type === "FILE" && fileUrl && fileName && fileSize && fileMime) {
          await prisma.attachment.create({
            data: {
              messageId: message.id,
              uploaderId: user.id,
              fileName,
              fileUrl,
              fileSize,
              fileMime,
            }
          });
        }

        const roomName = `task:${issueId}`;
        io.to(roomName).emit("message:new", {
          id: message.id,
          content: message.content,
          type: message.type as "TEXT" | "FILE",
          senderId: user.id,
          senderName: user.name || "Anonymous",
          senderAvatar: user.avatar || undefined,
          issueId: message.issueId,
          wasModified: message.wasModified,
          ...(fileUrl ? { fileUrl } : {}),
          ...(fileName ? { fileName } : {}),
          ...(message.replyToId ? { replyToId: message.replyToId } : {}),
          createdAt: message.createdAt.toISOString(),
        });

        callback?.();
      } catch (error) {
        log.error({ error }, "Failed to process message");
        callback?.("Failed to send message");
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
