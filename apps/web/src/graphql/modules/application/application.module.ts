import { ApplicationStatus, IssueStatus, Prisma, UserRole } from "@bloody-roar/database";
import { z } from "zod";
import { builder } from "../../builder";
import { requireAuth } from "../../context";
import { gqlError, parseOrThrow } from "../../errors";
import { createNotificationSafely } from "../../../lib/services/notifications";
import { UserRef } from "../user/user.module";
import { ISSUE_INCLUDE, IssueRef } from "../issue/issue.module";

const ApplicationStatusEnum = builder.enumType(ApplicationStatus, {
  name: "ApplicationStatus",
});
const APPLICATION_INCLUDE = {
  developer: true,
  issue: { include: ISSUE_INCLUDE },
} satisfies Prisma.ApplicationInclude;

export const ApplicationRef = builder.prismaObject("Application", {
  include: APPLICATION_INCLUDE,
  fields: (t) => ({
    id: t.exposeID("id"),
    status: t.expose("status", { type: ApplicationStatusEnum }),
    message: t.exposeString("message", { nullable: true }),
    issueId: t.exposeString("issueId"),
    developerId: t.exposeString("developerId"),
    createdAt: t.string({
      resolve: (application) => application.createdAt.toISOString(),
    }),
    developer: t.field({
      type: UserRef,
      resolve: (application) => application.developer,
    }),
    issue: t.field({
      type: IssueRef,
      resolve: (application) => application.issue,
    }),
  }),
});

const ApplySchema = z.object({
  issueId: z.string().min(1),
  message: z.string().trim().max(1000).optional(),
});

builder.queryFields((t) => ({
  applications: t.prismaField({
    type: [ApplicationRef],
    args: { issueId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      const user = requireAuth(ctx);
      const issue = await ctx.db.issue.findUnique({
        where: { id: args.issueId },
        select: { clientId: true },
      });
      if (!issue) throw gqlError("Bài toán không tồn tại", "NOT_FOUND");
      if (issue.clientId !== user.id)
        throw gqlError("Chỉ chủ bài toán mới được xem danh sách ứng viên", "FORBIDDEN");
      return ctx.db.application.findMany({
        ...query,
        where: { issueId: args.issueId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: APPLICATION_INCLUDE,
      });
    },
  }),
  myApplications: t.prismaField({
    type: [ApplicationRef],
    resolve: (query, _root, _args, ctx) => {
      const user = requireAuth(ctx);
      return ctx.db.application.findMany({
        ...query,
        where: { developerId: user.id },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        include: APPLICATION_INCLUDE,
      });
    },
  }),
}));

builder.mutationField("applyToIssue", (t) =>
  t.fieldWithInput({
    type: ApplicationRef,
    typeOptions: { name: "ApplyToIssueInput" },
    input: {
      issueId: t.input.id({ required: true }),
      message: t.input.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      if (user.role === UserRole.ADMIN)
        throw gqlError("Quản trị viên không thể ứng tuyển", "ADMIN_NOT_ALLOWED");
      const input = parseOrThrow(ApplySchema, {
        issueId: String(args.input.issueId),
        ...(args.input.message != null ? { message: args.input.message } : {}),
      });
      let result: {
        application: Prisma.ApplicationGetPayload<{
          include: typeof APPLICATION_INCLUDE;
        }>;
        issue: { id: string; clientId: string; title: string };
      };
      try {
        result = await ctx.db.$transaction(
          async (tx) => {
            const issue = await tx.issue.findUnique({
              where: { id: input.issueId },
            });
            if (!issue || issue.isDraft) throw gqlError("Bài toán không tồn tại", "NOT_FOUND");
            if (issue.clientId === user.id)
              throw gqlError("Bạn không thể ứng tuyển vào bài toán của mình", "SELF_APPLICATION");
            if (
              issue.status !== IssueStatus.OPEN ||
              (issue.expiresAt && issue.expiresAt <= new Date())
            ) {
              throw gqlError("Bài toán không còn nhận ứng tuyển", "ISSUE_NOT_OPEN");
            }

            const previous = await tx.application.findUnique({
              where: {
                issueId_developerId: {
                  issueId: input.issueId,
                  developerId: user.id,
                },
              },
            });
            if (previous && previous.status !== ApplicationStatus.WITHDRAWN) {
              throw gqlError("Bạn đã ứng tuyển vào bài toán này", "ALREADY_APPLIED");
            }

            const application = previous
              ? await tx.application.update({
                  where: { id: previous.id },
                  data: {
                    status: ApplicationStatus.PENDING,
                    message: input.message?.trim() || null,
                  },
                  include: APPLICATION_INCLUDE,
                })
              : await tx.application.create({
                  data: {
                    issueId: input.issueId,
                    developerId: user.id,
                    message: input.message?.trim() || null,
                  },
                  include: APPLICATION_INCLUDE,
                });
            return {
              application,
              issue: {
                id: issue.id,
                clientId: issue.clientId,
                title: issue.title,
              },
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2002"
        ) {
          throw gqlError("You already have an application for this task", "ALREADY_APPLIED");
        }
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2034"
        ) {
          throw gqlError(
            "Task state changed while you were applying; refresh and try again",
            "ISSUE_NOT_OPEN",
          );
        }
        throw error;
      }

      await createNotificationSafely(ctx.db, {
        userId: result.issue.clientId,
        type: "NEW_APPLICANT",
        title: "Có ứng viên mới",
        body: `${user.name || "Một developer"} đã ứng tuyển vào “${result.issue.title}”.`,
        actorId: user.id,
        link: `/issues/${result.issue.id}`,
        data: {
          issueId: result.issue.id,
          applicationId: result.application.id,
        },
      });
      return result.application;
    },
  }),
);

builder.mutationField("withdrawApplication", (t) =>
  t.field({
    type: ApplicationRef,
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      const application = await ctx.db.application.findUnique({
        where: { id: String(args.id) },
      });
      if (!application) throw gqlError("Đơn ứng tuyển không tồn tại", "NOT_FOUND");
      if (application.developerId !== user.id)
        throw gqlError("Bạn không có quyền rút đơn này", "FORBIDDEN");
      if (application.status !== ApplicationStatus.PENDING)
        throw gqlError("Đơn này không thể rút", "APPLICATION_NOT_WITHDRAWABLE");
      const withdrawn = await ctx.db.application.updateMany({
        where: {
          id: application.id,
          developerId: user.id,
          status: ApplicationStatus.PENDING,
        },
        data: { status: ApplicationStatus.WITHDRAWN },
      });
      if (withdrawn.count !== 1)
        throw gqlError("Đơn này vừa được xử lý và không thể rút", "APPLICATION_NOT_WITHDRAWABLE");
      return ctx.db.application.findUniqueOrThrow({
        where: { id: application.id },
        include: APPLICATION_INCLUDE,
      });
    },
  }),
);

builder.mutationField("rejectApplication", (t) =>
  t.field({
    type: ApplicationRef,
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      const application = await ctx.db.application.findUnique({
        where: { id: String(args.id) },
        include: { issue: { select: { id: true, clientId: true, title: true, status: true } } },
      });
      if (!application) throw gqlError("Đơn ứng tuyển không tồn tại", "NOT_FOUND");
      if (application.issue.clientId !== user.id)
        throw gqlError("Chỉ chủ task mới được từ chối đơn này", "FORBIDDEN");
      if (application.issue.status !== IssueStatus.OPEN)
        throw gqlError("Task không còn mở để xử lý ứng viên", "ISSUE_NOT_OPEN");
      const rejected = await ctx.db.application.updateMany({
        where: { id: application.id, status: ApplicationStatus.PENDING },
        data: { status: ApplicationStatus.REJECTED },
      });
      if (rejected.count !== 1)
        throw gqlError("Chỉ có thể từ chối đơn đang chờ duyệt", "APPLICATION_NOT_REJECTABLE");

      await createNotificationSafely(ctx.db, {
        userId: application.developerId,
        type: "APPLICATION_REJECTED",
        title: "Đơn ứng tuyển không được chọn",
        body: `Đơn của bạn cho “${application.issue.title}” đã không được chọn.`,
        actorId: user.id,
        link: `/issues/${application.issue.id}`,
        data: { issueId: application.issue.id, applicationId: application.id },
      });

      return ctx.db.application.findUniqueOrThrow({
        where: { id: application.id },
        include: APPLICATION_INCLUDE,
      });
    },
  }),
);
