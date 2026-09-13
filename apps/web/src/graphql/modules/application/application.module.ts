import { ApplicationStatus, IssueStatus, UserRole } from "@bloody-roar/database";
import type { Prisma } from "@bloody-roar/database";
import { z } from "zod";
import { builder } from "../../builder";
import { requireAuth } from "../../context";
import { gqlError, parseOrThrow } from "../../errors";
import { createNotificationSafely } from "../../../lib/services/notifications";
import { UserRef } from "../user/user.module";
import { ISSUE_INCLUDE, IssueRef } from "../issue/issue.module";

const ApplicationStatusEnum = builder.enumType(ApplicationStatus, { name: "ApplicationStatus" });
const APPLICATION_INCLUDE = { developer: true, issue: { include: ISSUE_INCLUDE } } satisfies Prisma.ApplicationInclude;

export const ApplicationRef = builder.prismaObject("Application", {
  include: APPLICATION_INCLUDE,
  fields: (t) => ({
    id: t.exposeID("id"),
    status: t.expose("status", { type: ApplicationStatusEnum }),
    message: t.exposeString("message", { nullable: true }),
    issueId: t.exposeString("issueId"),
    developerId: t.exposeString("developerId"),
    createdAt: t.string({ resolve: (application) => application.createdAt.toISOString() }),
    developer: t.field({ type: UserRef, resolve: (application) => application.developer }),
    issue: t.field({ type: IssueRef, resolve: (application) => application.issue }),
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
      const issue = await ctx.db.issue.findUnique({ where: { id: args.issueId }, select: { clientId: true } });
      if (!issue) throw gqlError("Bài toán không tồn tại", "NOT_FOUND");
      if (issue.clientId !== user.id) throw gqlError("Chỉ chủ bài toán mới được xem danh sách ứng viên", "FORBIDDEN");
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
      if (user.role !== UserRole.DEVELOPER) throw gqlError("Switch your profile to the developer role before applying", "DEVELOPER_ROLE_REQUIRED");
      const input = parseOrThrow(ApplySchema, {
        issueId: String(args.input.issueId),
        ...(args.input.message != null ? { message: args.input.message } : {}),
      });
      const issue = await ctx.db.issue.findUnique({ where: { id: input.issueId } });
      if (!issue || issue.isDraft) throw gqlError("Bài toán không tồn tại", "NOT_FOUND");
      if (issue.clientId === user.id) throw gqlError("Bạn không thể ứng tuyển vào bài toán của mình", "SELF_APPLICATION");
      if (issue.status !== IssueStatus.OPEN || (issue.expiresAt && issue.expiresAt < new Date())) {
        throw gqlError("Bài toán không còn nhận ứng tuyển", "ISSUE_NOT_OPEN");
      }

      const previous = await ctx.db.application.findUnique({
        where: { issueId_developerId: { issueId: input.issueId, developerId: user.id } },
      });
      if (previous && previous.status !== ApplicationStatus.WITHDRAWN) {
        throw gqlError("Bạn đã ứng tuyển vào bài toán này", "ALREADY_APPLIED");
      }

      let application;
      try {
        application = previous
          ? await ctx.db.application.update({
              where: { id: previous.id },
              data: { status: ApplicationStatus.PENDING, message: input.message ?? null },
              include: APPLICATION_INCLUDE,
            })
          : await ctx.db.application.create({
              data: { issueId: input.issueId, developerId: user.id, message: input.message ?? null },
              include: APPLICATION_INCLUDE,
            });
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
          throw gqlError("You already have an application for this task", "ALREADY_APPLIED");
        }
        throw error;
      }

      await createNotificationSafely(ctx.db, {
        userId: issue.clientId,
        type: "NEW_APPLICANT",
        title: "Có ứng viên mới",
        body: `${user.name || "Một developer"} đã ứng tuyển vào “${issue.title}”.`,
        actorId: user.id,
        link: `/issues/${issue.id}`,
        data: { issueId: issue.id, applicationId: application.id },
      });
      return application;
    },
  })
);

builder.mutationField("withdrawApplication", (t) =>
  t.field({
    type: ApplicationRef,
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      const application = await ctx.db.application.findUnique({ where: { id: String(args.id) } });
      if (!application) throw gqlError("Đơn ứng tuyển không tồn tại", "NOT_FOUND");
      if (application.developerId !== user.id) throw gqlError("Bạn không có quyền rút đơn này", "FORBIDDEN");
      if (application.status !== ApplicationStatus.PENDING) throw gqlError("Đơn này không thể rút", "APPLICATION_NOT_WITHDRAWABLE");
      return ctx.db.application.update({
        where: { id: application.id },
        data: { status: ApplicationStatus.WITHDRAWN },
        include: APPLICATION_INCLUDE,
      });
    },
  })
);

builder.mutationField("assignDeveloper", (t) =>
  t.fieldWithInput({
    type: IssueRef,
    typeOptions: { name: "AssignDeveloperInput" },
    input: {
      issueId: t.input.id({ required: true }),
      applicationId: t.input.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      const issueId = String(args.input.issueId);
      const applicationId = String(args.input.applicationId);

      const assigned = await ctx.db.$transaction(async (tx) => {
        const issue = await tx.issue.findUnique({ where: { id: issueId } });
        if (!issue) throw gqlError("Bài toán không tồn tại", "NOT_FOUND");
        if (issue.clientId !== user.id) throw gqlError("Chỉ chủ bài toán mới được chọn developer", "FORBIDDEN");
        if (issue.status !== IssueStatus.OPEN || issue.developerId) throw gqlError("Bài toán đã được nhận hoặc không còn mở", "ISSUE_NOT_OPEN");
        const application = await tx.application.findFirst({ where: { id: applicationId, issueId, status: ApplicationStatus.PENDING } });
        if (!application) throw gqlError("Đơn ứng tuyển không còn hiệu lực", "APPLICATION_NOT_PENDING");

        const claim = await tx.issue.updateMany({
          where: { id: issueId, status: IssueStatus.OPEN, developerId: null },
          data: { developerId: application.developerId, status: IssueStatus.IN_PROGRESS, assignedAt: new Date() },
        });
        if (claim.count !== 1) throw gqlError("Bài toán vừa được một người khác nhận", "ISSUE_NOT_OPEN");

        const rejectedApplications = await tx.application.findMany({
          where: { issueId, status: ApplicationStatus.PENDING, id: { not: applicationId } },
          select: { developerId: true },
        });
        await tx.application.updateMany({
          where: { issueId, status: ApplicationStatus.PENDING, id: { not: applicationId } },
          data: { status: ApplicationStatus.REJECTED },
        });
        await tx.application.update({ where: { id: applicationId }, data: { status: ApplicationStatus.ACCEPTED } });
        return { issue, application, rejectedDeveloperIds: rejectedApplications.map((candidate) => candidate.developerId) };
      });

      await Promise.all([
        createNotificationSafely(ctx.db, {
          userId: assigned.application.developerId,
          type: "APPLICATION_ACCEPTED",
          title: "Đơn ứng tuyển được chấp nhận",
          body: `Bạn đã được chọn cho “${assigned.issue.title}”.`,
          actorId: user.id,
          link: `/issues/${issueId}`,
          data: { issueId },
        }),
        createNotificationSafely(ctx.db, {
          userId: assigned.application.developerId,
          type: "TASK_ASSIGNED",
          title: "Bài toán đã được giao cho bạn",
          body: `Bạn có thể bắt đầu trao đổi trong phòng chat của “${assigned.issue.title}”.`,
          actorId: user.id,
          link: `/issues/${issueId}`,
          data: { issueId },
        }),
        ...assigned.rejectedDeveloperIds.map((developerId) => createNotificationSafely(ctx.db, {
          userId: developerId,
          type: "APPLICATION_REJECTED",
          title: "Đơn ứng tuyển chưa được chọn",
          body: `Khách hàng đã chọn developer khác cho “${assigned.issue.title}”.`,
          actorId: user.id,
          link: `/issues/${issueId}`,
          data: { issueId },
        })),
      ]);

      return ctx.db.issue.findUnique({ where: { id: issueId }, include: ISSUE_INCLUDE });
    },
  })
);
