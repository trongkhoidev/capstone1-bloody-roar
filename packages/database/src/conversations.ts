import type { Prisma } from "@prisma/client";

// Call while holding the issue row lock, so retries and developer selection share one room.
export async function ensureWorkConversation(tx: Prisma.TransactionClient, issue: { id: string; clientId: string; developerId: string | null }) {
  if (!issue.developerId) throw new Error("No developer assigned to this task");
  const conversation = await tx.conversation.findFirst({ where: { issueId: issue.id, kind: "ISSUE_WORK" } }) ??
    await tx.conversation.create({ data: { issueId: issue.id, kind: "ISSUE_WORK" } });
  await tx.conversationParticipant.deleteMany({ where: { conversationId: conversation.id, role: "DEVELOPER", userId: { not: issue.developerId } } });
  for (const [userId, role] of [[issue.clientId, "CLIENT"], [issue.developerId, "DEVELOPER"]] as const) {
    await tx.conversationParticipant.upsert({ where: { conversationId_userId: { conversationId: conversation.id, userId } }, create: { conversationId: conversation.id, userId, role }, update: { role } });
  }
  return conversation;
}

export async function postSystemMessage(tx: Prisma.TransactionClient, issue: { id: string; clientId: string; developerId: string | null }, senderId: string, content: string, clientMessageId: string) {
  const conversation = await ensureWorkConversation(tx, issue);
  const inserted = await tx.message.createMany({ data: { conversationId: conversation.id, issueId: issue.id, senderId, content, type: "SYSTEM", clientMessageId }, skipDuplicates: true });
  if (!inserted.count) return null;
  const message = await tx.message.findUniqueOrThrow({ where: { conversationId_clientMessageId: { conversationId: conversation.id, clientMessageId } },
    include: { attachments: true, sender: { select: { id: true, name: true, avatar: true } } } });
  await tx.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: message.createdAt } });
  return message;
}
