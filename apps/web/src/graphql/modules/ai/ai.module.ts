import { IssueStatus, TestCasePriority, TestCaseSource } from "@bloody-roar/database";
import type { AILog, Prisma, TestCase as TestCaseModel } from "@bloody-roar/database";
import { z } from "zod";
import { builder } from "../../builder";
import { requireAdmin, requireAuth } from "../../context";
import { gqlError, parseOrThrow } from "../../errors";
import { completeAI } from "../../../ai/model-router";
import { scanAndMask } from "../../../ai/guard/scanner";
import { aiRateLimit } from "../../../lib/rate-limit";

const TestCasePriorityEnum = builder.enumType(TestCasePriority, { name: "TestCasePriority" });
const TestCaseSourceEnum = builder.enumType(TestCaseSource, { name: "TestCaseSource" });

type GraphQLTestCase = Omit<TestCaseModel, "then"> & { bddThen: string };

export const TestCaseRef = builder.objectRef<GraphQLTestCase>("TestCase").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    title: t.exposeString("title"),
    description: t.exposeString("description"),
    given: t.exposeString("given"),
    when: t.exposeString("when"),
    then: t.string({ resolve: (testCase) => testCase.bddThen }),
    isEdgeCase: t.exposeBoolean("isEdgeCase"),
    priority: t.expose("priority", { type: TestCasePriorityEnum }),
    source: t.expose("source", { type: TestCaseSourceEnum, nullable: true }),
    isApproved: t.exposeBoolean("isApproved"),
    clientNotes: t.exposeString("clientNotes", { nullable: true }),
    issueId: t.exposeString("issueId"),
    createdAt: t.string({ resolve: (testCase) => testCase.createdAt.toISOString() }),
    updatedAt: t.string({ resolve: (testCase) => testCase.updatedAt.toISOString() }),
  }),
});

function toGraphqlTestCase(testCase: TestCaseModel): GraphQLTestCase {
  const { then, ...fields } = testCase;
  return { ...fields, bddThen: then };
}

const GeneratedCaseSchema = z.object({
  title: z.string().trim().min(4).max(160),
  description: z.string().trim().min(8).max(1000),
  given: z.string().trim().min(4).max(1000),
  when: z.string().trim().min(4).max(1000),
  then: z.string().trim().min(4).max(1000),
  priority: z.preprocess(
    (value) => typeof value === "string" ? value.toUpperCase() : value,
    z.enum([TestCasePriority.CRITICAL, TestCasePriority.NORMAL, TestCasePriority.LOW]),
  ),
  isEdgeCase: z.boolean().default(false),
});

const GeneratedCasesSchema = z.object({ testCases: z.array(GeneratedCaseSchema).min(3).max(12) });

function parseAIJson(text: string): unknown {
  const unfenced = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("The model returned invalid JSON.");
  return JSON.parse(unfenced.slice(start, end + 1));
}

builder.queryField("testCases", (t) =>
  t.field({
    type: [TestCaseRef],
    args: { issueId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const issue = await ctx.db.issue.findUnique({
        where: { id: args.issueId },
        select: { clientId: true, isDraft: true },
      });
      if (!issue) throw gqlError("Task not found", "NOT_FOUND");
      if (issue.isDraft && ctx.user?.id !== issue.clientId) throw gqlError("Draft acceptance criteria are private", "FORBIDDEN");

      const testCases = await ctx.db.testCase.findMany({
        where: {
          issueId: args.issueId,
          ...(ctx.user?.id === issue.clientId ? {} : { isApproved: true }),
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      return testCases.map(toGraphqlTestCase);
    },
  }),
);

builder.mutationField("generateTestCases", (t) =>
  t.field({
    type: [TestCaseRef],
    args: { issueId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      aiRateLimit(user);

      const issue = await ctx.db.issue.findUnique({
        where: { id: args.issueId },
        select: { id: true, clientId: true, status: true, title: true, description: true, category: true, requiredSkills: true, githubRepo: true },
      });
      if (!issue) throw gqlError("Task not found", "NOT_FOUND");
      if (issue.clientId !== user.id) throw gqlError("Only the task owner can generate acceptance criteria", "FORBIDDEN");
      if (issue.status !== IssueStatus.OPEN) throw gqlError("Acceptance criteria cannot be changed after a developer is selected", "ISSUE_NOT_EDITABLE");

      const safeTask = scanAndMask(JSON.stringify({
        title: issue.title,
        description: issue.description,
        category: issue.category,
        requiredSkills: issue.requiredSkills,
        githubRepo: issue.githubRepo,
      })).content;

      try {
        const completion = await completeAI({
          task: "TESTGEN",
          issueId: issue.id,
          jsonMode: true,
          maxTokens: 2200,
          messages: [
            {
              role: "system",
              content: "Act as an experienced software QA engineer. Generate 5 to 10 concrete acceptance tests in BDD format. Cover a normal success path, validation failures, edge cases, and relevant security behaviour. Do not invent requirements that are absent from the task. Return strict JSON only: {\"testCases\":[{\"title\":string,\"description\":string,\"given\":string,\"when\":string,\"then\":string,\"priority\":\"CRITICAL\"|\"NORMAL\"|\"LOW\",\"isEdgeCase\":boolean}]}. These are drafts for client review; do not claim that tests have run.",
            },
            { role: "user", content: safeTask },
          ],
        });
        const generated = GeneratedCasesSchema.parse(parseAIJson(completion.text));
        const cases = await ctx.db.$transaction(async (tx) => {
          await lockCriteriaIssue(tx, issue.id, user.id);
          await tx.testCase.deleteMany({ where: { issueId: issue.id, source: TestCaseSource.AI, isApproved: false } });
          await tx.testCase.createMany({
            data: generated.testCases.map((testCase) => ({
              ...testCase,
              source: TestCaseSource.AI,
              issueId: issue.id,
              isApproved: false,
            })),
          });
          return tx.testCase.findMany({
            where: { issueId: issue.id },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          });
        });
        return cases.map(toGraphqlTestCase);
      } catch (error) {
        if (error && typeof error === "object" && "extensions" in error) throw error;
        if (error instanceof z.ZodError || error instanceof SyntaxError) {
          throw gqlError("The AI returned acceptance criteria in an unsupported format. Try again.", "AI_INVALID_RESPONSE");
        }
        throw gqlError(error instanceof Error ? error.message : "AI test generation failed", "AI_UNAVAILABLE");
      }
    },
  }),
);

// Lock the issue before editing criteria so selection cannot commit stale terms.
async function lockCriteriaIssue(tx: Prisma.TransactionClient, issueId: string, userId: string) {
  await tx.$queryRaw`SELECT id FROM issues WHERE id = ${issueId} FOR UPDATE`;
  const issue = await tx.issue.findUnique({ where: { id: issueId }, select: { clientId: true, status: true } });
  if (!issue) throw gqlError("Task not found", "NOT_FOUND");
  if (issue.clientId !== userId) throw gqlError("Only the task owner can review acceptance criteria", "FORBIDDEN");
  const active = await tx.fundingReservation.findFirst({ where: { issueId, status: { in: ["AWAITING_FUNDING", "FUNDED"] } }, select: { id: true } });
  if (issue.status !== IssueStatus.OPEN || active) throw gqlError("Acceptance criteria are locked after assignment", "ISSUE_NOT_EDITABLE");
}

const UpdateTestCaseSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(4).max(160).optional(),
  description: z.string().trim().min(8).max(1000).optional(),
  given: z.string().trim().min(4).max(1000).optional(),
  when: z.string().trim().min(4).max(1000).optional(),
  then: z.string().trim().min(4).max(1000).optional(),
  priority: z.nativeEnum(TestCasePriority).optional(),
  isEdgeCase: z.boolean().optional(),
  clientNotes: z.string().trim().max(1000).nullable().optional(),
  isApproved: z.boolean().optional(),
});

builder.mutationField("updateTestCase", (t) =>
  t.fieldWithInput({
    type: TestCaseRef,
    typeOptions: { name: "UpdateTestCaseInput" },
    input: {
      id: t.input.id({ required: true }),
      title: t.input.string({ required: false }),
      description: t.input.string({ required: false }),
      given: t.input.string({ required: false }),
      when: t.input.string({ required: false }),
      then: t.input.string({ required: false }),
      priority: t.input.field({ type: TestCasePriorityEnum, required: false }),
      isEdgeCase: t.input.boolean({ required: false }),
      clientNotes: t.input.string({ required: false }),
      isApproved: t.input.boolean({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      const input = parseOrThrow(UpdateTestCaseSchema, Object.fromEntries(Object.entries(args.input).filter(([, value]) => value !== null && value !== undefined)));
      const updatedTestCase = await ctx.db.$transaction(async (tx) => {
        const initial = await tx.testCase.findUnique({ where: { id: input.id }, select: { issueId: true } });
        if (!initial) throw gqlError("Acceptance criterion not found", "NOT_FOUND");
        await lockCriteriaIssue(tx, initial.issueId, user.id);
        const testCase = await tx.testCase.findUnique({ where: { id: input.id } });
        if (!testCase || testCase.issueId !== initial.issueId) throw gqlError("Acceptance criterion not found", "NOT_FOUND");
        const changes = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "id"));
        const editsCriteria = ["title", "description", "given", "when", "then", "priority", "isEdgeCase"].some((key) => key in input);
        const approved = input.isApproved ?? (editsCriteria ? false : testCase.isApproved);
        const termsChanged = approved !== testCase.isApproved || (testCase.isApproved && editsCriteria);
        const updated = await tx.testCase.update({ where: { id: testCase.id }, data: { ...changes, isApproved: approved } as Prisma.TestCaseUpdateInput });
        if (termsChanged) await tx.issue.update({ where: { id: initial.issueId }, data: { termsVersion: { increment: 1 } } });
        return updated;
      });
      return toGraphqlTestCase(updatedTestCase);
    },
  }),
);

const CreateTestCaseSchema = z.object({
  issueId: z.string().min(1),
  title: z.string().trim().min(4).max(160),
  description: z.string().trim().min(8).max(1000),
  given: z.string().trim().min(4).max(1000),
  when: z.string().trim().min(4).max(1000),
  then: z.string().trim().min(4).max(1000),
  priority: z.nativeEnum(TestCasePriority).default(TestCasePriority.NORMAL),
  isEdgeCase: z.boolean().default(false),
});

// Manual criteria start unapproved: the client must approve them before the terms hash is taken.
builder.mutationField("createTestCase", (t) =>
  t.fieldWithInput({
    type: TestCaseRef,
    typeOptions: { name: "CreateTestCaseInput" },
    input: {
      issueId: t.input.string({ required: true }),
      title: t.input.string({ required: true }),
      description: t.input.string({ required: true }),
      given: t.input.string({ required: true }),
      when: t.input.string({ required: true }),
      then: t.input.string({ required: true }),
      priority: t.input.field({ type: TestCasePriorityEnum, required: false }),
      isEdgeCase: t.input.boolean({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      const { issueId, ...fields } = parseOrThrow(CreateTestCaseSchema, Object.fromEntries(Object.entries(args.input).filter(([, value]) => value !== null && value !== undefined)));
      const testCase = await ctx.db.$transaction(async (tx) => {
        await lockCriteriaIssue(tx, issueId, user.id);
        return tx.testCase.create({ data: { ...fields, issueId, source: TestCaseSource.MANUAL, isApproved: false } });
      });
      return toGraphqlTestCase(testCase);
    },
  }),
);

builder.mutationField("deleteTestCase", (t) =>
  t.boolean({
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      return ctx.db.$transaction(async (tx) => {
        const initial = await tx.testCase.findUnique({ where: { id: String(args.id) }, select: { issueId: true } });
        if (!initial) throw gqlError("Acceptance criterion not found", "NOT_FOUND");
        await lockCriteriaIssue(tx, initial.issueId, user.id);
        const testCase = await tx.testCase.findUnique({ where: { id: String(args.id) } });
        if (!testCase || testCase.issueId !== initial.issueId) throw gqlError("Acceptance criterion not found", "NOT_FOUND");
        await tx.testCase.delete({ where: { id: testCase.id } });
        if (testCase.isApproved) await tx.issue.update({ where: { id: initial.issueId }, data: { termsVersion: { increment: 1 } } });
        return true;
      });
    },
  }),
);

// Hashes and token counts only: prompt and response text are never stored, so they never reach this query.
const AILogRef = builder.objectRef<AILog>("AILog").implement({
  fields: (t) => ({
    id: t.id({ resolve: (log) => log.id }),
    task: t.string({ resolve: (log) => log.task }),
    model: t.string({ resolve: (log) => log.model }),
    provider: t.string({ resolve: (log) => log.provider }),
    status: t.string({ resolve: (log) => log.status }),
    issueId: t.string({ nullable: true, resolve: (log) => log.issueId }),
    disputeId: t.string({ nullable: true, resolve: (log) => log.disputeId }),
    latencyMs: t.int({ nullable: true, resolve: (log) => log.latencyMs }),
    promptTokens: t.int({ nullable: true, resolve: (log) => log.promptTokens }),
    completionTokens: t.int({ nullable: true, resolve: (log) => log.completionTokens }),
    costUsd: t.string({ nullable: true, resolve: (log) => log.costUsd?.toString() ?? null }),
    errorMessage: t.string({ nullable: true, resolve: (log) => log.errorMessage }),
    createdAt: t.string({ resolve: (log) => log.createdAt.toISOString() }),
  }),
});

builder.queryField("aiLogs", (t) =>
  t.field({
    type: [AILogRef],
    args: {
      task: t.arg.string({ required: false }),
      after: t.arg.id({ required: false }),
      first: t.arg.int({ required: false }),
    },
    resolve: (_root, args, ctx) => {
      requireAdmin(ctx);
      return ctx.db.aILog.findMany({
        where: args.task ? { task: args.task } : {},
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: Math.min(Math.max(args.first ?? 50, 1), 100),
        ...(args.after ? { cursor: { id: String(args.after) }, skip: 1 } : {}),
      });
    },
  }),
);
