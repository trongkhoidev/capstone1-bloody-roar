import type { NotificationType, PrismaClient } from "@bloody-roar/database";
import { getSocketIO } from "../../socket/handlers";
import { createLogger } from "../logger";

const log = createLogger("notifications");

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  actorId?: string;
  link?: string;
  data?: Record<string, string>;
}

export async function createNotification(
  db: PrismaClient,
  input: CreateNotificationInput
) {
  const notification = await db.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      ...(input.actorId ? { actorId: input.actorId } : {}),
      ...(input.link ? { link: input.link } : {}),
      ...(input.data ? { data: input.data } : {}),
    },
  });

  try {
    getSocketIO().to(`user:${input.userId}`).emit("notification:new", {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      ...(notification.link ? { data: { link: notification.link } } : {}),
      createdAt: notification.createdAt.toISOString(),
    });
  } catch {
    // Persisting the notification is the source of truth; socket delivery is best effort.
  }

  return notification;
}

/** Keeps an already-committed workflow mutation successful when notification storage is down. */
export async function createNotificationSafely(db: PrismaClient, input: CreateNotificationInput) {
  try {
    await createNotification(db, input);
  } catch (error) {
    log.warn({ error, userId: input.userId, type: input.type }, "Could not persist notification");
  }
}
