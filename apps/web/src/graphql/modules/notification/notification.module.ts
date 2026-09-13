import { builder } from "../../builder";
import { requireAuth } from "../../context";
import { gqlError } from "../../errors";

export const NotificationRef = builder.prismaObject("Notification", {
  fields: (t) => ({
    id: t.exposeID("id"),
    type: t.string({ resolve: (notification) => notification.type }),
    title: t.exposeString("title"),
    body: t.exposeString("body"),
    isRead: t.exposeBoolean("isRead"),
    actorId: t.exposeString("actorId", { nullable: true }),
    link: t.exposeString("link", { nullable: true }),
    createdAt: t.string({ resolve: (notification) => notification.createdAt.toISOString() }),
  }),
});

builder.queryFields((t) => ({
  notifications: t.prismaField({
    type: [NotificationRef],
    args: { first: t.arg.int({ required: false }) },
    resolve: (query, _root, args, ctx) => {
      const user = requireAuth(ctx);
      const first = Math.min(Math.max(args.first ?? 30, 1), 100);
      return ctx.db.notification.findMany({
        ...query,
        where: { userId: user.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: first,
      });
    },
  }),
  unreadNotificationCount: t.int({
    resolve: (_root, _args, ctx) => {
      const user = requireAuth(ctx);
      return ctx.db.notification.count({ where: { userId: user.id, isRead: false } });
    },
  }),
}));

builder.mutationFields((t) => ({
  markNotificationRead: t.prismaField({
    type: NotificationRef,
    args: { id: t.arg.id({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      const user = requireAuth(ctx);
      const notification = await ctx.db.notification.findFirst({
        where: { id: String(args.id), userId: user.id },
        select: { id: true },
      });
      if (!notification) throw gqlError("Thông báo không tồn tại", "NOT_FOUND");
      return ctx.db.notification.update({
        ...query,
        where: { id: notification.id },
        data: { isRead: true },
      });
    },
  }),
  markAllNotificationsRead: t.int({
    resolve: async (_root, _args, ctx) => {
      const user = requireAuth(ctx);
      const result = await ctx.db.notification.updateMany({
        where: { userId: user.id, isRead: false },
        data: { isRead: true },
      });
      return result.count;
    },
  }),
}));
