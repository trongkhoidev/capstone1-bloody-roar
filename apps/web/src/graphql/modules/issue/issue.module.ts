// apps/web/src/graphql/modules/issue/issue.module.ts
// Issue / Bounty module — Homepage backend (B-1 · B-2 · B-3)
// - issues(query): filter + sort + cursor pagination
// - issue(id): detail (client + token + applicationCount)
// - createIssue(input): post a new bounty (auth required)

import { builder } from "../../builder";
import { requireAuth } from "../../context";
import { gqlError, parseOrThrow } from "../../errors";
import type { Prisma } from "@bloody-roar/database";
import { IssueCategory, IssueStatus, UserRole } from "@bloody-roar/database";
import { UserRef } from "../user/user.module";
import { AttachmentRef } from "../chat/chat.module";
import { z } from "zod";
import {
  ISSUE_CATEGORIES,
  ISSUE_STATUSES,
  ISSUE_SORT_BY,
  ISSUE_DIFFICULTY,
  BOUNTY_MIN_AMOUNT,
  BOUNTY_MAX_AMOUNT,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "@bloody-roar/shared";

// ---------------------------------------------------------------------------
// GraphQL enums (map từ Prisma enum / shared constants)
// ---------------------------------------------------------------------------

const IssueCategoryEnum = builder.enumType(IssueCategory, {
  name: "IssueCategory",
});

const IssueStatusEnum = builder.enumType(IssueStatus, {
  name: "IssueStatus",
});

const IssueSortByEnum = builder.enumType("IssueSortBy", {
  values: ISSUE_SORT_BY,
});

const SortOrderEnum = builder.enumType("SortOrder", {
  values: ["ASC", "DESC"] as const,
});

// ---------------------------------------------------------------------------
// Token object — bounty currency
// ---------------------------------------------------------------------------

const TokenRef = builder.prismaObject("Token", {
  description: "Whitelisted ERC-20 token used for bounties",
  fields: (t) => ({
    id: t.exposeID("id"),
    symbol: t.exposeString("symbol"),
    name: t.exposeString("name"),
    address: t.exposeString("address"),
    decimals: t.exposeInt("decimals"),
    chainId: t.exposeInt("chainId"),
    isActive: t.exposeBoolean("isActive"),
    isNative: t.exposeBoolean("isNative"),
    logoUrl: t.exposeString("logoUrl", { nullable: true }),
  }),
});

// ---------------------------------------------------------------------------
// Issue object
// ---------------------------------------------------------------------------

/** Include dùng chung cho mọi query Issue (relations + count) */
export const ISSUE_INCLUDE = {
  token: true,
  client: true,
  developer: true,
  attachments: { where: { fileMime: { startsWith: "image/" } } },
  _count: { select: { applications: true } },
} satisfies Prisma.IssueInclude;

/** Shape của 1 dòng Issue sau khi include relations */
type IssueNode = Prisma.IssueGetPayload<{ include: typeof ISSUE_INCLUDE }>;

export const IssueRef = builder.prismaObject("Issue", {
  description: "Bounty task posted by a client",
  include: ISSUE_INCLUDE,
  fields: (t) => ({
    id: t.exposeID("id"),
    title: t.exposeString("title"),
    description: t.exposeString("description"),
    category: t.expose("category", { type: IssueCategoryEnum }),
    status: t.expose("status", { type: IssueStatusEnum }),
    bountyAmount: t.float({
      description: "Bounty in human-readable token units",
      resolve: (issue) => issue.bountyAmount.toNumber(),
    }),
    requiredSkills: t.exposeStringList("requiredSkills"),
    difficulty: t.exposeString("difficulty", { nullable: true }),
    timeEstimate: t.exposeString("timeEstimate", { nullable: true }),
    viewCount: t.exposeInt("viewCount"),
    clientId: t.exposeString("clientId"),
    developerId: t.exposeString("developerId", { nullable: true }),
    isDraft: t.exposeBoolean("isDraft"),
    githubRepo: t.exposeString("githubRepo", { nullable: true }),
    expiresAt: t.string({
      nullable: true,
      description: "ISO 8601",
      resolve: (issue) => issue.expiresAt?.toISOString() ?? null,
    }),
    createdAt: t.string({
      description: "ISO 8601",
      resolve: (issue) => issue.createdAt.toISOString(),
    }),
    updatedAt: t.string({
      description: "ISO 8601",
      resolve: (issue) => issue.updatedAt.toISOString(),
    }),
    // Relations (luôn include sẵn — include khai báo ở type level)
    token: t.field({
      type: TokenRef,
      description: "Bounty currency",
      resolve: (issue) => issue.token,
    }),
    client: t.field({
      type: UserRef,
      description: "Task owner",
      resolve: (issue) => issue.client,
    }),
    developer: t.field({
      type: UserRef,
      nullable: true,
      description: "Assigned developer",
      resolve: (issue) => issue.developer,
    }),
    applicationCount: t.int({
      description: "Number of applications",
      select: { _count: { select: { applications: true } } },
      resolve: (issue) => issue._count.applications,
    }),
    attachments: t.field({
      type: [AttachmentRef],
      description: "Public image attachments used as bounty previews",
      resolve: (issue) => issue.attachments,
    }),
  }),
});

// ---------------------------------------------------------------------------
// Cursor pagination helpers + Connection types
// ---------------------------------------------------------------------------

function encodeCursor(id: string): string {
  return Buffer.from(id, "utf8").toString("base64");
}

function decodeCursor(cursor: string): string {
  const id = Buffer.from(cursor, "base64").toString("utf8");
  if (!id) throw gqlError("Cursor không hợp lệ", "INVALID_CURSOR");
  return id;
}

type IssueEdgeShape = { node: IssueNode; cursor: string };

type PageInfoShape = {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor: string | null;
  endCursor: string | null;
};

type IssueConnectionShape = {
  edges: IssueEdgeShape[];
  pageInfo: PageInfoShape;
  totalCount: number;
};

const IssueEdgeRef = builder.objectRef<IssueEdgeShape>("IssueEdge").implement({
  description: "Edge trong connection issues",
  fields: (t) => ({
    node: t.field({ type: IssueRef, resolve: (edge) => edge.node }),
    cursor: t.exposeString("cursor"),
  }),
});

const PageInfoRef = builder.objectRef<PageInfoShape>("PageInfo").implement({
  description: "Pagination metadata",
  fields: (t) => ({
    hasNextPage: t.exposeBoolean("hasNextPage"),
    hasPreviousPage: t.exposeBoolean("hasPreviousPage"),
    startCursor: t.exposeString("startCursor", { nullable: true }),
    endCursor: t.exposeString("endCursor", { nullable: true }),
  }),
});

const IssueConnectionRef =
  builder.objectRef<IssueConnectionShape>("IssueConnection").implement({
    description: "Connection issues với cursor pagination",
    fields: (t) => ({
      edges: t.field({
        type: [IssueEdgeRef],
        resolve: (conn) => conn.edges,
      }),
      pageInfo: t.field({ type: PageInfoRef, resolve: (conn) => conn.pageInfo }),
      totalCount: t.exposeInt("totalCount"),
    }),
  });

type MarketplaceStats = {
  openBounties: number;
  bountyPool: Array<{ symbol: string; amount: number }>;
  activeHunters: number;
};

const MarketplaceTokenAmountRef = builder.objectRef<{ symbol: string; amount: number }>("MarketplaceTokenAmount").implement({
  fields: (t) => ({
    symbol: t.exposeString("symbol"),
    amount: t.exposeFloat("amount"),
  }),
});

const MarketplaceStatsRef = builder.objectRef<MarketplaceStats>("MarketplaceStats").implement({
  fields: (t) => ({
    openBounties: t.exposeInt("openBounties"),
    bountyPool: t.field({ type: [MarketplaceTokenAmountRef], resolve: (stats) => stats.bountyPool }),
    activeHunters: t.exposeInt("activeHunters"),
  }),
});

builder.queryField("marketplaceStats", (t) =>
  t.field({
    type: MarketplaceStatsRef,
    resolve: async (_root, _args, ctx) => {
      const where = { status: IssueStatus.OPEN, isDraft: false };
      const [openBounties, bountyByToken, hunters] = await Promise.all([
        ctx.db.issue.count({ where }),
        ctx.db.issue.groupBy({ by: ["tokenId"], where, _sum: { bountyAmount: true } }),
        ctx.db.application.findMany({
          where: { issue: { status: IssueStatus.OPEN, isDraft: false } },
          distinct: ["developerId"],
          select: { developerId: true },
        }),
      ]);
      const tokens = await ctx.db.token.findMany({
        where: { id: { in: bountyByToken.map((row) => row.tokenId) } },
        select: { id: true, symbol: true },
      });
      const symbolById = new Map(tokens.map((token) => [token.id, token.symbol]));
      return {
        openBounties,
        bountyPool: bountyByToken.flatMap((row) => {
          const symbol = symbolById.get(row.tokenId);
          return symbol && row._sum.bountyAmount
            ? [{ symbol, amount: row._sum.bountyAmount.toNumber() }]
            : [];
        }),
        activeHunters: hunters.length,
      };
    },
  })
);

// ---------------------------------------------------------------------------
// Zod validation
// ---------------------------------------------------------------------------

const IssuesQuerySchema = z.object({
  first: z.number().int().min(1).max(MAX_PAGE_SIZE).nullish(),
  // Chuỗi rỗng = bỏ qua filter (FE xoá ô search không bị lỗi validate)
  after: z.string().max(256).nullish(),
  category: z.enum(ISSUE_CATEGORIES).nullish(),
  status: z.enum(ISSUE_STATUSES).nullish(),
  bountyMin: z.number().positive().nullish(),
  bountyMax: z.number().positive().nullish(),
  skill: z.string().max(40).nullish(),
  search: z.string().max(100).nullish(),
  sortBy: z.enum(ISSUE_SORT_BY).nullish(),
  sortOrder: z.enum(["ASC", "DESC"]).nullish(),
});

const CreateIssueSchema = z.object({
  title: z.string().min(10).max(120),
  description: z.string().min(30).max(5000),
  category: z.enum(ISSUE_CATEGORIES),
  bountyAmount: z.number().min(BOUNTY_MIN_AMOUNT).max(BOUNTY_MAX_AMOUNT),
  tokenId: z.string().min(1),
  requiredSkills: z.array(z.string().min(1).max(40)).max(10).nullish(),
  difficulty: z.enum(ISSUE_DIFFICULTY).nullish(),
  timeEstimate: z.string().max(50).nullish(),
  expiresAt: z
    .string()
    .datetime()
    .refine((s) => new Date(s).getTime() > Date.now(), {
      message: "expiresAt phải ở tương lai",
    })
    .nullish(),
  githubRepo: z.string().url().max(200).refine((value) => {
    const repositoryUrl = new URL(value);
    return repositoryUrl.protocol === "https:" && repositoryUrl.hostname === "github.com";
  }, "Repository URL must be an HTTPS GitHub URL").nullish(),
});

// ---------------------------------------------------------------------------
// B-1 — issues: list + filter + sort + cursor pagination
// ---------------------------------------------------------------------------

builder.queryField("issues", (t) =>
  t.field({
    description:
      "Danh sách bounty: filter (category/status/bounty/skill/search) + sort + cursor pagination",
    type: IssueConnectionRef,
    args: {
      first: t.arg.int({ required: false }),
      after: t.arg.string({ required: false }),
      category: t.arg({ type: IssueCategoryEnum, required: false }),
      status: t.arg({ type: IssueStatusEnum, required: false }),
      bountyMin: t.arg.float({ required: false }),
      bountyMax: t.arg.float({ required: false }),
      skill: t.arg.string({ required: false }),
      search: t.arg.string({ required: false }),
      sortBy: t.arg({ type: IssueSortByEnum, required: false }),
      sortOrder: t.arg({ type: SortOrderEnum, required: false }),
    },
    resolve: async (_root, args, ctx) => {
      const q = parseOrThrow(IssuesQuerySchema, args);

      // Build where clause (homepage chỉ hiển thị task đã publish)
      const where: Prisma.IssueWhereInput = {
        isDraft: false,
        ...(q.category ? { category: q.category } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.bountyMin != null || q.bountyMax != null
          ? {
              bountyAmount: {
                ...(q.bountyMin != null ? { gte: q.bountyMin } : {}),
                ...(q.bountyMax != null ? { lte: q.bountyMax } : {}),
              },
            }
          : {}),
        ...(q.skill ? { requiredSkills: { has: q.skill } } : {}),
        ...(q.search
          ? {
              OR: [
                { title: { contains: q.search, mode: "insensitive" } },
                { description: { contains: q.search, mode: "insensitive" } },
              ],
            }
          : {}),
      };

      // Sort (luôn kèm id tiebreaker để cursor phân trang ổn định)
      const direction: Prisma.SortOrder = (q.sortOrder ?? "DESC") === "ASC" ? "asc" : "desc";
      const sortBy = q.sortBy ?? "CREATED_AT";
      const orderBy: Prisma.IssueOrderByWithRelationInput[] =
        sortBy === "BOUNTY_AMOUNT"
          ? [{ bountyAmount: direction }, { id: "asc" }]
          : sortBy === "VIEW_COUNT"
            ? [{ viewCount: direction }, { id: "asc" }]
            : sortBy === "DEADLINE"
              ? [{ expiresAt: "asc" }, { createdAt: "desc" }, { id: "asc" }]
              : [{ createdAt: direction }, { id: "asc" }];

      // Fetch take + 1 để tính hasNextPage
      const take = q.first ?? DEFAULT_PAGE_SIZE;
      const rows = await ctx.db.issue.findMany({
        where,
        orderBy,
        take: take + 1,
        ...(q.after ? { cursor: { id: decodeCursor(q.after) }, skip: 1 } : {}),
        include: ISSUE_INCLUDE,
      });

      const hasNextPage = rows.length > take;
      const issues = hasNextPage ? rows.slice(0, take) : rows;
      const totalCount = await ctx.db.issue.count({ where });

      const firstIssue = issues[0];
      const lastIssue = issues[issues.length - 1];

      return {
        edges: issues.map((issue) => ({
          node: issue,
          cursor: encodeCursor(issue.id),
        })),
        pageInfo: {
          hasNextPage,
          hasPreviousPage: Boolean(q.after),
          startCursor: firstIssue ? encodeCursor(firstIssue.id) : null,
          endCursor: lastIssue ? encodeCursor(lastIssue.id) : null,
        },
        totalCount,
      };
    },
  })
);

// Active bounty tokens for create-task forms.
builder.queryField("tokens", (t) =>
  t.prismaField({
    type: [TokenRef],
    resolve: (query, _root, _args, ctx) =>
      ctx.db.token.findMany({
        ...query,
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { symbol: "asc" }],
      }),
  })
);

// Personal work queue includes drafts and assigned issues; never expose another
// user's private drafts through the public marketplace query.
builder.queryField("myIssues", (t) =>
  t.prismaField({
    type: [IssueRef],
    resolve: (query, _root, _args, ctx) => {
      const user = requireAuth(ctx);
      return ctx.db.issue.findMany({
        ...query,
        where: { OR: [{ clientId: user.id }, { developerId: user.id }] },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        include: ISSUE_INCLUDE,
      });
    },
  })
);

// ---------------------------------------------------------------------------
// B-2 — issue(id): chi tiết + client + token + applicationCount
// ---------------------------------------------------------------------------

builder.queryField("issue", (t) =>
  t.field({
    description: "Chi tiết 1 bounty theo id (tự tăng viewCount)",
    type: IssueRef,
    nullable: true,
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const issue = await ctx.db.issue.findUnique({
        where: { id: args.id },
        include: ISSUE_INCLUDE,
      });
      if (!issue) return null;

      // Draft chỉ hiển thị với chủ task
      if (issue.isDraft && ctx.user?.id !== issue.clientId) return null;

      // Tăng viewCount (analytics — không để lỗi phụ ảnh hưởng query chính)
      await ctx.db.issue
        .update({
          where: { id: issue.id },
          data: { viewCount: { increment: 1 } },
        })
        .catch(() => null);

      return { ...issue, viewCount: issue.viewCount + 1 };
    },
  })
);

// ---------------------------------------------------------------------------
// B-3 — createIssue: đăng bounty mới (auth required)
// ---------------------------------------------------------------------------

builder.mutationField("createIssue", (t) =>
  t.fieldWithInput({
    description: "Đăng bounty mới (yêu cầu đăng nhập bằng ví)",
    type: IssueRef,
    typeOptions: { name: "CreateIssueInput" },
    input: {
      title: t.input.string({ required: true }),
      description: t.input.string({ required: true }),
      category: t.input.field({ type: IssueCategoryEnum, required: true }),
      bountyAmount: t.input.float({ required: true }),
      tokenId: t.input.id({ required: true }),
      requiredSkills: t.input.stringList({ required: false }),
      difficulty: t.input.string({ required: false }),
      timeEstimate: t.input.string({ required: false }),
      expiresAt: t.input.string({ required: false }),
      githubRepo: t.input.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      if (user.role !== UserRole.CLIENT) throw gqlError("Switch your profile to the client role before posting a bounty", "CLIENT_ROLE_REQUIRED");

      const input = parseOrThrow(CreateIssueSchema, args.input);

      // Token phải nằm trong whitelist
      const token = await ctx.db.token.findUnique({
        where: { id: input.tokenId },
      });
      if (!token || !token.isActive) {
        throw gqlError(
          "Bounty token không tồn tại hoặc không được hỗ trợ",
          "INVALID_TOKEN"
        );
      }

      return ctx.db.issue.create({
        data: {
          title: input.title,
          description: input.description,
          category: input.category,
          bountyAmount: input.bountyAmount,
          tokenId: input.tokenId,
          requiredSkills: input.requiredSkills ?? [],
          ...(input.difficulty != null ? { difficulty: input.difficulty } : {}),
          ...(input.timeEstimate != null
            ? { timeEstimate: input.timeEstimate }
            : {}),
          ...(input.expiresAt ? { expiresAt: new Date(input.expiresAt) } : {}),
          ...(input.githubRepo != null ? { githubRepo: input.githubRepo } : {}),
          clientId: user.id,
          status: IssueStatus.OPEN,
          publishedAt: new Date(),
        },
        include: ISSUE_INCLUDE,
      });
    },
  })
);

const UpdateIssueSchema = CreateIssueSchema.partial().extend({
  title: z.string().min(10).max(120).optional(),
  description: z.string().min(30).max(5000).optional(),
  category: z.enum(ISSUE_CATEGORIES).optional(),
  bountyAmount: z.number().min(BOUNTY_MIN_AMOUNT).max(BOUNTY_MAX_AMOUNT).optional(),
  tokenId: z.string().min(1).optional(),
});

builder.mutationField("updateIssue", (t) =>
  t.fieldWithInput({
    type: IssueRef,
    nullable: true,
    typeOptions: { name: "UpdateIssueInput" },
    input: {
      id: t.input.id({ required: true }),
      title: t.input.string({ required: false }),
      description: t.input.string({ required: false }),
      category: t.input.field({ type: IssueCategoryEnum, required: false }),
      bountyAmount: t.input.float({ required: false }),
      tokenId: t.input.id({ required: false }),
      requiredSkills: t.input.stringList({ required: false }),
      difficulty: t.input.string({ required: false }),
      timeEstimate: t.input.string({ required: false }),
      expiresAt: t.input.string({ required: false }),
      githubRepo: t.input.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      const current = await ctx.db.issue.findUnique({
        where: { id: String(args.input.id) },
        include: ISSUE_INCLUDE,
      });
      if (!current) return null;
      if (current.clientId !== user.id) throw gqlError("Chỉ chủ bài toán mới được chỉnh sửa", "FORBIDDEN");
      if (current.status !== IssueStatus.OPEN) throw gqlError("Không thể chỉnh sửa bài toán đã được nhận", "ISSUE_NOT_EDITABLE");

      const raw = Object.fromEntries(Object.entries(args.input).filter(([key, value]) => key !== "id" && value !== null));
      const input = parseOrThrow(UpdateIssueSchema, raw);
      if (input.tokenId) {
        const token = await ctx.db.token.findFirst({ where: { id: input.tokenId, isActive: true } });
        if (!token) throw gqlError("Bounty token không tồn tại hoặc không được hỗ trợ", "INVALID_TOKEN");
      }

      const updateData: Prisma.IssueUpdateInput = {};
      if (input.title !== undefined) updateData.title = input.title;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.category !== undefined) updateData.category = input.category;
      if (input.bountyAmount !== undefined) updateData.bountyAmount = input.bountyAmount;
      if (input.tokenId !== undefined) updateData.token = { connect: { id: input.tokenId } };
      if (input.requiredSkills != null) updateData.requiredSkills = input.requiredSkills;
      if (input.difficulty !== undefined) updateData.difficulty = input.difficulty;
      if (input.timeEstimate !== undefined) updateData.timeEstimate = input.timeEstimate;
      if (input.expiresAt != null) updateData.expiresAt = new Date(input.expiresAt);
      if (input.githubRepo !== undefined) updateData.githubRepo = input.githubRepo;

      return ctx.db.issue.update({
        where: { id: current.id },
        data: updateData,
        include: ISSUE_INCLUDE,
      });
    },
  })
);

builder.mutationField("cancelIssue", (t) =>
  t.field({
    type: IssueRef,
    nullable: true,
    args: { id: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      const issue = await ctx.db.issue.findUnique({ where: { id: String(args.id) } });
      if (!issue) return null;
      if (issue.clientId !== user.id) throw gqlError("Chỉ chủ bài toán mới được hủy", "FORBIDDEN");
      if (issue.status !== IssueStatus.OPEN) throw gqlError("Chỉ có thể hủy bài toán đang mở", "ISSUE_NOT_CANCELLABLE");
      const cancelled = await ctx.db.issue.updateMany({
        where: { id: issue.id, clientId: user.id, status: IssueStatus.OPEN, developerId: null },
        data: { status: IssueStatus.CANCELLED },
      });
      if (cancelled.count !== 1) throw gqlError("Bài toán vừa được nhận và không thể hủy", "ISSUE_NOT_CANCELLABLE");
      return ctx.db.issue.findUnique({ where: { id: issue.id }, include: ISSUE_INCLUDE });
    },
  })
);
