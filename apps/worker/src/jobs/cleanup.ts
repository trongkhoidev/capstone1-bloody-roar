import { DAY_MS } from "@bloody-roar/shared/constants";
import { unlink } from "node:fs/promises";
import path from "node:path";
import type { Job, JobContext } from "../runtime/scheduler";


// Housekeeping (P1-35): drop expired or long-revoked sessions, abandoned uploads, and old webhook deliveries.
async function runCleanup({ db, now }: JobContext): Promise<void> {
  const at = now();
  const sessionCutoff = new Date(at.getTime() - 7 * DAY_MS);
  await db.session.deleteMany({
    where: { OR: [{ expiresAt: { lt: sessionCutoff } }, { revokedAt: { lt: sessionCutoff } }] },
  });

  const abandoned = await db.attachment.findMany({
    where: { status: "PENDING", createdAt: { lt: new Date(at.getTime() - DAY_MS) } },
    select: { id: true, fileUrl: true },
  });
  const uploadsDir = process.env.UPLOADS_DIR;
  for (const attachment of abandoned) {
    const key = new URL(attachment.fileUrl, "http://localhost").searchParams.get("key");
    // Local uploads live under UPLOADS_DIR; a missing file is fine, the row is what matters.
    if (uploadsDir && key && !key.includes("..")) await unlink(path.join(uploadsDir, key)).catch(() => undefined);
  }
  if (abandoned.length) await db.attachment.deleteMany({ where: { id: { in: abandoned.map((a) => a.id) } } });

  await db.githubWebhookDelivery.deleteMany({ where: { receivedAt: { lt: new Date(at.getTime() - 30 * DAY_MS) } } });
}

export const cleanupJob: Job = { name: "cleanup", everyMs: 3_600_000, run: runCleanup };
