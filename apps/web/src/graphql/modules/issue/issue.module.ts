import { builder } from "../../builder";
import { requireAuth } from "../../context";
import { z } from "zod";
import { IssueCategory, IssueStatus } from "@prisma/client";

// Đăng ký Enums với GraphQL (Pothos)
builder.enumType(IssueCategory, {
  name: "IssueCategory",
});

builder.enumType(IssueStatus, {
  name: "IssueStatus",
});

// Định nghĩa Schema (Model) cho GraphQL
builder.prismaObject("Issue", {
  fields: (t) => ({
    id: t.exposeID("id"),
    title: t.exposeString("title"),
    description: t.exposeString("description"),
    category: t.expose("category", { type: IssueCategory }),
    status: t.expose("status", { type: IssueStatus }),
    // Chuyển Prisma Decimal sang String để tránh mất độ chính xác số học
    bountyAmount: t.string({
      resolve: (issue) => issue.bountyAmount.toString(),
    }),
    tokenId: t.exposeString("tokenId"),
    requiredSkills: t.exposeStringList("requiredSkills"),
    difficulty: t.exposeString("difficulty", { nullable: true }),
    timeEstimate: t.exposeString("timeEstimate", { nullable: true }),
    expiresAt: t.expose("expiresAt", { type: "DateTime", nullable: true }),
    isDraft: t.exposeBoolean("isDraft"),
    clientId: t.exposeString("clientId"),
    developerId: t.exposeString("developerId", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});

// Zod Schema để validate input khi tạo Task
const CreateIssueSchema = z.object({
  title: z.string().min(5).max(100),
  description: z.string().min(10),
  category: z.nativeEnum(IssueCategory),
  bountyAmount: z.number().positive(),
  tokenId: z.string(),
  requiredSkills: z.array(z.string()).default([]),
  difficulty: z.string().optional(),
  timeEstimate: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});

// Zod Schema để validate input khi cập nhật Task
const UpdateIssueSchema = z.object({
  title: z.string().min(5).max(100).optional(),
  description: z.string().min(10).optional(),
  category: z.nativeEnum(IssueCategory).optional(),
  bountyAmount: z.number().positive().optional(),
  tokenId: z.string().optional(),
  requiredSkills: z.array(z.string()).optional(),
  difficulty: z.string().optional(),
  timeEstimate: z.string().optional(),
});

// QUERIES
builder.queryField("issues", (t) =>
  t.prismaField({
    type: ["Issue"],
    args: {
      search: t.arg.string({ required: false }),
      category: t.arg({ type: IssueCategory, required: false }),
      status: t.arg({ type: IssueStatus, required: false }),
      minBounty: t.arg.float({ required: false }),
      maxBounty: t.arg.float({ required: false }),
    },
    resolve: async (query, _root, args, ctx) => {
      const where: any = { isDraft: false };
      
      // Filter logic
      if (args.search) {
        where.OR = [
          { title: { contains: args.search, mode: "insensitive" } },
          { description: { contains: args.search, mode: "insensitive" } },
        ];
      }
      if (args.category) where.category = args.category;
      if (args.status) where.status = args.status;
      if (args.minBounty || args.maxBounty) {
        where.bountyAmount = {
          ...(args.minBounty && { gte: args.minBounty }),
          ...(args.maxBounty && { lte: args.maxBounty }),
        };
      }

      // Lấy danh sách task, mới nhất lên đầu
      return ctx.db.issue.findMany({
        ...query,
        where,
        orderBy: { createdAt: "desc" },
      });
    },
  })
);

builder.queryField("issue", (t) =>
  t.prismaField({
    type: "Issue",
    nullable: true,
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      return ctx.db.issue.findUnique({
        ...query,
        where: { id: String(args.id) },
      });
    },
  })
);

// MUTATIONS post task/ create new issue(protect by requireAuth)
builder.mutationField("createIssue", (t) =>
  t.prismaFieldWithInput({
    type: "Issue",
    input: {
      title: t.input.string({ required: true }),
      description: t.input.string({ required: true }),
      category: t.input.field({ type: IssueCategory, required: true }),
      bountyAmount: t.input.float({ required: true }),
      tokenId: t.input.string({ required: true }),
      requiredSkills: t.input.stringList({ required: false }),
      difficulty: t.input.string({ required: false }),
      timeEstimate: t.input.string({ required: false }),
    },
    resolve: async (query, _root, args, ctx) => {
      //Require Login (Authentication)
      const user = requireAuth(ctx);
      //Mock test
//       const user = {
//   id: "cmt756r1x0001vacloa3be91j",
//   role: "CLIENT",
// }

      //Only Client post issues
      if (user.role !== "CLIENT" && user.role !== "ADMIN") {
        throw new Error("FORBIDDEN: Only Clients can post issues");
      }

      // Validate input với Zod
      const validated = CreateIssueSchema.parse({
        title: args.input.title,
        description: args.input.description,
        category: args.input.category,
        bountyAmount: args.input.bountyAmount,
        tokenId: args.input.tokenId,
        requiredSkills: args.input.requiredSkills ?? [],
        difficulty: args.input.difficulty ?? undefined,
        timeEstimate: args.input.timeEstimate ?? undefined,
      });

      // create Issue in DB
      return ctx.db.issue.create({
        ...query,
        data: {
          title: validated.title,
          description: validated.description,
          category: validated.category,
          bountyAmount: validated.bountyAmount.toString(),
          tokenId: validated.tokenId,
          requiredSkills: validated.requiredSkills,
          difficulty: validated.difficulty,
          timeEstimate: validated.timeEstimate,
          clientId: user.id,
          status: "OPEN",
          isDraft: false,
        },
      });
    },
  })
);

// MUTATION update task (Client only)
builder.mutationField("updateIssue", (t) =>
  t.prismaFieldWithInput({
    type: "Issue",
    input: {
      id: t.input.id({ required: true }),
      title: t.input.string({ required: false }),
      description: t.input.string({ required: false }),
      category: t.input.field({ type: IssueCategory, required: false }),
      bountyAmount: t.input.float({ required: false }),
      tokenId: t.input.string({ required: false }),
      requiredSkills: t.input.stringList({ required: false }),
      difficulty: t.input.string({ required: false }),
      timeEstimate: t.input.string({ required: false }),
    },
    resolve: async (query, _root, args, ctx) => {
      const user = requireAuth(ctx);
      // mock test
  //     const user = {
  // id: "cmt756r1x0001vacloa3be91j",
  // role: "CLIENT",
  //     }
      
      const issue = await ctx.db.issue.findUnique({
        where: { id: String(args.input.id) },
      });

      if (!issue) throw new Error("NOT_FOUND: Issue not found");
      // only the task owner have the right to fix
      if (issue.clientId !== user.id && user.role !== "ADMIN") {
        throw new Error("FORBIDDEN: You do not own this issue");
      }
      
      //Editing is only allowed when the task is open (chưa có ai assign)
      if (issue.status !== "OPEN") {
        throw new Error("BAD_REQUEST: Can only update OPEN issues");
      }

      const validated = UpdateIssueSchema.parse({
        title: args.input.title ?? undefined,
        description: args.input.description ?? undefined,
        category: args.input.category ?? undefined,
        bountyAmount: args.input.bountyAmount ?? undefined,
        tokenId: args.input.tokenId ?? undefined,
        requiredSkills: args.input.requiredSkills ?? undefined,
        difficulty: args.input.difficulty ?? undefined,
        timeEstimate: args.input.timeEstimate ?? undefined,
      });

      return ctx.db.issue.update({
        ...query,
        where: { id: issue.id },
        data: {
          ...(validated.title && { title: validated.title }),
          ...(validated.description && { description: validated.description }),
          ...(validated.category && { category: validated.category }),
          ...(validated.bountyAmount && { bountyAmount: validated.bountyAmount.toString() }),
          ...(validated.tokenId && { tokenId: validated.tokenId }),
          ...(validated.requiredSkills && { requiredSkills: validated.requiredSkills }),
          ...(validated.difficulty && { difficulty: validated.difficulty }),
          ...(validated.timeEstimate && { timeEstimate: validated.timeEstimate }),
        },
      });
    },
  })
);

// MUTATION cancel task (Client only)
builder.mutationField("cancelIssue", (t) =>
  t.prismaField({
    type: "Issue",
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      const user = requireAuth(ctx);
//mock test
  //     const user = {
  // id: "cmt756r1x0001vacloa3be91j",
  // role: "CLIENT",
  //     }
      
      const issue = await ctx.db.issue.findUnique({
        where: { id: String(args.id) },
      });

      if (!issue) throw new Error("NOT_FOUND: Issue not found");
      
      //Only the task owner or Admin can cancel
      if (issue.clientId !== user.id && user.role !== "ADMIN") {
        throw new Error("FORBIDDEN: You do not own this issue");
      }
      
      //Cancellation is not allowed if someone has already accepted the job (IN_PROGRESS)
      if (issue.status !== "OPEN") {
        throw new Error("BAD_REQUEST: Only OPEN issues without assigned developers can be cancelled");
      }

      return ctx.db.issue.update({
        ...query,
        where: { id: issue.id },
        data: {
          status: "CANCELLED",
        },
      });
    },
  })
);
