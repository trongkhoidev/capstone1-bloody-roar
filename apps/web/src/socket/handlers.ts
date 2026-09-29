// apps/web/src/socket/handlers.ts
// =============================================================================
// Socket.io event handlers — Sprint 0 scaffold
// Sprint 1: Add auth middleware + room management
// Sprint 2: Add AI Guard integration
// =============================================================================

import type { Server } from "socket.io";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { stat } from "node:fs/promises";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  ChatMessagePayload,
} from "@bloody-roar/shared";
import { createLogger } from "../lib/logger";
import { tokenFromCookieHeader, verifyJWT } from "../lib/auth";
import { prisma } from "@bloody-roar/database";
import { canReadIssueChat, canWriteIssueChat } from "../lib/chat-access";
import { z } from "zod";
import { createHash } from "node:crypto";
import { AILogStatus, NotificationType, Prisma } from "@bloody-roar/database";
import { guardMessage } from "../ai/guard/service";
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE_BYTES } from "@bloody-roar/shared";
import { getS3Storage, localUploadPath } from "../lib/storage";

const log = createLogger("socket.io");
type StoredMessage = Prisma.MessageGetPayload<{
  include: { attachments: true };
}>;

function toMessagePayload(
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
    socket.on("task:join", async (issueId: string, callback) => {
      try {
        const user = socket.data.user;
        if (!user) return callback?.("Unauthorized");

        const issue = await prisma.issue.findUnique({
          where: { id: issueId },
          select: { clientId: true, developerId: true, status: true },
        });
        if (!issue || !canReadIssueChat(issue, user))
          return callback?.("You cannot access this task room");

        const roomName = `task:${issueId}`;
        await socket.join(roomName);
        log.debug({ socketId: socket.id, roomName }, "Joined task room");
        callback?.();
      } catch (error) {
        log.error({ error, socketId: socket.id, issueId }, "Failed to join task room");
        callback?.("Could not join task room");
      }
    });

    socket.on("task:leave", async (issueId: string, callback) => {
      try {
        const roomName = `task:${issueId}`;
        await socket.leave(roomName);
        log.debug({ socketId: socket.id, roomName }, "Left task room");
        callback?.();
      } catch (error) {
        log.error({ error, socketId: socket.id, issueId }, "Failed to leave task room");
        callback?.("Could not leave task room");
      }
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

        const parsed = z
          .object({
            content: z.string().min(1).max(4000),
            type: z.enum(["TEXT", "FILE"]),
            issueId: z.string().min(1),
            clientMessageId: z.string().optional(),
            replyToId: z.string().optional(),
            fileUrl: z.string().optional(),
            fileName: z.string().optional(),
            fileSize: z.number().optional(),
            fileMime: z.string().optional(),
          })
          .safeParse(data);

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
          fileMime,
        } = parsed.data;

        if (user.role === "ADMIN")
          return callback?.("Administrators have read-only access to task evidence");
        const issue = await prisma.issue.findUnique({
          where: { id: issueId },
          select: {
            clientId: true,
            developerId: true,
            title: true,
            status: true,
          },
        });
        if (!issue) return callback?.("Task not found");
        const roomName = `task:${issueId}`;
        if (!canWriteIssueChat(issue, user))
          return callback?.("You cannot send messages in this task");
        if (!socket.rooms.has(roomName))
          return callback?.("Join this task room before sending a message");

        if (replyToId) {
          const replyTarget = await prisma.message.findFirst({
            where: { id: replyToId, issueId, isDeleted: false },
            select: { id: true },
          });
          if (!replyTarget) return callback?.("The message you are replying to was not found");
        }

        if (type === "FILE") {
          let uploadedByUser = false;
          let objectKey: string | null = null;
          try {
            const file = new URL(fileUrl || "");
            const appOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:4000")
              .origin;
            const key = file.searchParams.get("key");
            uploadedByUser =
              file.origin === appOrigin &&
              file.pathname === "/api/uploads" &&
              file.searchParams.getAll("key").length === 1 &&
              Boolean(
                key &&
                key.startsWith(`${user.id}/`) &&
                !key.includes("..") &&
                key.split("/").length === 2,
              );
            if (uploadedByUser) objectKey = key;
          } catch {
            uploadedByUser = false;
          }
          if (
            !fileUrl ||
            !fileName ||
            !fileSize ||
            !fileMime ||
            !uploadedByUser ||
            fileName.length > 160 ||
            !Number.isInteger(fileSize) ||
            fileSize > MAX_FILE_SIZE_BYTES ||
            !ALLOWED_FILE_TYPES.includes(fileMime as never)
          ) {
            return callback?.("Upload a supported file before sending it");
          }
          const s3 = getS3Storage();
          if (s3 && objectKey) {
            try {
              const object = await s3.client.send(
                new HeadObjectCommand({ Bucket: s3.bucket, Key: objectKey }),
              );
              uploadedByUser =
                object.ContentLength === fileSize &&
                object.ContentType === fileMime &&
                object.Metadata?.uploader === user.id;
            } catch {
              uploadedByUser = false;
            }
          } else if (process.env.NODE_ENV !== "production" && objectKey) {
            const localPath = localUploadPath(objectKey);
            try {
              uploadedByUser = Boolean(
                localPath && (await stat(localPath.destination)).size === fileSize,
              );
            } catch {
              uploadedByUser = false;
            }
          }
          if (!uploadedByUser) return callback?.("The uploaded file could not be verified");
        }

        // Fast path for a retry whose original message has already committed.
        if (clientMessageId) {
          const existing = await prisma.message.findFirst({
            where: { clientMessageId, senderId: user.id, issueId },
            include: { attachments: true },
          });
          if (existing) {
            io.to(roomName).emit("message:new", toMessagePayload(existing, user));
            callback?.(); // Already processed
            return;
          }
        }

        const guard =
          type === "TEXT"
            ? await guardMessage(content, { issueId })
            : { content, wasModified: false, matches: [] as string[] };
        const originalHash = guard.wasModified
          ? createHash("sha256").update(content).digest("hex")
          : undefined;
        const startedAt = Date.now();
        let message: StoredMessage;
        let alreadyPersisted = false;
        try {
          message = await prisma.$transaction(
            async (tx) => {
              const currentIssue = await tx.issue.findUnique({
                where: { id: issueId },
                select: { clientId: true, developerId: true, status: true },
              });
              if (!currentIssue || !canWriteIssueChat(currentIssue, user)) {
                throw new Error("Task state changed before the message was saved");
              }
              if (replyToId) {
                const replyTarget = await tx.message.findFirst({
                  where: { id: replyToId, issueId, isDeleted: false },
                  select: { id: true },
                });
                if (!replyTarget) throw new Error("The message you are replying to was not found");
              }
              if (clientMessageId) {
                const duplicate = await tx.message.findFirst({
                  where: { clientMessageId, senderId: user.id, issueId },
                  include: { attachments: true },
                });
                if (duplicate) {
                  alreadyPersisted = true;
                  return duplicate;
                }
              }
              const created = await tx.message.create({
                data: {
                  content: guard.content,
                  type,
                  issueId,
                  senderId: user.id,
                  clientMessageId: clientMessageId || null,
                  replyToId: replyToId || null,
                  wasModified: guard.wasModified,
                  ...(originalHash ? { originalHash } : {}),
                },
              });

              if (type === "FILE" && fileUrl && fileName && fileSize != null && fileMime) {
                await tx.attachment.create({
                  data: {
                    messageId: created.id,
                    uploaderId: user.id,
                    fileName,
                    fileUrl,
                    fileSize,
                    fileMime,
                  },
                });
              }

              return tx.message.findUniqueOrThrow({
                where: { id: created.id },
                include: { attachments: true },
              });
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          );
        } catch (error) {
          const isSerializationConflict =
            error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
          if (!isSerializationConflict || !clientMessageId) throw error;
          const duplicate = await prisma.message.findFirst({
            where: { clientMessageId, senderId: user.id, issueId },
            include: { attachments: true },
          });
          if (!duplicate) throw error;
          message = duplicate;
          alreadyPersisted = true;
        }

        if (alreadyPersisted) {
          io.to(roomName).emit("message:new", toMessagePayload(message, user));
          callback?.();
          return;
        }

        if (guard.wasModified) {
          const outputHash = createHash("sha256").update(guard.content).digest("hex");
          void prisma.aILog
            .create({
              data: {
                task: "GUARD",
                model: "regex-ruleset-v1",
                provider: "local",
                issueId,
                latencyMs: Date.now() - startedAt,
                ...(originalHash ? { inputHash: originalHash } : {}),
                outputHash,
                status: AILogStatus.SUCCESS,
              },
            })
            .catch((error) =>
              log.warn({ error, issueId }, "Failed to persist AI Guard audit record"),
            );
        }

        io.to(roomName).emit("message:new", toMessagePayload(message, user));

        const recipientId = issue.clientId === user.id ? issue.developerId : issue.clientId;
        if (recipientId) {
          try {
            const notification = await prisma.notification.create({
              data: {
                userId: recipientId,
                actorId: user.id,
                type: NotificationType.MESSAGE_RECEIVED,
                title: `Tin nhắn mới trong “${issue.title}”`,
                body:
                  type === "FILE"
                    ? `${user.name || "Thành viên"} đã gửi một tệp.`
                    : guard.content.slice(0, 180),
                link: `/issues/${issueId}`,
                data: { issueId, messageId: message.id },
              },
            });
            io.to(`user:${recipientId}`).emit("notification:new", {
              id: notification.id,
              type: notification.type,
              title: notification.title,
              body: notification.body,
              data: { link: notification.link, issueId },
              createdAt: notification.createdAt.toISOString(),
            });
          } catch (notificationError) {
            log.warn(
              { error: notificationError, issueId },
              "Failed to create message notification",
            );
          }
        }

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

/** Close every active connection after a user's session is revoked or banned. */
export function disconnectUserSockets(userId: string): void {
  getSocketIO().in(`user:${userId}`).disconnectSockets(true);
}
