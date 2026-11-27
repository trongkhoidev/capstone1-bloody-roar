import { builder } from "../../builder";
import { GraphQLError } from "graphql";
import { auditHash } from "../../../ai/hash";
import { accessibleConversation, workConversation } from "../../../lib/conversations";
import { gqlError, parseOrThrow } from "../../errors";
import { rateLimit } from "../../../lib/rate-limit";
import { z } from "zod";
import type { Prisma } from "@bloody-roar/database";
import { UserRef } from "../user/user.module";
import type { GraphQLContext } from "../../context";
import { guardMessage } from "../../../ai/guard/service";
import { getSocketIO, toMessagePayload } from "../../../socket/handlers";

// D-4 GraphQL Setup

export const MessageTypeEnum = builder.enumType("MessageTypeEnum", {
  values: ["TEXT", "FILE", "SYSTEM"] as const,
});

export const AttachmentRef = builder.prismaObject("Attachment", {
  fields: (t) => ({
    id: t.exposeID("id"),
    fileName: t.exposeString("fileName"),
    fileUrl: t.exposeString("fileUrl"),
    fileSize: t.exposeInt("fileSize"),
    fileMime: t.exposeString("fileMime"),
    createdAt: t.string({
      resolve: (attachment) => attachment.createdAt.toISOString(),
    }),
  }),
});

const MESSAGE_INCLUDE = {
  sender: true,
  attachments: true,
} satisfies Prisma.MessageInclude;

type MessageNode = Prisma.MessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;

export const MessageRef = builder.prismaObject("Message", {
  include: MESSAGE_INCLUDE,
  fields: (t) => ({
    id: t.exposeID("id"),
    content: t.exposeString("content"),
    type: t.expose("type", { type: MessageTypeEnum }),
    wasModified: t.exposeBoolean("wasModified"),
    issueId: t.exposeString("issueId"),
    conversationId: t.exposeString("conversationId"),
    senderId: t.exposeString("senderId"),
    clientMessageId: t.exposeString("clientMessageId", { nullable: true }),
    replyToId: t.exposeString("replyToId", { nullable: true }),
    editedAt: t.string({
      nullable: true,
      resolve: (msg) => msg.editedAt?.toISOString() ?? null,
    }),
    isDeleted: t.exposeBoolean("isDeleted"),
    createdAt: t.string({
      resolve: (msg) => msg.createdAt.toISOString(),
    }),

    sender: t.field({
      type: UserRef,
      resolve: (msg) => msg.sender,
    }),
    attachments: t.field({
      type: [AttachmentRef],
      resolve: (msg) => msg.attachments,
    }),
  }),
});

// Cursor helpers
function encodeCursor(id: string): string {
  return Buffer.from(id, "utf8").toString("base64");
}

function decodeCursor(cursor: string): string {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cursor)) {
    throw new GraphQLError("Invalid cursor", { extensions: { code: "INVALID_CURSOR" } });
  }
  const id = Buffer.from(cursor, "base64").toString("utf8");
  if (
    !id ||
    Buffer.from(id, "utf8").toString("base64").replace(/=+$/, "") !== cursor.replace(/=+$/, "")
  ) {
    throw new GraphQLError("Invalid cursor", { extensions: { code: "INVALID_CURSOR" } });
  }
  return id;
}

type MessageEdgeShape = { node: MessageNode; cursor: string };
type PageInfoShape = {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
};
type MessageConnectionShape = {
  edges: MessageEdgeShape[];
  pageInfo: PageInfoShape;
};

const MessageEdgeRef = builder.objectRef<MessageEdgeShape>("MessageEdge").implement({
  fields: (t) => ({
    node: t.field({ type: MessageRef, resolve: (edge) => edge.node }),
    cursor: t.exposeString("cursor"),
  }),
});

const PageInfoRef = builder.objectRef<PageInfoShape>("MessagePageInfo").implement({
  fields: (t) => ({
    hasNextPage: t.exposeBoolean("hasNextPage"),
    hasPreviousPage: t.exposeBoolean("hasPreviousPage"),
    startCursor: t.exposeString("startCursor", { nullable: true }),
    endCursor: t.exposeString("endCursor", { nullable: true }),
  }),
});

const MessageConnectionRef = builder
  .objectRef<MessageConnectionShape>("MessageConnection")
  .implement({
    fields: (t) => ({
      edges: t.field({
        type: [MessageEdgeRef],
        resolve: (conn) => conn.edges,
      }),
      pageInfo: t.field({ type: PageInfoRef, resolve: (conn) => conn.pageInfo }),
    }),
  });

const MessagesQuerySchema = z.object({
  first: z.number().int().min(1).max(100).nullish(),
  after: z.string().max(256).nullish(),
});

builder.queryFields((t) => ({
  messages: t.field({
    type: MessageConnectionRef,
    args: {
      issueId: t.arg.string(),
      conversationId: t.arg.id(),
      first: t.arg.int({ required: false }),
      after: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new GraphQLError("Unauthorized", { extensions: { code: "UNAUTHORIZED" } });
      }

      const conversation = args.conversationId
        ? await accessibleConversation(ctx.db, String(args.conversationId), ctx.user)
        : args.issueId ? await ctx.db.$transaction((tx) => workConversation(tx, args.issueId!, ctx.user!)) : null;
      if (!conversation) throw gqlError("conversationId is required", "BAD_USER_INPUT");
      const conversationId = conversation.id;

      const q = parseOrThrow(MessagesQuerySchema, { first: args.first, after: args.after });
      const take = q.first ?? 50;
      const cursorId = q.after ? decodeCursor(q.after) : null;
      if (cursorId) {
        const cursorMessage = await ctx.db.message.findFirst({
          where: { id: cursorId, conversationId, isDeleted: false },
          select: { id: true },
        });
        if (!cursorMessage)
          throw new GraphQLError("Cursor does not belong to this task room", {
            extensions: { code: "INVALID_CURSOR" },
          });
      }

      const rows = await ctx.db.message.findMany({
        where: { conversationId, isDeleted: false },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: take + 1,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        include: MESSAGE_INCLUDE,
      });

      const hasNextPage = rows.length > take;
      const messages = (hasNextPage ? rows.slice(0, take) : rows).reverse();

      const firstItem = messages[0];
      const lastItem = messages[messages.length - 1];

      return {
        edges: messages.map((msg) => ({
          node: msg,
          cursor: encodeCursor(msg.id),
        })),
        pageInfo: {
          hasNextPage,
          hasPreviousPage: Boolean(q.after),
          startCursor: firstItem ? encodeCursor(firstItem.id) : null,
          endCursor: lastItem ? encodeCursor(lastItem.id) : null,
        },
      };
    },
  }),
}));

const EditMessageSchema = z.object({ content: z.string().trim().min(1).max(4000) });

// Edits and deletes belong to the sender while the task is open. Once a dispute opens, messages are evidence and stay fixed.
async function findOwnWritableMessage(ctx: GraphQLContext, id: string, db: Prisma.TransactionClient = ctx.db) {
  const user = ctx.user;
  if (!user) throw new GraphQLError("Unauthorized", { extensions: { code: "UNAUTHORIZED" } });
  const message = await db.message.findUnique({
    where: { id },
    include: { ...MESSAGE_INCLUDE, issue: { select: { clientId: true, developerId: true, status: true } } },
  });
  if (!message || message.isDeleted) throw new GraphQLError("Message not found", { extensions: { code: "NOT_FOUND" } });
  if (message.senderId !== user.id || message.type === "SYSTEM") throw new GraphQLError("Only the sender can change this message", { extensions: { code: "FORBIDDEN" } });
  if (!message.conversationId) throw gqlError("Message has not been migrated", "NOT_FOUND");
  await accessibleConversation(db, message.conversationId, user, true);
  if (!message.issue) throw new GraphQLError("Chat is closed for this task", { extensions: { code: "FORBIDDEN" } });
  if (message.issue.status === "DISPUTED") throw new GraphQLError("Messages are locked during a dispute", { extensions: { code: "CHAT_LOCKED" } });
  return message;
}

async function updateOwnWritableMessage(ctx: GraphQLContext, id: string, data: Prisma.MessageUpdateInput) {
  return ctx.db.$transaction(async (tx) => {
    // A dispute or application closure must not overtake the AI guard's permission check.
    await tx.$queryRaw`SELECT i.id FROM issues i JOIN messages m ON m."issueId" = i.id WHERE m.id = ${id} FOR UPDATE OF i`;
    await tx.$queryRaw`SELECT a.id FROM applications a JOIN conversations c ON c."applicationId" = a.id JOIN messages m ON m."conversationId" = c.id WHERE m.id = ${id} FOR SHARE OF a`;
    await findOwnWritableMessage(ctx, id, tx);
    return tx.message.update({ where: { id }, data, include: MESSAGE_INCLUDE });
  });
}

// Live clients refresh the message; a deleted one arrives with empty content.
function broadcastModified(message: MessageNode) {
  try {
    getSocketIO().to(`conv:${message.conversationId}`).emit("message:modified", toMessagePayload(message, message.sender));
  } catch {
    /* Socket server may not be available in isolated tests. */
  }
}

builder.mutationFields((t) => ({
  editMessage: t.field({
    type: MessageRef,
    args: {
      id: t.arg.id({ required: true }),
      content: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const message = await findOwnWritableMessage(ctx, String(args.id));
      const limit = rateLimit(`chat:${message.senderId}`, { limit: 10, windowMs: 10_000 });
      if (!limit.ok) throw gqlError("Sending too fast, try again later", "RATE_LIMITED");
      const { content } = parseOrThrow(EditMessageSchema, { content: args.content });
      const guard = await guardMessage(content, { issueId: message.issueId });
      const updated = await updateOwnWritableMessage(ctx, message.id, {
          content: guard.content,
          wasModified: guard.wasModified,
          originalHash: guard.wasModified ? auditHash(content) : null,
          editedAt: new Date(),
      });
      broadcastModified(updated);
      return updated;
    },
  }),
  deleteMessage: t.boolean({
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const message = await findOwnWritableMessage(ctx, String(args.id));
      const updated = await updateOwnWritableMessage(ctx, message.id, { isDeleted: true, deletedAt: new Date(), content: "", wasModified: false, originalHash: null });
      broadcastModified(updated);
      return true;
    },
  }),
}));

builder.queryField("unreadMessageCount", (t) =>
  t.int({
    args: { issueId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const user = ctx.user;
      if (!user) throw new GraphQLError("Unauthorized", { extensions: { code: "UNAUTHORIZED" } });
      const room = await ctx.db.$transaction((tx) => workConversation(tx, args.issueId, user));
      const member = room.participants.find((p) => p.userId === user.id);
      if (!member) return 0;
      return ctx.db.message.count({ where: { conversationId: room.id, isDeleted: false, senderId: { not: user.id }, ...(member.lastReadAt ? { createdAt: { gt: member.lastReadAt } } : {}) } });
    },
  }),
);
