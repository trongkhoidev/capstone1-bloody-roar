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
      // Allow unauthenticated connections in dev (Sprint 0)
      log.debug({ socketId: socket.id }, "Anonymous socket connection");
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
    socket.on("task:join", (issueId: string) => {
      const roomName = `task:${issueId}`;
      void socket.join(roomName);
      log.debug({ socketId: socket.id, roomName }, "Joined task room");
    });

    socket.on("task:leave", (issueId: string) => {
      const roomName = `task:${issueId}`;
      void socket.leave(roomName);
      log.debug({ socketId: socket.id, roomName }, "Left task room");
    });

    // -------------------------------------------------------------------
    // Message handler
    // Sprint 2: Add AI Guard scanning before broadcast
    // -------------------------------------------------------------------
    socket.on("message:send", async (data, callback) => {
      try {
        log.debug({ issueId: data.issueId, type: data.type }, "Incoming message");

        // TODO Sprint 1: Save message to DB via Prisma
        // const message = await prisma.message.create({ data: { ... } });

        // TODO Sprint 2: Run AI Guard scan before broadcasting
        // const guardResult = await aiGuard.scan(data.content);
        // if (guardResult.wasModified) { ... }

        // Broadcast to all users in the task room
        const roomName = `task:${data.issueId}`;
        io.to(roomName).emit("message:new", {
          id: crypto.randomUUID(),
          content: data.content,
          type: data.type,
          senderId: socket.data.user?.id || "anonymous",
          senderName: socket.data.user?.name || "Anonymous",
          issueId: data.issueId,
          wasModified: false,
          ...(data.fileUrl ? { fileUrl: data.fileUrl } : {}),
          ...(data.fileName ? { fileName: data.fileName } : {}),
          createdAt: new Date().toISOString(),
        });

        callback(); // No error
      } catch (error) {
        log.error({ error }, "Failed to process message");
        callback("Failed to send message");
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
