import { EscrowStatus, IssueStatus } from "@bloody-roar/database";
import { builder } from "../../builder";
import { requireAdmin, requireAuth } from "../../context";

type UserStats = {
  postedTasks: number;
  workingTasks: number;
  completedTasks: number;
  applications: number;
  completedPayouts: number;
};

type TokenAmount = { symbol: string; amount: number };
type AdminStats = {
  users: number;
  openTasks: number;
  activeTasks: number;
  completedTasks: number;
  openDisputes: number;
  completedBounties: TokenAmount[];
};

const UserStatsRef = builder.objectRef<UserStats>("UserStats").implement({
  fields: (t) => ({
    postedTasks: t.exposeInt("postedTasks"),
    workingTasks: t.exposeInt("workingTasks"),
    completedTasks: t.exposeInt("completedTasks"),
    applications: t.exposeInt("applications"),
    completedPayouts: t.exposeInt("completedPayouts"),
  }),
});

const TokenAmountRef = builder.objectRef<TokenAmount>("TokenAmount").implement({
  fields: (t) => ({
    symbol: t.exposeString("symbol"),
    amount: t.exposeFloat("amount"),
  }),
});

const AdminStatsRef = builder.objectRef<AdminStats>("AdminStats").implement({
  fields: (t) => ({
    users: t.exposeInt("users"),
    openTasks: t.exposeInt("openTasks"),
    activeTasks: t.exposeInt("activeTasks"),
    completedTasks: t.exposeInt("completedTasks"),
    openDisputes: t.exposeInt("openDisputes"),
    completedBounties: t.field({ type: [TokenAmountRef], resolve: (stats) => stats.completedBounties }),
  }),
});

builder.queryFields((t) => ({
  userStats: t.field({
    type: UserStatsRef,
    resolve: async (_root, _args, ctx) => {
      const user = requireAuth(ctx);
      const [postedTasks, workingTasks, completedTasks, applications, completedPayouts] = await Promise.all([
        ctx.db.issue.count({ where: { clientId: user.id, isDraft: false } }),
        ctx.db.issue.count({ where: { developerId: user.id, status: IssueStatus.IN_PROGRESS } }),
        ctx.db.issue.count({ where: { OR: [{ clientId: user.id }, { developerId: user.id }], status: IssueStatus.COMPLETED } }),
        ctx.db.application.count({ where: { developerId: user.id } }),
        ctx.db.escrow.count({ where: { developerId: user.id, status: EscrowStatus.COMPLETED } }),
      ]);
      return {
        postedTasks,
        workingTasks,
        completedTasks,
        applications,
        completedPayouts,
      };
    },
  }),
  adminStats: t.field({
    type: AdminStatsRef,
    resolve: async (_root, _args, ctx) => {
      requireAdmin(ctx);
      const [users, openTasks, activeTasks, completedTasks, openDisputes, paidByToken] = await Promise.all([
        ctx.db.user.count({ where: { isBanned: false } }),
        ctx.db.issue.count({ where: { status: IssueStatus.OPEN, isDraft: false } }),
        ctx.db.issue.count({ where: { status: IssueStatus.IN_PROGRESS } }),
        ctx.db.issue.count({ where: { status: IssueStatus.COMPLETED } }),
        ctx.db.dispute.count({ where: { status: { in: ["OPEN", "ANALYZING", "PROPOSED", "CHALLENGED"] } } }),
        ctx.db.escrow.groupBy({ by: ["tokenId"], where: { status: EscrowStatus.COMPLETED }, _sum: { bountyAmount: true } }),
      ]);
      const tokens = await ctx.db.token.findMany({ where: { id: { in: paidByToken.map((row) => row.tokenId) } }, select: { id: true, symbol: true } });
      const symbolById = new Map(tokens.map((token) => [token.id, token.symbol]));
      return {
        users, openTasks, activeTasks, completedTasks, openDisputes,
        completedBounties: paidByToken.flatMap((row) => {
          const symbol = symbolById.get(row.tokenId);
          return symbol && row._sum.bountyAmount ? [{ symbol, amount: row._sum.bountyAmount.toNumber() }] : [];
        }),
      };
    },
  }),
}));
