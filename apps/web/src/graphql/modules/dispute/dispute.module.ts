import { DisputeStatus } from "@bloody-roar/database";
import type { Prisma } from "@bloody-roar/database";
import { z } from "zod";
import { builder } from "../../builder";
import { requireAdmin, requireAuth } from "../../context";
import { gqlError } from "../../errors";
import { UserRef } from "../user/user.module";
import { completeAI, type AIRouterDependencies } from "../../../ai/model-router";
import { scanAndMask } from "../../../ai/guard/scanner";
import { aiRateLimit } from "../../../lib/rate-limit";

const DisputeStatusEnum = builder.enumType(DisputeStatus, { name: "DisputeStatus" });
const DISPUTE_INCLUDE = { raisedBy: true, resolvedBy: true } satisfies Prisma.DisputeInclude;

export const DisputeRef = builder.prismaObject("Dispute", {
  include: DISPUTE_INCLUDE,
  fields: (t) => ({
    id: t.exposeID("id"),
    issueId: t.exposeString("issueId"),
    status: t.expose("status", { type: DisputeStatusEnum }),
    reason: t.exposeString("reason"),
    evidenceManifestHash: t.exposeString("evidenceManifestHash", { nullable: true }),
    counterpartyEvidenceHash: t.exposeString("counterpartyEvidenceHash", { nullable: true }),
    initialDecisionHash: t.exposeString("initialDecisionHash", { nullable: true }),
    finalDecisionHash: t.exposeString("finalDecisionHash", { nullable: true }),
    evidenceResponseDeadline: t.string({
      nullable: true,
      resolve: (d) => d.evidenceResponseDeadline?.toISOString() ?? null,
    }),
    arbiterTimeoutAt: t.string({
      nullable: true,
      resolve: (d) => d.arbiterTimeoutAt?.toISOString() ?? null,
    }),
    noticeDeadline: t.string({
      nullable: true,
      resolve: (d) => d.noticeDeadline?.toISOString() ?? null,
    }),
    // Only the arbiter reads the advisory analysis; the parties see the ruling, not the reasoning behind it.
    aiReport: t.string({
      nullable: true,
      resolve: (dispute, _args, ctx) =>
        ctx.user?.role !== "ADMIN" || dispute.aiReport == null ? null : JSON.stringify(dispute.aiReport),
    }),
    aiConfidenceScore: t.exposeFloat("aiConfidenceScore", { nullable: true }),
    aiStatus: t.exposeString("aiStatus", { nullable: true }),
    suggestedClientBps: t.exposeInt("suggestedClientBps", { nullable: true }),
    proposedClientBps: t.exposeInt("proposedClientBps", { nullable: true }),
    finalClientBps: t.exposeInt("finalClientBps", { nullable: true }),
    proposedAt: t.string({
      nullable: true,
      resolve: (dispute) => dispute.proposedAt?.toISOString() ?? null,
    }),
    challengeDeadline: t.string({
      nullable: true,
      resolve: (dispute) => dispute.challengeDeadline?.toISOString() ?? null,
    }),
    challengedAt: t.string({
      nullable: true,
      resolve: (dispute) => dispute.challengedAt?.toISOString() ?? null,
    }),
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
      const issue = await ctx.db.issue.findUnique({
        where: { id: args.issueId },
        select: { clientId: true, developerId: true },
      });
      if (!issue) return null;
      const isAdmin = user.role === "ADMIN";
      if (!isAdmin && issue.clientId !== user.id && issue.developerId !== user.id)
        throw gqlError("Bạn không được phép xem tranh chấp này", "FORBIDDEN");
      return ctx.db.dispute.findUnique({
        ...query,
        where: { issueId: args.issueId },
        include: DISPUTE_INCLUDE,
      });
    },
  }),
  adminDisputes: t.prismaField({
    type: [DisputeRef],
    args: {
      first: t.arg.int({ required: false }),
      after: t.arg.id({ required: false }),
    },
    resolve: (query, _root, args, ctx) => {
      requireAdmin(ctx);
      return ctx.db.dispute.findMany({
        ...query,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: Math.min(Math.max(args.first ?? 50, 1), 100),
        ...(args.after ? { cursor: { id: String(args.after) }, skip: 1 } : {}),
        include: DISPUTE_INCLUDE,
      });
    },
  }),
}));

const DisputeAnalysisSchema = z.object({
  summary: z.string().trim().min(30).max(2500),
  suggestedClientBps: z.number().int().min(0).max(10000),
  confidenceScore: z.number().min(0).max(1),
  findings: z
    .array(
      z.object({
        evidenceType: z.enum(["TASK", "DISPUTE", "MESSAGE", "SUBMISSION", "TEST_CASE"]),
        evidenceId: z.string().min(1).max(100),
        side: z.enum(["CLIENT", "DEVELOPER", "NEUTRAL"]),
        finding: z.string().trim().min(10).max(800),
      }),
    )
    .max(20),
  missingEvidence: z.array(z.string().trim().min(4).max(400)).max(10),
  reasoning: z.string().trim().min(40).max(4000),
});

function parseModelJson(text: string) {
  const unfenced = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
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
      aiRateLimit(requireAdmin(ctx));
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
                select: {
                  id: true,
                  description: true,
                  pullRequestUrl: true,
                  status: true,
                  submittedAt: true,
                  reviewNotes: true,
                },
                orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
                take: 30,
              },
              testCases: {
                select: {
                  id: true,
                  title: true,
                  description: true,
                  given: true,
                  when: true,
                  then: true,
                  priority: true,
                  isApproved: true,
                },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                take: 40,
              },
            },
          },
        },
      });
      if (!dispute) throw gqlError("Dispute not found", "NOT_FOUND");
      const startedAt = new Date();
      const staleBefore = new Date(startedAt.getTime() - 5 * 60_000);
      const claimed = await ctx.db.dispute.updateMany({
        where: { id: dispute.id, OR: [{ aiStatus: null }, { aiStatus: { not: "ANALYZING" } }, { aiStatus: "ANALYZING", OR: [{ aiStartedAt: null }, { aiStartedAt: { lte: staleBefore } }] }] },
        data: { aiStatus: "ANALYZING", aiStartedAt: startedAt },
      });
      if (claimed.count !== 1)
        throw gqlError(
          "Another administrator is already handling this dispute",
          "DISPUTE_ALREADY_CHANGING",
        );

      const evidence = {
        task: {
          id: dispute.issue.id,
          title: dispute.issue.title,
          description: dispute.issue.description,
          category: dispute.issue.category,
          requiredSkills: dispute.issue.requiredSkills,
        },
        dispute: {
          id: dispute.id,
          reason: dispute.reason,
          raisedAt: dispute.createdAt.toISOString(),
        },
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
        acceptanceCriteria: dispute.issue.testCases.map((testCase) => ({
          ...testCase,
          priority: testCase.priority,
        })),
      };
      const safeEvidence = scanAndMask(JSON.stringify(evidence)).content;
      const knownEvidenceIds = new Set([
        dispute.id,
        dispute.issue.id,
        ...dispute.issue.messages.map((message) => message.id),
        ...dispute.issue.submissions.map((submission) => submission.id),
        ...dispute.issue.testCases.map((testCase) => testCase.id),
      ]);

      const auditEvents: Parameters<NonNullable<AIRouterDependencies["audit"]>>[0][] = [];
      let analysisSucceeded = false;
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
              content:
                "You are an impartial dispute evidence assistant. Assess only the supplied evidence and distinguish facts from claims. The suggestedClientBps is the client share in basis points from 0 to 10000; the developer share is the remainder. Never treat the task description as proof of completed work. Do not infer facts that are not in evidence. Your recommendation is advisory only; a human administrator makes the decision. Return strict JSON with: summary (string), suggestedClientBps (integer 0-10000), confidenceScore (number 0-1), findings (array of {evidenceType: TASK|DISPUTE|MESSAGE|SUBMISSION|TEST_CASE, evidenceId, side: CLIENT|DEVELOPER|NEUTRAL, finding}), missingEvidence (array of strings), reasoning (string). Cite only IDs included in the evidence.",
            },
            { role: "user", content: safeEvidence },
          ],
        }, { audit: async (event) => { auditEvents.push(event); } });
        const report = DisputeAnalysisSchema.parse(parseModelJson(completion.text));
        const reportWithVerifiedCitations = {
          ...report,
          findings: report.findings.filter((finding) => knownEvidenceIds.has(finding.evidenceId)),
          model: completion.model,
          provider: completion.provider,
          generatedAt: new Date().toISOString(),
        };
        const updated = await ctx.db.dispute.updateMany({
          where: { id: dispute.id, aiStatus: "ANALYZING", aiStartedAt: startedAt },
          data: {
            aiStatus: "COMPLETED",
            aiReport: reportWithVerifiedCitations as Prisma.InputJsonValue,
            suggestedClientBps: report.suggestedClientBps,
            aiStartedAt: null,
            aiConfidenceScore: report.confidenceScore,
          },
        });
        if (updated.count !== 1)
          throw gqlError(
            "Dispute state changed while the model was analyzing it",
            "DISPUTE_STATE_CHANGED",
          );
        analysisSucceeded = true;
        return await ctx.db.dispute.findUniqueOrThrow({
          where: { id: dispute.id },
          include: DISPUTE_INCLUDE,
        });
      } catch (error) {
        await ctx.db.dispute.updateMany({
          where: { id: dispute.id, aiStatus: "ANALYZING", aiStartedAt: startedAt },
          data: { aiStatus: "FAILED", aiStartedAt: null },
        });
        if (error instanceof z.ZodError || error instanceof SyntaxError) {
          throw gqlError(
            "The model returned a report in an unsupported format. Try the analysis again.",
            "AI_INVALID_RESPONSE",
          );
        }
        if (error instanceof Error && "extensions" in error) throw error;
        throw gqlError(
          error instanceof Error ? error.message : "AI dispute analysis failed",
          "AI_UNAVAILABLE",
        );
      } finally {
        const audit = auditEvents.at(-1);
        await ctx.db.aILog.create({ data: {
          task: "DEBATE", issueId: dispute.issue.id, disputeId: dispute.id,
          model: audit?.model ?? "unknown", provider: audit?.provider ?? "unknown",
          latencyMs: Date.now() - startedAt.getTime(), promptTokens: audit?.promptTokens ?? null, completionTokens: audit?.completionTokens ?? null,
          inputHash: audit?.inputHash ?? null, outputHash: audit?.outputHash ?? null,
          status: analysisSucceeded ? (audit?.status === "FALLBACK" ? "FALLBACK" : "SUCCESS") : "ERROR",
        } });
      }
    },
  }),
);

