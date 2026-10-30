import { Prisma, recalcReputation, type Review } from "@bloody-roar/database";
import { z } from "zod";
import { builder } from "../../builder";
import { requireAuth } from "../../context";
import { gqlError, parseOrThrow } from "../../errors";
import { guardMessage } from "../../../ai/guard/service";

const ReviewRef = builder.objectRef<Review>("Review").implement({
  fields: (t) => ({
    id: t.id({ resolve: (review) => review.id }),
    issueId: t.id({ resolve: (review) => review.issueId }),
    clientId: t.string({ resolve: (review) => review.clientId }),
    developerId: t.string({ resolve: (review) => review.developerId }),
    rating: t.int({ resolve: (review) => review.rating }),
    comment: t.string({ nullable: true, resolve: (review) => review.comment }),
    createdAt: t.string({ resolve: (review) => review.createdAt.toISOString() }),
  }),
});

// Chỉ client đánh giá developer, mỗi issue một lần. Điểm uy tín được tính lại trong cùng transaction.
builder.mutationField("submitReview", (t) =>
  t.field({
    type: ReviewRef,
    args: {
      issueId: t.arg.id({ required: true }),
      rating: t.arg.int({ required: true }),
      comment: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      const input = parseOrThrow(
        z.object({
          rating: z.number().int().min(1).max(5),
          comment: z.string().max(2000).optional(),
        }),
        { rating: args.rating, comment: args.comment ?? undefined },
      );
      const issueId = String(args.issueId);
      const issue = await ctx.db.issue.findUnique({
        where: { id: issueId },
        select: { clientId: true, developerId: true, status: true },
      });
      if (!issue) throw gqlError("Bài toán không tồn tại", "NOT_FOUND");
      if (issue.clientId !== user.id) throw gqlError("Chỉ khách hàng mới đánh giá được", "FORBIDDEN");
      const developerId = issue.developerId;
      if (issue.status !== "COMPLETED" || !developerId) throw gqlError("Chỉ đánh giá sau khi bài toán hoàn thành", "INVALID_STATE");

      const comment = input.comment?.trim() ? (await guardMessage(input.comment, { issueId })).content : null;
      try {
        return await ctx.db.$transaction(async (tx) => {
          const review = await tx.review.create({
            data: { issueId, clientId: user.id, developerId, rating: input.rating, comment },
          });
          await recalcReputation(tx, developerId);
          return review;
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
          throw gqlError("Bài toán đã có đánh giá", "CONFLICT");
        throw error;
      }
    },
  }),
);

builder.queryField("reviews", (t) =>
  t.field({
    type: [ReviewRef],
    args: {
      userId: t.arg.id({ required: true }),
      first: t.arg.int({ required: false, defaultValue: 20 }),
      after: t.arg.id({ required: false }),
    },
    resolve: (_root, args, ctx) =>
      ctx.db.review.findMany({
        where: { developerId: String(args.userId) },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: Math.min(Math.max(args.first ?? 20, 1), 100),
        ...(args.after ? { cursor: { id: String(args.after) }, skip: 1 } : {}),
      }),
  }),
);
