import { Prisma, SubmissionStatus } from "@bloody-roar/database";
import { z } from "zod";
import { builder } from "../../builder";
import { requireAuth } from "../../context";
import { gqlError, parseOrThrow } from "../../errors";
import { ISSUE_INCLUDE, IssueRef } from "../issue/issue.module";
import { UserRef } from "../user/user.module";

const SubmissionStatusEnum = builder.enumType(SubmissionStatus, { name: "SubmissionStatus" });
const SUBMISSION_INCLUDE = { developer: true, issue: { include: ISSUE_INCLUDE } } satisfies Prisma.SubmissionInclude;

export const SubmissionRef = builder.prismaObject("Submission", {
  include: SUBMISSION_INCLUDE,
  fields: (t) => ({
    id: t.exposeID("id"),
    issueId: t.exposeString("issueId"),
    developerId: t.exposeString("developerId"),
    description: t.exposeString("description", { nullable: true }),
    pullRequestUrl: t.exposeString("pullRequestUrl", { nullable: true }),
    prNumber: t.exposeInt("prNumber", { nullable: true }),
    prState: t.exposeString("prState", { nullable: true }),
    status: t.expose("status", { type: SubmissionStatusEnum }),
    submittedAt: t.string({ resolve: (submission) => submission.submittedAt.toISOString() }),
    reviewedAt: t.string({ nullable: true, resolve: (submission) => submission.reviewedAt?.toISOString() ?? null }),
    reviewNotes: t.exposeString("reviewNotes", { nullable: true }),
    developer: t.field({ type: UserRef, resolve: (submission) => submission.developer }),
    issue: t.field({ type: IssueRef, resolve: (submission) => submission.issue }),
  }),
});

builder.queryField("submissions", (t) =>
  t.prismaField({
    type: [SubmissionRef],
    args: { issueId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      const user = requireAuth(ctx);
      const issue = await ctx.db.issue.findUnique({ where: { id: args.issueId }, select: { clientId: true, developerId: true } });
      if (!issue) throw gqlError("Bài toán không tồn tại", "NOT_FOUND");
      if (user.role !== "ADMIN" && issue.clientId !== user.id && issue.developerId !== user.id) throw gqlError("Chỉ người tham gia hoặc admin được xem bài nộp", "FORBIDDEN");
      return ctx.db.submission.findMany({
        ...query,
        where: { issueId: args.issueId },
        orderBy: [{ submittedAt: "desc" }, { id: "asc" }],
        include: SUBMISSION_INCLUDE,
      });
    },
  })
);

builder.mutationField("submitWork", (t) =>
  t.fieldWithInput({
    type: SubmissionRef,
    typeOptions: { name: "SubmitWorkInput" },
    input: {
      issueId: t.input.id({ required: true }),
      description: t.input.string({ required: false }),
      pullRequestUrl: t.input.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      const input = parseOrThrow(z.object({
        issueId: z.string().min(1),
        description: z.string().trim().min(1).max(4000).optional(),
        pullRequestUrl: z.string().url().max(500).optional(),
      }).refine((value) => Boolean(value.description || value.pullRequestUrl), {
        message: "Hãy cung cấp mô tả kết quả hoặc URL pull request",
      }), {
        issueId: String(args.input.issueId),
        ...(args.input.description != null ? { description: args.input.description } : {}),
        ...(args.input.pullRequestUrl != null ? { pullRequestUrl: args.input.pullRequestUrl } : {}),
      });

      const issue = await ctx.db.issue.findUnique({ where: { id: input.issueId }, select: { id: true, status: true, developerId: true, githubRepo: true } });
      if (!issue) throw gqlError("Bài toán không tồn tại", "NOT_FOUND");
      if (issue.developerId !== user.id) throw gqlError("Chỉ developer được giao bài mới có thể nộp kết quả", "FORBIDDEN");
      if (issue.status !== "IN_PROGRESS") throw gqlError("Bài toán không ở trạng thái nhận bài nộp", "ISSUE_NOT_IN_PROGRESS");
      if (input.pullRequestUrl) {
        const pullRequest = new URL(input.pullRequestUrl);
        if (pullRequest.hostname !== "github.com" || !/^\/[^/]+\/[^/]+\/pull\/\d+\/?$/.test(pullRequest.pathname)) {
          throw gqlError("Hãy cung cấp URL pull request GitHub hợp lệ", "INVALID_PULL_REQUEST_URL");
        }
        if (issue.githubRepo) {
          const repo = new URL(issue.githubRepo);
          const normalizedRepo = (pathname: string) => pathname.replace(/\.git\/?$/, "").replace(/\/$/, "").toLowerCase();
          if (repo.hostname !== "github.com" || normalizedRepo(repo.pathname) !== normalizedRepo(pullRequest.pathname.split("/").slice(0, 3).join("/"))) {
            throw gqlError("Pull request phải thuộc repository của bài toán", "PULL_REQUEST_REPOSITORY_MISMATCH");
          }
        }
      }

      try {
        return await ctx.db.$transaction(async (tx) => {
          const outstanding = await tx.submission.findFirst({ where: { issueId: issue.id, status: { in: [SubmissionStatus.SUBMITTED, SubmissionStatus.UNDER_REVIEW] } }, select: { id: true } });
          if (outstanding) throw gqlError("Bài nộp trước đang chờ khách hàng xem xét", "SUBMISSION_UNDER_REVIEW");
          return tx.submission.create({
            data: {
              issueId: issue.id,
              developerId: user.id,
              ...(input.description ? { description: input.description } : {}),
              ...(input.pullRequestUrl ? { pullRequestUrl: input.pullRequestUrl } : {}),
            },
            include: SUBMISSION_INCLUDE,
          });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
          throw gqlError("A concurrent submission was just received; refresh and check before retrying", "SUBMISSION_CONFLICT");
        }
        throw error;
      }
    },
  })
);

builder.mutationField("reviewSubmission", (t) =>
  t.fieldWithInput({
    type: SubmissionRef,
    typeOptions: { name: "ReviewSubmissionInput" },
    input: {
      submissionId: t.input.id({ required: true }),
      approved: t.input.boolean({ required: true }),
      notes: t.input.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      const notes = parseOrThrow(z.string().trim().max(2000).optional(), args.input.notes ?? undefined);
      const submission = await ctx.db.submission.findUnique({ where: { id: String(args.input.submissionId) }, include: SUBMISSION_INCLUDE });
      if (!submission) throw gqlError("Bài nộp không tồn tại", "NOT_FOUND");
      if (submission.issue.clientId !== user.id) throw gqlError("Chỉ khách hàng mới được xem xét bài nộp", "FORBIDDEN");
      if (submission.status !== SubmissionStatus.SUBMITTED && submission.status !== SubmissionStatus.UNDER_REVIEW) {
        throw gqlError("Bài nộp đã được xem xét", "SUBMISSION_ALREADY_REVIEWED");
      }
      const update = await ctx.db.submission.updateMany({
        where: { id: submission.id, status: { in: [SubmissionStatus.SUBMITTED, SubmissionStatus.UNDER_REVIEW] } },
        data: {
          status: args.input.approved ? SubmissionStatus.APPROVED : SubmissionStatus.REJECTED,
          reviewedAt: new Date(),
          ...(notes !== undefined ? { reviewNotes: notes } : {}),
        },
      });
      if (update.count !== 1) throw gqlError("Bài nộp vừa được xem xét", "SUBMISSION_ALREADY_REVIEWED");
      return ctx.db.submission.findUnique({ where: { id: submission.id }, include: SUBMISSION_INCLUDE });
    },
  })
);
