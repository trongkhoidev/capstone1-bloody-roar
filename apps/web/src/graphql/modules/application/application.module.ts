import { ApplicationStatus, IssueStatus, Prisma, ReservationStatus, UserRole } from "@bloody-roar/database";
import { z } from "zod";
import { builder } from "../../builder";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@bloody-roar/shared";
import { requireAuth, type GraphQLContext } from "../../context";
import { gqlError, parseOrThrow } from "../../errors";
import { createNotificationSafely } from "../../../lib/services/notifications";
import { guardMessage } from "../../../ai/guard/service";
import { UserRef } from "../user/user.module";
import { ISSUE_INCLUDE, IssueRef, encodeCursor, decodeCursor } from "../issue/issue.module";

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
    cursor: t.string({ resolve: (application) => encodeCursor(application.id) }),
    status: t.expose("status", { type: ApplicationStatusEnum }),
    message: t.exposeString("message", { nullable: true }),
    issueId: t.exposeString("issueId"),
    developerId: t.exposeString("developerId"),
    reuseOfIssueId: t.exposeString("reuseOfIssueId", { nullable: true }),
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
  reuseOfIssueId: z.string().min(1).max(191).optional(),
});

function issueApplications(db: GraphQLContext["db"], issueId: string, take = DEFAULT_PAGE_SIZE, cursor?: string | null, query: object = {}) {
  return db.application.findMany({
    ...query,
    where: { issueId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), include: APPLICATION_INCLUDE,
  });
}

builder.prismaObjectFields(IssueRef, (t) => ({
  ownerApplications: t.field({
    type: [ApplicationRef],
    resolve: (issue, _args, ctx) => ctx.user?.id === issue.clientId ? issueApplications(ctx.db, issue.id) : [],
  }),
  viewerApplication: t.field({
    type: ApplicationRef,
    nullable: true,
    resolve: (issue, _args, ctx) => {
      const user = ctx.user;
      if (!user || user.role === "ADMIN" || user.id === issue.clientId) return null;
      return ctx.db.application.findUnique({
        where: { issueId_developerId: { issueId: issue.id, developerId: user.id } },
        include: APPLICATION_INCLUDE,
      });
    },
  }),
}));

builder.queryFields((t) => ({
  applications: t.prismaField({
    type: [ApplicationRef],
    args: { issueId: t.arg.string({ required: true }), first: t.arg.int(), after: t.arg.string() },
    resolve: async (query, _root, args, ctx) => {
      const user = requireAuth(ctx);
      const issue = await ctx.db.issue.findUnique({
        where: { id: args.issueId },
        select: { clientId: true },
      });
      if (!issue) throw gqlError("Bounty not found", "NOT_FOUND");
      if (issue.clientId !== user.id)
        throw gqlError("Only the bounty owner can view applicants", "FORBIDDEN");
      const page = parseOrThrow(z.object({ first: z.number().int().min(1).max(MAX_PAGE_SIZE).nullish(), after: z.string().max(256).nullish() }), args);
      const cursor = page.after ? decodeCursor(page.after) : null;
      if (cursor && !await ctx.db.application.findFirst({ where: { id: cursor, issueId: args.issueId }, select: { id: true } }))
        throw gqlError("Cursor does not belong to this applicant list", "INVALID_CURSOR");
      return issueApplications(ctx.db, args.issueId, page.first ?? DEFAULT_PAGE_SIZE, cursor, query);
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
      reuseOfIssueId: t.input.id({ required: false, description: "US-108: a COMPLETED issue you fixed that matches this one; applies at the reuse price" }),
    },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      if (user.role === UserRole.ADMIN)
        throw gqlError("Admins cannot apply", "ADMIN_NOT_ALLOWED");
      const input = parseOrThrow(ApplySchema, {
        issueId: String(args.input.issueId),
        ...(args.input.message != null ? { message: args.input.message } : {}),
        ...(args.input.reuseOfIssueId != null ? { reuseOfIssueId: String(args.input.reuseOfIssueId) } : {}),
      });
      const message = input.message?.trim() ? (await guardMessage(input.message.trim(), { issueId: input.issueId })).content : null;
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
            if (!issue || issue.isDraft) throw gqlError("Bounty not found", "NOT_FOUND");
            if (issue.clientId === user.id)
              throw gqlError("You cannot apply to your own bounty", "SELF_APPLICATION");
            if (
              issue.status !== IssueStatus.OPEN ||
              (issue.expiresAt && issue.expiresAt <= new Date())
            ) {
              throw gqlError("This bounty no longer accepts applications", "ISSUE_NOT_OPEN");
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
              throw gqlError("You already applied to this bounty", "ALREADY_APPLIED");
            }
            if (input.reuseOfIssueId) {
              const [reused, similar] = await Promise.all([
                tx.issue.findUnique({ where: { id: input.reuseOfIssueId }, select: { developerId: true, status: true } }),
                tx.issueSimilarity.findUnique({ where: { issueId_similarIssueId: { issueId: issue.id, similarIssueId: input.reuseOfIssueId } }, select: { developerId: true } }),
              ]);
              if (!reused || reused.developerId !== user.id)
                throw gqlError("Only the developer who fixed that issue can reuse it", "REUSE_NOT_ALLOWED");
              if (reused.status !== IssueStatus.COMPLETED)
                throw gqlError("The reused issue is not completed", "REUSE_NOT_ALLOWED");
              if (similar?.developerId !== user.id)
                throw gqlError("That issue was not matched to this bounty", "REUSE_NOT_ALLOWED");
            }
            const reuseOfIssueId = input.reuseOfIssueId ?? null;

            const application = previous
              ? await tx.application.update({
                  where: { id: previous.id },
                  data: {
                    status: ApplicationStatus.PENDING,
                    message,
                    reuseOfIssueId,
                  },
                  include: APPLICATION_INCLUDE,
                })
              : await tx.application.create({
                  data: {
                    issueId: input.issueId,
                    developerId: user.id,
                    message,
                    reuseOfIssueId,
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
        title: "New applicant",
        body: `${user.name || "A developer"} applied to “${result.issue.title}”.`,
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
      if (!application) throw gqlError("Application not found", "NOT_FOUND");
      if (application.developerId !== user.id)
        throw gqlError("You cannot withdraw this application", "FORBIDDEN");
      if (application.status !== ApplicationStatus.PENDING)
        throw gqlError("This application cannot be withdrawn", "APPLICATION_NOT_WITHDRAWABLE");
      return ctx.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM issues WHERE id = ${application.issueId} FOR UPDATE`;
        const active = await tx.fundingReservation.count({
          where: {
            applicationId: application.id,
            status: { in: [ReservationStatus.AWAITING_FUNDING, ReservationStatus.FUNDED] },
          },
        });
        if (active > 0)
          throw gqlError("This application is being funded and cannot be withdrawn", "APPLICATION_NOT_WITHDRAWABLE");
        const withdrawn = await tx.application.updateMany({
          where: {
            id: application.id,
            developerId: user.id,
            status: ApplicationStatus.PENDING,
          },
          data: { status: ApplicationStatus.WITHDRAWN },
        });
        if (withdrawn.count !== 1)
          throw gqlError("This application was just processed and cannot be withdrawn", "APPLICATION_NOT_WITHDRAWABLE");
        return tx.application.findUniqueOrThrow({
          where: { id: application.id },
          include: APPLICATION_INCLUDE,
        });
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
      if (!application) throw gqlError("Application not found", "NOT_FOUND");
      if (application.issue.clientId !== user.id)
        throw gqlError("Only the bounty owner can decline this application", "FORBIDDEN");
      if (application.issue.status !== IssueStatus.OPEN)
        throw gqlError("This bounty is no longer open for applicants", "ISSUE_NOT_OPEN");
      const rejected = await ctx.db.application.updateMany({
        where: { id: application.id, status: ApplicationStatus.PENDING },
        data: { status: ApplicationStatus.REJECTED },
      });
      if (rejected.count !== 1)
        throw gqlError("Only pending applications can be declined", "APPLICATION_NOT_REJECTABLE");

      await createNotificationSafely(ctx.db, {
        userId: application.developerId,
        type: "APPLICATION_REJECTED",
        title: "Application not selected",
        body: `Your application for “${application.issue.title}” was not selected.`,
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
