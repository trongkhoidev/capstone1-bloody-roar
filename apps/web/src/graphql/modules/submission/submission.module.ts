import { type Prisma, SubmissionStatus } from "@bloody-roar/database";
import { builder } from "../../builder";
import { requireAuth } from "../../context";
import { gqlError } from "../../errors";
import { ISSUE_INCLUDE, IssueRef } from "../issue/issue.module";
import { UserRef } from "../user/user.module";

const SubmissionStatusEnum = builder.enumType(SubmissionStatus, {
  name: "SubmissionStatus",
});
export const SUBMISSION_INCLUDE = {
  developer: true,
  issue: { include: ISSUE_INCLUDE },
} satisfies Prisma.SubmissionInclude;

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
    deliveryHash: t.exposeString("deliveryHash", { nullable: true }),
    changesRequested: t.exposeBoolean("changesRequested"),
    submittedAt: t.string({
      resolve: (submission) => submission.submittedAt.toISOString(),
    }),
    reviewedAt: t.string({
      nullable: true,
      resolve: (submission) => submission.reviewedAt?.toISOString() ?? null,
    }),
    reviewNotes: t.exposeString("reviewNotes", { nullable: true }),
    developer: t.field({
      type: UserRef,
      resolve: (submission) => submission.developer,
    }),
    issue: t.field({
      type: IssueRef,
      resolve: (submission) => submission.issue,
    }),
  }),
});

builder.queryField("submissions", (t) =>
  t.prismaField({
    type: [SubmissionRef],
    args: { issueId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      const user = requireAuth(ctx);
      const issue = await ctx.db.issue.findUnique({
        where: { id: args.issueId },
        select: { clientId: true, developerId: true },
      });
      if (!issue) throw gqlError("Bài toán không tồn tại", "NOT_FOUND");
      if (user.role !== "ADMIN" && issue.clientId !== user.id && issue.developerId !== user.id)
        throw gqlError("Chỉ người tham gia hoặc admin được xem bài nộp", "FORBIDDEN");
      return ctx.db.submission.findMany({
        ...query,
        where: { issueId: args.issueId },
        orderBy: [{ submittedAt: "desc" }, { id: "asc" }],
        include: SUBMISSION_INCLUDE,
      });
    },
  }),
);
