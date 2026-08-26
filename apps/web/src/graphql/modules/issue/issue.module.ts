// apps/web/src/graphql/modules/issue/issue.module.ts
// Issue / Bounty module — Homepage backend (B-1 · B-2 · B-3)
// - issues(query): filter + sort + cursor pagination
// - issue(id): detail (client + token + applicationCount)
// - createIssue(input): post a new bounty (auth required)

import { builder } from "../../builder";
import { requireAuth } from "../../context";
import { gqlError, parseOrThrow } from "../../errors";
import type { Prisma } from "@bloody-roar/database";
import { IssueCategory, IssueStatus } from "@bloody-roar/database";
import { UserRef } from "../user/user.module";
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
const ISSUE_INCLUDE = {
  token: true,
  client: true,
  developer: true,
  _count: { select: { applications: true } },
} satisfies Prisma.IssueInclude;

/** Shape của 1 dòng Issue sau khi include relations */
type IssueNode = Prisma.IssueGetPayload<{ include: typeof ISSUE_INCLUDE }>;

const IssueRef = builder.prismaObject("Issue", {
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
  githubRepo: z.string().url().max(200).nullish(),
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
      const orderBy: Prisma.IssueOrderByWithRelationInput[] = [
        sortBy === "BOUNTY_AMOUNT"
          ? { bountyAmount: direction }
          : sortBy === "VIEW_COUNT"
            ? { viewCount: direction }
            : { createdAt: direction },
        { id: "asc" },
      ];

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
