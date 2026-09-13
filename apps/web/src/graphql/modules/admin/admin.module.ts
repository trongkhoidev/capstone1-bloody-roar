import { UserRole, type User } from "@bloody-roar/database";
import { z } from "zod";
import { builder } from "../../builder";
import { requireAdmin } from "../../context";
import { gqlError, parseOrThrow } from "../../errors";

const AdminUserRef = builder.objectRef<User>("AdminUser").implement({
  fields: (t) => ({
    id: t.id({ resolve: (user) => user.id }),
    walletAddress: t.string({ resolve: (user) => user.walletAddress }),
    role: t.string({ resolve: (user) => user.role }),
    name: t.string({ nullable: true, resolve: (user) => user.name }),
    email: t.string({ nullable: true, resolve: (user) => user.email }),
    avatar: t.string({ nullable: true, resolve: (user) => user.avatar }),
    isGithubVerified: t.boolean({ resolve: (user) => user.isGithubVerified }),
    githubUsername: t.string({ nullable: true, resolve: (user) => user.githubUsername }),
    isBanned: t.boolean({ resolve: (user) => user.isBanned }),
    bannedReason: t.string({ nullable: true, resolve: (user) => user.bannedReason }),
    createdAt: t.string({ resolve: (user) => user.createdAt.toISOString() }),
  }),
});

builder.queryField("adminUsers", (t) =>
  t.field({
    type: [AdminUserRef],
    args: { search: t.arg.string({ required: false }), first: t.arg.int({ required: false }) },
    resolve: (_root, args, ctx) => {
      requireAdmin(ctx);
      const term = args.search?.trim();
      return ctx.db.user.findMany({
        where: term ? {
          OR: [
            { walletAddress: { contains: term, mode: "insensitive" } },
            { name: { contains: term, mode: "insensitive" } },
            { githubUsername: { contains: term, mode: "insensitive" } },
          ],
        } : {},
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: Math.min(Math.max(args.first ?? 50, 1), 100),
      });
    },
  })
);

builder.mutationField("banUser", (t) =>
  t.fieldWithInput({
    type: AdminUserRef,
    typeOptions: { name: "BanUserInput" },
    input: {
      userId: t.input.id({ required: true }),
      reason: t.input.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const admin = requireAdmin(ctx);
      const input = parseOrThrow(z.object({ reason: z.string().trim().min(5).max(500) }), { reason: args.input.reason });
      const target = await ctx.db.user.findUnique({ where: { id: String(args.input.userId) } });
      if (!target) throw gqlError("Người dùng không tồn tại", "NOT_FOUND");
      if (target.id === admin.id || target.role === UserRole.ADMIN) throw gqlError("Không thể khóa tài khoản quản trị viên", "FORBIDDEN");

      const user = await ctx.db.user.update({
        where: { id: target.id },
        data: { isBanned: true, bannedReason: input.reason, bannedAt: new Date() },
      });
      await ctx.db.adminLog.create({ data: { adminId: admin.id, action: "ban_user", target: "user", targetId: target.id, details: { reason: input.reason } } });
      return user;
    },
  })
);

builder.mutationField("unbanUser", (t) =>
  t.field({
    type: AdminUserRef,
    args: { userId: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const admin = requireAdmin(ctx);
      const target = await ctx.db.user.findUnique({ where: { id: String(args.userId) } });
      if (!target) throw gqlError("Người dùng không tồn tại", "NOT_FOUND");
      const user = await ctx.db.user.update({
        where: { id: target.id },
        data: { isBanned: false, bannedReason: null, bannedAt: null },
      });
      await ctx.db.adminLog.create({ data: { adminId: admin.id, action: "unban_user", target: "user", targetId: target.id } });
      return user;
    },
  })
);
