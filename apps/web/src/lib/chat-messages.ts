import { Prisma, type PrismaClient, type User } from "@bloody-roar/database";
import { z } from "zod";
import { accessibleConversation } from "./conversations";
import { gqlError, parseOrThrow } from "../graphql/errors";
import { guardMessage } from "../ai/guard/service";
import { scanAndMask } from "../ai/guard/scanner";
import { auditHash } from "../ai/hash";
import { rateLimit } from "./rate-limit";
import { chatQuotaAllows } from "./chat-quota";

export const MessageInputSchema = z.object({
  conversationId: z.string().min(1), issueId: z.string().min(1), content: z.string().trim().min(1).max(4000),
  type: z.enum(["TEXT", "FILE"]).default("TEXT"), clientMessageId: z.string().min(1).max(200).optional(),
  replyToId: z.string().optional(), fileUrl: z.string().max(2000).optional(),
});
export function enforceMessageRate(userId: string) {
  if (!rateLimit(`chat:${userId}`, { limit: 10, windowMs: 10_000 }).ok) throw gqlError("Too many messages, slow down", "RATE_LIMITED");
}
export async function saveConversationMessage(db: PrismaClient, user: User, raw: unknown) {
  const input = parseOrThrow(MessageInputSchema, raw);
  await accessibleConversation(db, input.conversationId, user, true);
  const guard = await guardMessage(input.content, { issueId: input.issueId });
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const room = await accessibleConversation(tx, input.conversationId, user, true);
        if (room.issueId !== input.issueId) throw gqlError("Conversation does not belong to this task", "FORBIDDEN");
        const recipients = room.participants.filter((p) => p.userId !== user.id && p.role !== "ADMIN").sort((a,b) => a.userId.localeCompare(b.userId));
        // Wait for recipient notification locks before locking the room, so the other party can still send.
        for (const member of recipients) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${member.userId}), hashtext(${room.issueId}))::text`;
        await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${input.conversationId} FOR UPDATE`;
        const current = await tx.conversation.findUniqueOrThrow({ where: { id: room.id }, select: { lastMessageAt: true } });
        const createdAt = new Date(Math.max(Date.now(), (current.lastMessageAt?.getTime() ?? 0) + 1));
        const include = { attachments: true, sender: true };
        if (input.clientMessageId) {
          const duplicate = await tx.message.findFirst({ where: { conversationId: room.id, senderId: user.id, clientMessageId: input.clientMessageId }, include });
          if (duplicate) return { message: duplicate, room, duplicate: true };
        }
        if (input.replyToId && !await tx.message.findFirst({ where: { id: input.replyToId, conversationId: room.id, isDeleted: false } })) throw gqlError("The message you are replying to was not found", "NOT_FOUND");
        const attachment = input.type === "FILE" ? await tx.attachment.findFirst({ where: { fileUrl: input.fileUrl ?? "", issueId: room.issueId, uploaderId: user.id, status: "ATTACHED", messageId: null, OR: [{ conversationId: room.id, purpose: "CHAT" }, ...(room.kind === "ISSUE_WORK" ? [{ conversationId: null, purpose: "DELIVERY" as const }] : [])] } }) : null;
        if (input.type === "FILE" && !attachment) throw gqlError("Complete the upload for this conversation first", "INVALID_ATTACHMENT");
        if (attachment?.purpose === "DELIVERY" && !(await chatQuotaAllows(tx, user.id, attachment.fileSize))) throw gqlError("Daily chat upload limit reached", "RATE_LIMITED");
        const maskedName = scanAndMask(attachment?.fileName ?? "");
        const dispute = await tx.dispute.findUnique({ where: { issueId: room.issueId }, select: { raisedAt: true } });
        const message = await tx.message.create({ data: { issueId: room.issueId, conversationId: room.id, senderId: user.id, type: input.type, content: guard.content,
          clientMessageId: input.clientMessageId ?? null, replyToId: input.replyToId ?? null, createdAt,
          wasModified: guard.wasModified || maskedName.wasModified, originalHash: guard.wasModified ? auditHash(input.content) : null, afterDispute: Boolean(dispute?.raisedAt && dispute.raisedAt <= new Date()) } });
        if (attachment) await tx.attachment.update({ where: { id: attachment.id }, data: { messageId: message.id, conversationId: room.id, purpose: "CHAT", fileName: maskedName.content } });
        await tx.conversation.update({ where: { id: room.id }, data: { lastMessageAt: message.createdAt } });
        const link = room.kind === "ISSUE_WORK" ? `/issues/${room.issueId}` : `/messages?c=${room.id}`;
        for (const member of recipients) {
          await tx.notification.updateMany({ where: { userId: member.userId, type: "MESSAGE_RECEIVED", isRead: false, link }, data: { isRead: true } });
          await tx.notification.create({ data: { userId: member.userId, actorId: user.id, type: "MESSAGE_RECEIVED", title: `New message in “${room.issue.title}”`, body: attachment ? `${user.name || "A member"} sent a file.` : guard.content.slice(0, 180), link, data: { issueId: room.issueId, conversationId: room.id, messageId: message.id } } });
        }
        return { message: await tx.message.findUniqueOrThrow({ where: { id: message.id }, include }), room, duplicate: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2034" || (error.code === "P2010" && ["40001", "40P01"].includes(String(error.meta?.code))));
      if (!retryable || attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 * 2 ** attempt));
    }
  }
}
