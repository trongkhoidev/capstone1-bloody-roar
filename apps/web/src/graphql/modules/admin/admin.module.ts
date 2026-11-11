import { ApplicationStatus, IssueStatus, UserRole, type AdminLog, type Issue, type User } from "@bloody-roar/database";
import { z } from "zod";
import { builder } from "../../builder";
import { requireAdmin } from "../../context";
import { gqlError, parseOrThrow } from "../../errors";
import { disconnectUserSockets } from "../../../socket/handlers";

const AdminUserRef = builder.objectRef<User>("AdminUser").implement({
  fields: (t) => ({
    id: t.id({ resolve: (user) => user.id }),
    walletAddress: t.string({ resolve: (user) => user.walletAddress }),
    role: t.string({ resolve: (user) => user.role }),
    name: t.string({ nullable: true, resolve: (user) => user.name }),
    email: t.string({ nullable: true, resolve: (user) => user.email }),
    avatar: t.string({ nullable: true, resolve: (user) => user.avatar }),
    isGithubVerified: t.boolean({ resolve: (user) => user.isGithubVerified }),
    githubUsername: t.string({
      nullable: true,
      resolve: (user) => user.githubUsername,
    }),
    isBanned: t.boolean({ resolve: (user) => user.isBanned }),
    bannedReason: t.string({
      nullable: true,
      resolve: (user) => user.bannedReason,
    }),
    createdAt: t.string({ resolve: (user) => user.createdAt.toISOString() }),
  }),
});

builder.queryField("adminUsers", (t) =>
  t.field({
    type: [AdminUserRef],
    args: {
      search: t.arg.string({ required: false }),
      first: t.arg.int({ required: false }),
      after: t.arg.id({ required: false }),
    },
    resolve: (_root, args, ctx) => {
      requireAdmin(ctx);
      const term = args.search?.trim();
      return ctx.db.user.findMany({
        where: term
          ? {
              OR: [
                { walletAddress: { contains: term, mode: "insensitive" } },
                { name: { contains: term, mode: "insensitive" } },
                { githubUsername: { contains: term, mode: "insensitive" } },
              ],
            }
          : {},
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: Math.min(Math.max(args.first ?? 50, 1), 100),
        ...(args.after ? { cursor: { id: String(args.after) }, skip: 1 } : {}),
      });
    },
  }),
);

const AdminLogRef = builder.objectRef<AdminLog>("AdminLog").implement({
  fields: (t) => ({
    id: t.id({ resolve: (log) => log.id }),
    action: t.string({ resolve: (log) => log.action }),
    target: t.string({ resolve: (log) => log.target }),
    targetId: t.string({ resolve: (log) => log.targetId }),
    adminId: t.string({ resolve: (log) => log.adminId }),
    details: t.string({
      nullable: true,
      resolve: (log) => (log.details ? JSON.stringify(log.details) : null),
    }),
    createdAt: t.string({ resolve: (log) => log.createdAt.toISOString() }),
  }),
});

const AdminIssueRef = builder.objectRef<Issue>("AdminIssue").implement({
  fields: (t) => ({
    id: t.id({ resolve: (issue) => issue.id }),
    title: t.string({ resolve: (issue) => issue.title }),
    status: t.string({ resolve: (issue) => issue.status }),
    clientId: t.string({ resolve: (issue) => issue.clientId }),
    developerId: t.string({ nullable: true, resolve: (issue) => issue.developerId }),
    createdAt: t.string({ resolve: (issue) => issue.createdAt.toISOString() }),
  }),
});

builder.queryField("adminLogs", (t) =>
  t.field({
    type: [AdminLogRef],
    args: {
      after: t.arg.id({ required: false }),
      first: t.arg.int({ required: false }),
    },
    resolve: (_root, args, ctx) => {
      requireAdmin(ctx);
      return ctx.db.adminLog.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: Math.min(Math.max(args.first ?? 50, 1), 100),
        ...(args.after ? { cursor: { id: String(args.after) }, skip: 1 } : {}),
      });
    },
  }),
);

builder.queryField("adminIssues", (t) =>
  t.field({
    type: [AdminIssueRef],
    args: {
      status: t.arg.string({ required: false }),
      search: t.arg.string({ required: false }),
      first: t.arg.int({ required: false }),
    },
    resolve: (_root, args, ctx) => {
      requireAdmin(ctx);
      const status = args.status
        ? parseOrThrow(z.nativeEnum(IssueStatus), args.status)
        : undefined;
      const term = args.search?.trim();
      return ctx.db.issue.findMany({
        where: {
          ...(status ? { status } : {}),
          ...(term ? { title: { contains: term, mode: "insensitive" } } : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: Math.min(Math.max(args.first ?? 50, 1), 100),
      });
    },
  }),
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
      const input = parseOrThrow(z.object({ reason: z.string().trim().min(5).max(500) }), {
        reason: args.input.reason,
      });
      const user = await ctx.db.$transaction(async (tx) => {
        const target = await tx.user.findUnique({
          where: { id: String(args.input.userId) },
        });
        if (!target) throw gqlError("Người dùng không tồn tại", "NOT_FOUND");
        if (target.id === admin.id || target.role === UserRole.ADMIN)
          throw gqlError("Không thể khóa tài khoản quản trị viên", "FORBIDDEN");
        const user = await tx.user.update({
          where: { id: target.id },
          data: {
            isBanned: true,
            bannedReason: input.reason,
            bannedAt: new Date(),
          },
        });
        await tx.session.updateMany({
          where: { userId: target.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        // Cancel the banned client's open tasks, then reject pending applications on them and the user's own.
        const openIssues = await tx.issue.findMany({
          where: { clientId: target.id, status: IssueStatus.OPEN },
          select: { id: true },
        });
        const openIssueIds = openIssues.map((issue) => issue.id);
        await tx.issue.updateMany({
          where: { id: { in: openIssueIds } },
          data: { status: IssueStatus.CANCELLED },
        });
        await tx.application.updateMany({
          where: {
            status: ApplicationStatus.PENDING,
            OR: [{ developerId: target.id }, { issueId: { in: openIssueIds } }],
          },
          data: { status: ApplicationStatus.REJECTED },
        });
        await tx.adminLog.create({
          data: {
            adminId: admin.id,
            action: "ban_user",
            target: "user",
            targetId: target.id,
            details: { reason: input.reason },
          },
        });
        return user;
      });
      try {
        disconnectUserSockets(user.id);
      } catch {
        /* Socket server may not be available in isolated tests. */
      }
      return user;
    },
  }),
);

builder.mutationField("unbanUser", (t) =>
  t.field({
    type: AdminUserRef,
    args: { userId: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const admin = requireAdmin(ctx);
      return ctx.db.$transaction(async (tx) => {
        const target = await tx.user.findUnique({
          where: { id: String(args.userId) },
        });
        if (!target) throw gqlError("Người dùng không tồn tại", "NOT_FOUND");
        const user = await tx.user.update({
          where: { id: target.id },
          data: { isBanned: false, bannedReason: null, bannedAt: null },
        });
        await tx.adminLog.create({
          data: {
            adminId: admin.id,
            action: "unban_user",
            target: "user",
            targetId: target.id,
          },
        });
        return user;
      });
    },
  }),
);

builder.mutationField("setUserRole", (t) =>
  t.field({
    type: AdminUserRef,
    args: {
      userId: t.arg.id({ required: true }),
      role: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const admin = requireAdmin(ctx);
      const role = parseOrThrow(z.nativeEnum(UserRole), args.role);
      const userId = String(args.userId);
      if (userId === admin.id && role !== UserRole.ADMIN) {
        throw gqlError("Không thể tự hạ quyền quản trị viên", "SELF_DEMOTION");
      }
      return ctx.db.$transaction(async (tx) => {
        const target = await tx.user.findUnique({ where: { id: userId } });
        if (!target) throw gqlError("Người dùng không tồn tại", "NOT_FOUND");
        const user = await tx.user.update({ where: { id: target.id }, data: { role } });
        await tx.adminLog.create({
          data: {
            adminId: admin.id,
            action: "set_user_role",
            target: "user",
            targetId: target.id,
            details: { from: target.role, to: role },
          },
        });
        return user;
      });
    },
  }),
);
