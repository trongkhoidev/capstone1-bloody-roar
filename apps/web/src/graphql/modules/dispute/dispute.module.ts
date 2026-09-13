import { DisputeStatus, IssueStatus } from "@bloody-roar/database";
import type { Prisma } from "@bloody-roar/database";
import { z } from "zod";
import { builder } from "../../builder";
import { requireAdmin, requireAuth } from "../../context";
import { gqlError, parseOrThrow } from "../../errors";
import { createNotificationSafely } from "../../../lib/services/notifications";
import { UserRef } from "../user/user.module";
import { completeAI } from "../../../ai/model-router";
import { scanAndMask } from "../../../ai/guard/scanner";

const DisputeStatusEnum = builder.enumType(DisputeStatus, { name: "DisputeStatus" });
const DISPUTE_INCLUDE = { raisedBy: true, resolvedBy: true } satisfies Prisma.DisputeInclude;

export const DisputeRef = builder.prismaObject("Dispute", {
  include: DISPUTE_INCLUDE,
  fields: (t) => ({
    id: t.exposeID("id"),
    issueId: t.exposeString("issueId"),
    status: t.expose("status", { type: DisputeStatusEnum }),
    reason: t.exposeString("reason"),
    aiReport: t.string({ nullable: true, resolve: (dispute) => dispute.aiReport == null ? null : JSON.stringify(dispute.aiReport) }),
    aiConfidenceScore: t.exposeFloat("aiConfidenceScore", { nullable: true }),
    suggestedRatio: t.float({ nullable: true, resolve: (dispute) => dispute.suggestedRatio?.toNumber() ?? null }),
    proposedClientRatio: t.float({ nullable: true, resolve: (dispute) => dispute.proposedClientRatio?.toNumber() ?? null }),
    proposedAt: t.string({ nullable: true, resolve: (dispute) => dispute.proposedAt?.toISOString() ?? null }),
    challengeDeadline: t.string({ nullable: true, resolve: (dispute) => dispute.challengeDeadline?.toISOString() ?? null }),
    challengedAt: t.string({ nullable: true, resolve: (dispute) => dispute.challengedAt?.toISOString() ?? null }),
    resolutionNote: t.exposeString("resolutionNote", { nullable: true }),
    raisedBy: t.field({ type: UserRef, resolve: (dispute) => dispute.raisedBy }),
    createdAt: t.string({ resolve: (dispute) => dispute.createdAt.toISOString() }),
  }),
});

builder.queryFields((t) => ({
  dispute: t.prismaField({
    type: DisputeRef,
    nullable: true,
    args: { issueId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      const user = requireAuth(ctx);
      const issue = await ctx.db.issue.findUnique({ where: { id: args.issueId }, select: { clientId: true, developerId: true } });
      if (!issue) return null;
      const isAdmin = user.role === "ADMIN";
      if (!isAdmin && issue.clientId !== user.id && issue.developerId !== user.id) throw gqlError("Bạn không được phép xem tranh chấp này", "FORBIDDEN");
      return ctx.db.dispute.findUnique({ ...query, where: { issueId: args.issueId }, include: DISPUTE_INCLUDE });
    },
  }),
  adminDisputes: t.prismaField({
    type: [DisputeRef],
    resolve: (query, _root, _args, ctx) => {
      requireAdmin(ctx);
      return ctx.db.dispute.findMany({
        ...query,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: DISPUTE_INCLUDE,
      });
    },
  }),
}));

builder.mutationField("raiseDispute", (t) =>
  t.fieldWithInput({
    type: DisputeRef,
    typeOptions: { name: "RaiseDisputeInput" },
    input: {
      issueId: t.input.id({ required: true }),
      reason: t.input.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      const input = parseOrThrow(z.object({ issueId: z.string().min(1), reason: z.string().trim().min(20).max(3000) }), {
        issueId: String(args.input.issueId),
        reason: args.input.reason,
      });
      const issue = await ctx.db.issue.findUnique({ where: { id: input.issueId } });
      if (!issue) throw gqlError("Bài toán không tồn tại", "NOT_FOUND");
      if (issue.clientId !== user.id && issue.developerId !== user.id) throw gqlError("Chỉ hai bên tham gia mới được mở tranh chấp", "FORBIDDEN");
      if (issue.status !== IssueStatus.IN_PROGRESS) throw gqlError("Chỉ bài toán đang thực hiện mới mở được tranh chấp", "ISSUE_NOT_DISPUTABLE");

      const dispute = await ctx.db.$transaction(async (tx) => {
        const claimed = await tx.issue.updateMany({
          where: { id: issue.id, status: IssueStatus.IN_PROGRESS },
          data: { status: IssueStatus.DISPUTED },
        });
        if (claimed.count !== 1) throw gqlError("Task state changed before the dispute was opened", "ISSUE_NOT_DISPUTABLE");
        const record = await tx.dispute.create({
          data: { issueId: issue.id, reason: input.reason, raisedById: user.id },
          include: DISPUTE_INCLUDE,
        });
        return record;
      });

      const otherUserId = issue.clientId === user.id ? issue.developerId : issue.clientId;
      if (otherUserId) {
        await createNotificationSafely(ctx.db, {
          userId: otherUserId,
          type: "DISPUTE_RAISED",
          title: "Đã mở tranh chấp",
          body: `Một bên đã mở tranh chấp cho “${issue.title}”.`,
          actorId: user.id,
          link: `/issues/${issue.id}`,
          data: { issueId: issue.id, disputeId: dispute.id },
        });
      }
      return dispute;
    },
  })
);

const DisputeAnalysisSchema = z.object({
  summary: z.string().trim().min(30).max(2500),
  suggestedClientRatio: z.number().min(0).max(100),
  confidenceScore: z.number().min(0).max(1),
  findings: z.array(z.object({
    evidenceType: z.enum(["TASK", "DISPUTE", "MESSAGE", "SUBMISSION", "TEST_CASE"]),
    evidenceId: z.string().min(1).max(100),
    side: z.enum(["CLIENT", "DEVELOPER", "NEUTRAL"]),
    finding: z.string().trim().min(10).max(800),
  })).max(20),
  missingEvidence: z.array(z.string().trim().min(4).max(400)).max(10),
  reasoning: z.string().trim().min(40).max(4000),
});

function parseModelJson(text: string) {
  const unfenced = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("The model returned invalid JSON.");
  return JSON.parse(unfenced.slice(start, end + 1));
}

builder.mutationField("analyzeDispute", (t) =>
  t.field({
    type: DisputeRef,
    args: { issueId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      requireAdmin(ctx);
      const dispute = await ctx.db.dispute.findUnique({
        where: { issueId: args.issueId },
        include: {
          issue: {
            select: {
              id: true,
              title: true,
              description: true,
              category: true,
              requiredSkills: true,
              clientId: true,
              developerId: true,
              messages: {
                select: { id: true, senderId: true, content: true, type: true, createdAt: true },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take: 100,
              },
              submissions: {
                select: { id: true, description: true, pullRequestUrl: true, status: true, submittedAt: true, reviewNotes: true },
                orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
                take: 30,
              },
              testCases: {
                select: { id: true, title: true, description: true, given: true, when: true, then: true, priority: true, isApproved: true },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                take: 40,
              },
            },
          },
        },
      });
      if (!dispute) throw gqlError("Dispute not found", "NOT_FOUND");
      if (dispute.status !== DisputeStatus.OPEN && dispute.status !== DisputeStatus.CHALLENGED) {
        throw gqlError("Only open or challenged disputes can be analyzed", "DISPUTE_NOT_ANALYZABLE");
      }

      const previousStatus = dispute.status;
      const claimed = await ctx.db.dispute.updateMany({
        where: { id: dispute.id, status: previousStatus },
        data: { status: DisputeStatus.ANALYZING },
      });
      if (claimed.count !== 1) throw gqlError("Another administrator is already handling this dispute", "DISPUTE_ALREADY_CHANGING");

      const evidence = {
        task: {
          id: dispute.issue.id,
          title: dispute.issue.title,
          description: dispute.issue.description,
          category: dispute.issue.category,
          requiredSkills: dispute.issue.requiredSkills,
        },
        dispute: { id: dispute.id, reason: dispute.reason, raisedAt: dispute.createdAt.toISOString() },
        messages: [...dispute.issue.messages].reverse().map((message) => ({
          id: message.id,
          participant: message.senderId === dispute.issue.clientId ? "CLIENT" : "DEVELOPER",
          content: message.type === "FILE" ? "[Attachment shared]" : message.content,
          createdAt: message.createdAt.toISOString(),
        })),
        submissions: dispute.issue.submissions.map((submission) => ({
          id: submission.id,
          description: submission.description,
          pullRequestUrl: submission.pullRequestUrl,
          status: submission.status,
          submittedAt: submission.submittedAt.toISOString(),
          reviewNotes: submission.reviewNotes,
        })),
        acceptanceCriteria: dispute.issue.testCases.map((testCase) => ({ ...testCase, priority: testCase.priority })),
      };
      const safeEvidence = scanAndMask(JSON.stringify(evidence)).content;
      const knownEvidenceIds = new Set([
        dispute.id,
        dispute.issue.id,
        ...dispute.issue.messages.map((message) => message.id),
        ...dispute.issue.submissions.map((submission) => submission.id),
        ...dispute.issue.testCases.map((testCase) => testCase.id),
      ]);

      try {
        const completion = await completeAI({
          task: "DEBATE",
          issueId: dispute.issue.id,
          disputeId: dispute.id,
          jsonMode: true,
          maxTokens: 2600,
          messages: [
            {
              role: "system",
              content: "You are an impartial dispute evidence assistant. Assess only the supplied evidence and distinguish facts from claims. The suggestedClientRatio is the percentage of the bounty that should be refunded to the client; the developer share is the remainder. Never treat the task description as proof of completed work. Do not infer facts that are not in evidence. Your recommendation is advisory only; a human administrator makes the decision. Return strict JSON with: summary (string), suggestedClientRatio (number 0-100), confidenceScore (number 0-1), findings (array of {evidenceType: TASK|DISPUTE|MESSAGE|SUBMISSION|TEST_CASE, evidenceId, side: CLIENT|DEVELOPER|NEUTRAL, finding}), missingEvidence (array of strings), reasoning (string). Cite only IDs included in the evidence.",
            },
            { role: "user", content: safeEvidence },
          ],
        });
        const report = DisputeAnalysisSchema.parse(parseModelJson(completion.text));
        const reportWithVerifiedCitations = {
          ...report,
          findings: report.findings.filter((finding) => knownEvidenceIds.has(finding.evidenceId)),
          model: completion.model,
          provider: completion.provider,
          generatedAt: new Date().toISOString(),
        };
        const updated = await ctx.db.dispute.updateMany({
          where: { id: dispute.id, status: DisputeStatus.ANALYZING },
          data: {
            status: previousStatus,
            aiReport: reportWithVerifiedCitations as Prisma.InputJsonValue,
            suggestedRatio: report.suggestedClientRatio,
            aiConfidenceScore: report.confidenceScore,
          },
        });
        if (updated.count !== 1) throw gqlError("Dispute state changed while the model was analyzing it", "DISPUTE_STATE_CHANGED");
        return ctx.db.dispute.findUniqueOrThrow({ where: { id: dispute.id }, include: DISPUTE_INCLUDE });
      } catch (error) {
        await ctx.db.dispute.updateMany({
          where: { id: dispute.id, status: DisputeStatus.ANALYZING },
          data: { status: previousStatus },
        });
        if (error instanceof z.ZodError || error instanceof SyntaxError) {
          throw gqlError("The model returned a report in an unsupported format. Try the analysis again.", "AI_INVALID_RESPONSE");
        }
        if (error instanceof Error && "extensions" in error) throw error;
        throw gqlError(error instanceof Error ? error.message : "AI dispute analysis failed", "AI_UNAVAILABLE");
      }
    },
  }),
);

builder.mutationField("proposeDisputeResolution", (t) =>
  t.fieldWithInput({
    type: DisputeRef,
    typeOptions: { name: "ProposeDisputeResolutionInput" },
    input: {
      issueId: t.input.id({ required: true }),
      clientRatio: t.input.float({ required: true }),
      note: t.input.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const admin = requireAdmin(ctx);
      const input = parseOrThrow(z.object({
        issueId: z.string().min(1),
        clientRatio: z.number().min(0).max(100),
        note: z.string().trim().min(10).max(2000),
      }), {
        issueId: String(args.input.issueId),
        clientRatio: args.input.clientRatio,
        note: args.input.note,
      });
      const dispute = await ctx.db.dispute.findUnique({ where: { issueId: input.issueId }, include: { issue: true } });
      if (!dispute) throw gqlError("Tranh chấp không tồn tại", "NOT_FOUND");
      if (dispute.status !== DisputeStatus.OPEN && dispute.status !== DisputeStatus.CHALLENGED) {
        throw gqlError("Tranh chấp không ở trạng thái có thể đề xuất", "DISPUTE_NOT_PROPOSABLE");
      }
      const proposedAt = new Date();
      return ctx.db.dispute.update({
        where: { id: dispute.id },
        data: {
          status: DisputeStatus.PROPOSED,
          proposedClientRatio: input.clientRatio,
          proposedAt,
          challengeDeadline: new Date(proposedAt.getTime() + 24 * 60 * 60 * 1000),
          resolvedById: admin.id,
          resolutionNote: input.note,
        },
        include: DISPUTE_INCLUDE,
      });
    },
  })
);

builder.mutationField("challengeDisputeResolution", (t) =>
  t.field({
    type: DisputeRef,
    args: { issueId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      const dispute = await ctx.db.dispute.findUnique({ where: { issueId: args.issueId }, include: { issue: true } });
      if (!dispute) throw gqlError("Tranh chấp không tồn tại", "NOT_FOUND");
      if (dispute.issue.clientId !== user.id && dispute.issue.developerId !== user.id) throw gqlError("Chỉ hai bên tham gia mới được phản đối", "FORBIDDEN");
      if (dispute.status !== DisputeStatus.PROPOSED || !dispute.challengeDeadline || dispute.challengeDeadline < new Date()) {
        throw gqlError("Thời hạn phản đối đã hết hoặc chưa có đề xuất", "CHALLENGE_WINDOW_CLOSED");
      }
      return ctx.db.dispute.update({
        where: { id: dispute.id },
        data: { status: DisputeStatus.CHALLENGED, challengedById: user.id, challengedAt: new Date() },
        include: DISPUTE_INCLUDE,
      });
    },
  })
);
