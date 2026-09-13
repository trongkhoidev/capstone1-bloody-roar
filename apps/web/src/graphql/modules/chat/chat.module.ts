import { builder } from "../../builder";
import { GraphQLError } from "graphql";
import { canReadIssueChat } from "../../../lib/chat-access";
import { parseOrThrow } from "../../errors";
import { z } from "zod";
import type { Prisma } from "@bloody-roar/database";
import { UserRef } from "../user/user.module";

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
    senderId: t.exposeString("senderId"),
    clientMessageId: t.exposeString("clientMessageId", { nullable: true }),
    replyToId: t.exposeString("replyToId", { nullable: true }),
    readAt: t.string({
      nullable: true,
      resolve: (msg) => msg.readAt?.toISOString() ?? null,
    }),
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
  const id = Buffer.from(cursor, "base64").toString("utf8");
  if (!id) throw new GraphQLError("Invalid cursor", { extensions: { code: "INVALID_CURSOR" } });
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

const MessageConnectionRef = builder.objectRef<MessageConnectionShape>("MessageConnection").implement({
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
      issueId: t.arg.string({ required: true }),
      first: t.arg.int({ required: false }),
      after: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new GraphQLError("Unauthorized", { extensions: { code: "UNAUTHORIZED" } });
      }

      const issue = await ctx.db.issue.findUnique({
        where: { id: args.issueId },
        select: { clientId: true, developerId: true, status: true },
      });
      if (!issue || !canReadIssueChat(issue, ctx.user)) {
        throw new GraphQLError("Forbidden", { extensions: { code: "FORBIDDEN" } });
      }

      const q = parseOrThrow(MessagesQuerySchema, { first: args.first, after: args.after });
      const take = q.first ?? 50;

      const rows = await ctx.db.message.findMany({
        where: { issueId: args.issueId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: take + 1,
        ...(q.after ? { cursor: { id: decodeCursor(q.after) }, skip: 1 } : {}),
        include: MESSAGE_INCLUDE,
      });

      const hasNextPage = rows.length > take;
      const messages = (hasNextPage ? rows.slice(0, take) : rows).reverse();

      const unreadIds = messages
        .filter((message) => message.senderId !== ctx.user?.id && !message.readAt)
        .map((message) => message.id);
      if (unreadIds.length) {
        const now = new Date();
        await ctx.db.message.updateMany({
          where: { id: { in: unreadIds }, issueId: args.issueId, readAt: null },
          data: { readAt: now },
        });
        const unread = new Set(unreadIds);
        messages.forEach((message) => {
          if (unread.has(message.id)) message.readAt = now;
        });
      }

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
