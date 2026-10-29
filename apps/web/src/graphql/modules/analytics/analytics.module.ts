import { EscrowPhase, IssueStatus } from "@bloody-roar/database";
import { builder, tokenAmount, TokenAmountRef, type TokenAmountValue } from "../../builder";
import { requireAdmin, requireAuth } from "../../context";
import { gqlError } from "../../errors";

type AssetStats = { chainId: number; contractAddress: string; grossRaw: string; developerRaw: string; clientRaw: string; feeRaw: string; claimableRaw: string };
type UserAssetStats = Pick<AssetStats, "chainId" | "contractAddress" | "developerRaw" | "claimableRaw">;
type UserStats = { postedTasks: number; workingTasks: number; completedTasks: number; applications: number; completedPayouts: number; assets: UserAssetStats[] };
type AdminStats = { users: number; openTasks: number; activeTasks: number; completedTasks: number; openDisputes: number; completedBounties: TokenAmountValue[];
  assets: AssetStats[]; disputeRateBps: number; meanDisputeResolutionSeconds: string | null };
const AssetStatsRef = builder.objectRef<AssetStats>("EscrowAssetStats").implement({ fields: (t) => ({
  chainId: t.exposeInt("chainId"), contractAddress: t.exposeString("contractAddress"), grossRaw: t.exposeString("grossRaw"),
  developerRaw: t.exposeString("developerRaw"), clientRaw: t.exposeString("clientRaw"), feeRaw: t.exposeString("feeRaw"), claimableRaw: t.exposeString("claimableRaw"),
}) });
const UserAssetStatsRef = builder.objectRef<UserAssetStats>("UserEscrowAssetStats").implement({ fields: (t) => ({
  chainId: t.exposeInt("chainId"), contractAddress: t.exposeString("contractAddress"), developerRaw: t.exposeString("developerRaw"), claimableRaw: t.exposeString("claimableRaw"),
}) });
const UserStatsRef = builder.objectRef<UserStats>("UserStats").implement({ fields: (t) => ({
  postedTasks: t.exposeInt("postedTasks"), workingTasks: t.exposeInt("workingTasks"), completedTasks: t.exposeInt("completedTasks"),
  applications: t.exposeInt("applications"), completedPayouts: t.exposeInt("completedPayouts"), assets: t.field({ type: [UserAssetStatsRef], resolve: (s) => s.assets }),
}) });
const AdminStatsRef = builder.objectRef<AdminStats>("AdminStats").implement({ fields: (t) => ({
  users: t.exposeInt("users"), openTasks: t.exposeInt("openTasks"), activeTasks: t.exposeInt("activeTasks"), completedTasks: t.exposeInt("completedTasks"),
  openDisputes: t.exposeInt("openDisputes"), completedBounties: t.field({ type: [TokenAmountRef], resolve: (s) => s.completedBounties }),
  assets: t.field({ type: [AssetStatsRef], resolve: (s) => s.assets }), disputeRateBps: t.exposeInt("disputeRateBps"),
  meanDisputeResolutionSeconds: t.exposeString("meanDisputeResolutionSeconds", { nullable: true }),
}) });

const keyOf = (chainId: number, contract: string) => `${chainId}:${contract.toLowerCase()}`;
const raw = (value: { toFixed(): string } | null | undefined) => value?.toFixed() ?? "0";
const add = (a: string, b: string) => (BigInt(a) + BigInt(b)).toString();
function assetMap() {
  const assets = new Map<string, AssetStats>();
  return { assets, get(chainId: number, contractAddress: string) {
    const key = keyOf(chainId, contractAddress);
    let row = assets.get(key);
    if (!row) { row = { chainId, contractAddress: contractAddress.toLowerCase(), grossRaw: "0", developerRaw: "0", clientRaw: "0", feeRaw: "0", claimableRaw: "0" }; assets.set(key, row); }
    return row;
  } };
}

builder.queryFields((t) => ({
  userStats: t.field({
    type: UserStatsRef,
    args: { userId: t.arg.id() },
    resolve: async (_root, args, ctx) => {
      const id = args.userId ? String(args.userId) : requireAuth(ctx).id;
      const user = await ctx.db.user.findUnique({ where: { id }, select: { id: true, walletAddress: true } });
      if (!user) throw gqlError("User not found", "NOT_FOUND");
      const wallet = user.walletAddress;
      const party = { OR: [{ client: { equals: wallet, mode: "insensitive" as const } }, { developer: { equals: wallet, mode: "insensitive" as const } }] };
      const developer = { developer: { equals: wallet, mode: "insensitive" as const } };
      const [postedTasks, workingTasks, completedTasks, applications, completedPayouts, paid, balances] = await Promise.all([
        ctx.db.issue.count({ where: { clientId: id, isDraft: false, hiddenAt: null } }),
        ctx.db.escrowProjection.count({ where: { ...developer, phase: { notIn: [EscrowPhase.NONE, EscrowPhase.RESOLVED] } } }),
        ctx.db.escrowProjection.count({ where: { ...party, phase: EscrowPhase.RESOLVED } }),
        ctx.db.application.count({ where: { developerId: id } }),
        ctx.db.escrowProjection.count({ where: { ...developer, phase: EscrowPhase.RESOLVED, developerAmountRaw: { gt: 0 } } }),
        ctx.db.escrowProjection.groupBy({ by: ["chainId", "contractAddress"], where: { ...developer, phase: EscrowPhase.RESOLVED }, _sum: { developerAmountRaw: true } }),
        ctx.db.claimableBalance.groupBy({ by: ["chainId", "contractAddress"], where: { address: { equals: wallet, mode: "insensitive" } }, _sum: { amountRaw: true } }),
      ]);
      const groups = assetMap();
      for (const row of paid) { const group = groups.get(row.chainId, row.contractAddress); group.developerRaw = add(group.developerRaw, raw(row._sum.developerAmountRaw)); }
      for (const row of balances) { const group = groups.get(row.chainId, row.contractAddress); group.claimableRaw = add(group.claimableRaw, raw(row._sum.amountRaw)); }
      return { postedTasks, workingTasks, completedTasks, applications, completedPayouts, assets: [...groups.assets.values()] };
    },
  }),
  adminStats: t.field({
    type: AdminStatsRef,
    resolve: async (_root, _args, ctx) => {
      requireAdmin(ctx);
      const [users, openTasks, activeTasks, completedTasks, openDisputes, totalEscrows, paid, balances, resolved, projections, events] = await Promise.all([
        ctx.db.user.count({ where: { isBanned: false } }),
        ctx.db.issue.count({ where: { status: IssueStatus.OPEN, isDraft: false, hiddenAt: null } }),
        ctx.db.escrowProjection.count({ where: { phase: { notIn: [EscrowPhase.NONE, EscrowPhase.RESOLVED] } } }),
        ctx.db.escrowProjection.count({ where: { phase: EscrowPhase.RESOLVED } }),
        ctx.db.escrowProjection.count({ where: { phase: { in: [EscrowPhase.DISPUTED, EscrowPhase.INITIAL_RULING, EscrowPhase.CHALLENGED, EscrowPhase.FINAL_RULING] } } }),
        ctx.db.escrowProjection.count(),
        ctx.db.escrowProjection.groupBy({ by: ["chainId", "contractAddress"], where: { phase: EscrowPhase.RESOLVED }, _sum: { amountRaw: true, clientAmountRaw: true, developerAmountRaw: true, platformFeeRaw: true } }),
        ctx.db.claimableBalance.groupBy({ by: ["chainId", "contractAddress"], _sum: { amountRaw: true } }),
        ctx.db.escrowProjection.findMany({ where: { phase: EscrowPhase.RESOLVED, issueId: { not: null } }, select: { issueId: true, amountRaw: true } }),
        ctx.db.escrowProjection.findMany({ select: { chainId: true, contractAddress: true, escrowIdHash: true } }),
        ctx.db.chainEvent.findMany({ where: { canonical: true, eventName: { in: ["DisputeRaised", "EscrowResolved"] }, escrowIdHash: { not: null } },
          select: { chainId: true, contractAddress: true, escrowIdHash: true, eventName: true, args: true }, orderBy: [{ blockNumber: "asc" }, { txIndex: "asc" }, { logIndex: "asc" }] }),
      ]);
      const groups = assetMap();
      for (const row of paid) {
        const group = groups.get(row.chainId, row.contractAddress);
        group.grossRaw = add(group.grossRaw, raw(row._sum.amountRaw)); group.clientRaw = add(group.clientRaw, raw(row._sum.clientAmountRaw));
        group.developerRaw = add(group.developerRaw, raw(row._sum.developerAmountRaw)); group.feeRaw = add(group.feeRaw, raw(row._sum.platformFeeRaw));
      }
      for (const row of balances) { const group = groups.get(row.chainId, row.contractAddress); group.claimableRaw = add(group.claimableRaw, raw(row._sum.amountRaw)); }
      const issues = await ctx.db.issue.findMany({ where: { id: { in: resolved.flatMap((p) => p.issueId ? [p.issueId] : []) } }, select: { id: true, token: { select: { id: true, symbol: true, decimals: true } } } });
      const issueTokens = new Map(issues.map((issue) => [issue.id, issue.token]));
      const byToken = new Map<string, { token: { id: string; symbol: string; decimals: number }; amount: bigint }>();
      for (const row of resolved) {
        const token = row.issueId ? issueTokens.get(row.issueId) : undefined;
        if (!token) continue;
        const existing = byToken.get(token.id); byToken.set(token.id, { token, amount: (existing?.amount ?? 0n) + BigInt(row.amountRaw.toFixed()) });
      }
      const canonicalKeys = new Set(projections.map((p) => `${keyOf(p.chainId, p.contractAddress)}:${p.escrowIdHash.toLowerCase()}`));
      const disputeKeys = new Set<string>();
      const disputes = new Map<string, bigint>(); let duration = 0n, resolvedDisputes = 0n;
      for (const event of events) {
        if (!event.escrowIdHash) continue;
        const key = `${keyOf(event.chainId, event.contractAddress)}:${event.escrowIdHash.toLowerCase()}`;
        if (!canonicalKeys.has(key)) continue;
        if (event.eventName === "DisputeRaised") disputeKeys.add(key);
        const timestamp = (event.args as { blockTimestamp?: unknown } | null)?.blockTimestamp;
        if (typeof timestamp !== "string" || !/^\d+$/.test(timestamp)) continue;
        const time = BigInt(timestamp);
        if (event.eventName === "DisputeRaised" && !disputes.has(key)) disputes.set(key, time);
        if (event.eventName === "EscrowResolved" && disputes.has(key) && time >= disputes.get(key)!) { duration += time - disputes.get(key)!; resolvedDisputes++; }
      }
      return { users, openTasks, activeTasks, completedTasks, openDisputes,
        completedBounties: [...byToken.values()].map(({ token, amount }) => tokenAmount(amount, token)), assets: [...groups.assets.values()],
        disputeRateBps: totalEscrows ? Math.floor(disputeKeys.size * 10000 / totalEscrows) : 0,
        meanDisputeResolutionSeconds: resolvedDisputes ? (duration / resolvedDisputes).toString() : null };
    },
  }),
}));
