import type { PrismaClient } from "@prisma/client";

export async function canAccessIssue(
  db: PrismaClient,
  issueId: string,
  userId: string,
  isAdmin = false
): Promise<boolean> {
  const issue = await db.issue.findUnique({
    where: { id: issueId },
    select: { clientId: true, developerId: true },
  });
  if (!issue) return false;
  return isAdmin || issue.clientId === userId || issue.developerId === userId;
}
