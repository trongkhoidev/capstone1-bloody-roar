import { z } from "zod";
import { builder } from "../../builder";
import { requireAuth } from "../../context";
import { gqlError, parseOrThrow } from "../../errors";
import { UserRef } from "../user/user.module";

const ISSUE_COMMENT_INCLUDE = { user: true };

export const IssueCommentRef = builder.prismaObject("IssueComment", {
  include: ISSUE_COMMENT_INCLUDE,
  fields: (t) => ({
    id: t.exposeID("id"),
    body: t.exposeString("body"),
    issueId: t.exposeString("issueId"),
    createdAt: t.string({ resolve: (comment) => comment.createdAt.toISOString() }),
    user: t.field({ type: UserRef, resolve: (comment) => comment.user }),
  }),
});

builder.queryField("issueComments", (t) =>
  t.prismaField({
    type: [IssueCommentRef],
    args: { issueId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      const issue = await ctx.db.issue.findUnique({
        where: { id: args.issueId },
        select: { clientId: true, isDraft: true },
      });
      if (!issue || (issue.isDraft && ctx.user?.id !== issue.clientId)) return [];
      return ctx.db.issueComment.findMany({
        ...query,
        where: { issueId: args.issueId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: ISSUE_COMMENT_INCLUDE,
      });
    },
  }),
);

builder.mutationField("createIssueComment", (t) =>
  t.fieldWithInput({
    type: IssueCommentRef,
    typeOptions: { name: "CreateIssueCommentInput" },
    input: {
      issueId: t.input.id({ required: true }),
      body: t.input.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      if (user.isBanned) throw gqlError("This account cannot comment", "ACCOUNT_SUSPENDED");

      const input = parseOrThrow(z.object({
        issueId: z.string().min(1),
        body: z.string().trim().min(2).max(1200),
      }), {
        issueId: String(args.input.issueId),
        body: args.input.body,
      });

      const issue = await ctx.db.issue.findUnique({
        where: { id: input.issueId },
        select: { id: true, isDraft: true, status: true },
      });
      if (!issue || issue.isDraft) throw gqlError("Bounty was not found", "NOT_FOUND");
      if (issue.status === "CANCELLED") throw gqlError("This bounty is closed to comments", "ISSUE_CLOSED");

      return ctx.db.issueComment.create({
        data: { issueId: issue.id, userId: user.id, body: input.body },
        include: ISSUE_COMMENT_INCLUDE,
      });
    },
  }),
);
