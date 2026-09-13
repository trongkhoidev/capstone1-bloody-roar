import { IssueStatus, TestCasePriority, TestCaseSource, UserRole } from "@bloody-roar/database";
import type { Prisma } from "@bloody-roar/database";
import { z } from "zod";
import { builder } from "../../builder";
import { requireAuth } from "../../context";
import { gqlError, parseOrThrow } from "../../errors";
import { completeAI } from "../../../ai/model-router";
import { scanAndMask } from "../../../ai/guard/scanner";

const TestCasePriorityEnum = builder.enumType(TestCasePriority, { name: "TestCasePriority" });
const TestCaseSourceEnum = builder.enumType(TestCaseSource, { name: "TestCaseSource" });

export const TestCaseRef = builder.prismaObject("TestCase", {
  fields: (t) => ({
    id: t.exposeID("id"),
    title: t.exposeString("title"),
    description: t.exposeString("description"),
    given: t.exposeString("given"),
    when: t.exposeString("when"),
    then: t.exposeString("then"),
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
  t.prismaField({
    type: [TestCaseRef],
    args: { issueId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      const issue = await ctx.db.issue.findUnique({
        where: { id: args.issueId },
        select: { clientId: true, isDraft: true },
      });
      if (!issue) throw gqlError("Task not found", "NOT_FOUND");
      if (issue.isDraft && ctx.user?.id !== issue.clientId) throw gqlError("Draft acceptance criteria are private", "FORBIDDEN");

      return ctx.db.testCase.findMany({
        ...query,
        where: {
          issueId: args.issueId,
          ...(ctx.user?.id === issue.clientId ? {} : { isApproved: true }),
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
    },
  }),
);

builder.mutationField("generateTestCases", (t) =>
  t.field({
    type: [TestCaseRef],
    args: { issueId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      if (user.role !== UserRole.CLIENT) throw gqlError("Only client accounts can generate acceptance criteria", "CLIENT_ROLE_REQUIRED");

      const issue = await ctx.db.issue.findUnique({
        where: { id: args.issueId },
        select: { id: true, clientId: true, status: true, title: true, description: true, category: true, requiredSkills: true },
      });
      if (!issue) throw gqlError("Task not found", "NOT_FOUND");
      if (issue.clientId !== user.id) throw gqlError("Only the task owner can generate acceptance criteria", "FORBIDDEN");
      if (issue.status !== IssueStatus.OPEN) throw gqlError("Acceptance criteria cannot be changed after a developer is selected", "ISSUE_NOT_EDITABLE");

      const safeTask = scanAndMask(JSON.stringify({
        title: issue.title,
        description: issue.description,
        category: issue.category,
        requiredSkills: issue.requiredSkills,
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
        return cases;
      } catch (error) {
        if (error instanceof z.ZodError || error instanceof SyntaxError) {
          throw gqlError("The AI returned acceptance criteria in an unsupported format. Try again.", "AI_INVALID_RESPONSE");
        }
        throw gqlError(error instanceof Error ? error.message : "AI test generation failed", "AI_UNAVAILABLE");
      }
    },
  }),
);

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
      const testCase = await ctx.db.testCase.findUnique({ where: { id: input.id }, include: { issue: { select: { clientId: true, status: true } } } });
      if (!testCase) throw gqlError("Acceptance criterion not found", "NOT_FOUND");
      if (testCase.issue.clientId !== user.id) throw gqlError("Only the task owner can review acceptance criteria", "FORBIDDEN");
      if (testCase.issue.status !== IssueStatus.OPEN) throw gqlError("Acceptance criteria are locked after assignment", "ISSUE_NOT_EDITABLE");

      const changes = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "id"));
      const editsCriteria = ["title", "description", "given", "when", "then", "priority", "isEdgeCase"].some((key) => key in input);
      return ctx.db.testCase.update({
        where: { id: testCase.id },
        data: {
          ...changes,
          ...(editsCriteria && input.isApproved === undefined ? { isApproved: false } : {}),
        } as Prisma.TestCaseUpdateInput,
      });
    },
  }),
);
