import { createHash } from "node:crypto";
import { type Prisma, type EscrowProjection } from "@bloody-roar/database";
import { canonicalJson, computeEvidenceManifestHash, type EvidenceManifest } from "@bloody-roar/shared/escrow";
import { builder } from "../../builder";
import { requireAuth, type GraphQLContext } from "../../context";
import { gqlError } from "../../errors";
import { guardMessage } from "../../../ai/guard/service";
import { readChainTime } from "../../../lib/escrow/chain-time";
import { createPreparedCall, escrowTarget } from "../../../lib/escrow/prepare";
import { putObject } from "../../../lib/storage";
import { PreparedCallRef } from "../escrow/release.module";

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const EvidenceRef = builder.prismaObject("EvidenceManifest", { fields: (t) => ({
  id: t.exposeID("id"), manifestHash: t.exposeString("manifestHash"), storageKey: t.exposeString("storageKey"), side: t.exposeString("side"),
}) });
const ChatRangeInput = builder.inputType("EvidenceChatRangeInput", { fields: (t) => ({
  fromMessageId: t.id({ required: true }), toMessageId: t.id({ required: true }),
}) });

async function partyProjection(ctx: GraphQLContext, issueId: string) {
  const user = requireAuth(ctx);
  const projection = await ctx.db.escrowProjection.findUnique({ where: { issueId } });
  if (!projection?.escrowKey) throw gqlError("Bài toán chưa có ký quỹ", "NOT_FOUND");
  const target = escrowTarget();
  if (projection.chainId !== target.chainId || projection.contractAddress.toLowerCase() !== target.contractAddress.toLowerCase())
    throw gqlError("Ký quỹ không khớp cấu hình", "ESCROW_CHAIN_MISMATCH");
  const wallet = user.walletAddress.toLowerCase();
  const side = wallet === projection.client.toLowerCase() ? "CLIENT" : wallet === projection.developer.toLowerCase() ? "DEVELOPER" : null;
  if (!side) throw gqlError("Chỉ các bên tham gia được nộp bằng chứng", "FORBIDDEN");
  return { user, projection: { ...projection, escrowKey: projection.escrowKey }, wallet, side } as const;
}

async function assertEvidenceWindow(projection: EscrowProjection, wallet: string): Promise<void> {
  if (projection.phase === "FUNDED") return;
  if (projection.phase !== "DISPUTED") throw gqlError("Tranh chấp không nhận bằng chứng", "INVALID_PHASE");
  if (!projection.disputeRaisedBy || projection.disputeRaisedBy.toLowerCase() === wallet)
    throw gqlError("Chỉ bên còn lại được nộp bổ sung", "FORBIDDEN");
  if (projection.counterpartyEvidenceHash || !projection.disputeRaisedAt)
    throw gqlError("Đã nộp hoặc thiếu mốc bằng chứng", "INVALID_PHASE");
  if (await readChainTime(projection.chainId) >= new Date(projection.disputeRaisedAt.getTime() + 72 * 3_600_000))
    throw gqlError("Đã hết thời hạn bằng chứng", "DEADLINE_PASSED");
}

builder.mutationField("createEvidenceManifest", (t) => t.field({
  type: EvidenceRef,
  args: { issueId: t.arg.id({ required: true }), statement: t.arg.string({ required: true }), attachmentIds: t.arg.idList(), chatRange: t.arg({ type: ChatRangeInput }) },
  resolve: async (_root, args, ctx) => {
    const { user, projection, wallet, side } = await partyProjection(ctx, String(args.issueId));
    await assertEvidenceWindow(projection, wallet);
    if (args.statement.length < 10 || args.statement.length > 5000) throw gqlError("Nội dung bằng chứng phải dài 10–5000 ký tự", "BAD_USER_INPUT");
    const ids = args.attachmentIds?.map(String) ?? [];
    if (ids.length > 10 || new Set(ids).size !== ids.length) throw gqlError("Tệp bằng chứng không hợp lệ", "INVALID_ATTACHMENT");
    const files = await ctx.db.attachment.findMany({ where: { id: { in: ids }, issueId: projection.issueId!, uploaderId: user.id, purpose: "EVIDENCE", status: "ATTACHED" } });
    if (files.length !== ids.length || files.some((file) => !file.sha256 || !/^[a-fA-F0-9]{64}$/.test(file.sha256)))
      throw gqlError("Tệp bằng chứng không hợp lệ", "INVALID_ATTACHMENT");
    let chatRange: EvidenceManifest["chatRange"] = null;
    if (args.chatRange) {
      const fromMessageId = String(args.chatRange.fromMessageId), toMessageId = String(args.chatRange.toMessageId);
      const [from, to] = await Promise.all([ctx.db.message.findFirst({ where: { id: fromMessageId, issueId: projection.issueId! } }), ctx.db.message.findFirst({ where: { id: toMessageId, issueId: projection.issueId! } })]);
      if (!from || !to || from.createdAt > to.createdAt) throw gqlError("Khoảng chat không hợp lệ", "BAD_USER_INPUT");
      const messages = await ctx.db.message.findMany({ where: { issueId: projection.issueId!, isDeleted: false, createdAt: { gte: from.createdAt, lte: to.createdAt } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, senderId: true, content: true, createdAt: true } });
      const transcript = messages.map(({ id, senderId, content, createdAt }) => ({ id, senderId, content, createdAt: createdAt.toISOString() }));
      chatRange = { fromMessageId, toMessageId, transcriptSha256: sha256(canonicalJson(transcript)) };
    }
    const text = (await guardMessage(args.statement, { issueId: projection.issueId! })).content;
    const byId = new Map(files.map((file) => [file.id, file]));
    const manifest: EvidenceManifest = { escrowId: projection.escrowKey, side, statement: { text, sha256: sha256(text) },
      files: ids.map((id) => { const file = byId.get(id)!; return { key: file.fileUrl, sha256: file.sha256!, mime: file.fileMime, size: file.fileSize, name: file.fileName }; }), chatRange };
    const manifestHash = computeEvidenceManifestHash(manifest);
    const existing = await ctx.db.evidenceManifest.findUnique({ where: { manifestHash } });
    if (existing) return existing;
    const storageKey = `manifests/${projection.issueId}/${manifestHash}.json`;
    await putObject(storageKey, Buffer.from(canonicalJson(manifest), "utf8"), "application/json");
    return ctx.db.evidenceManifest.upsert({ where: { manifestHash }, update: {}, create: { issueId: projection.issueId!, side, submittedById: user.id, manifest: manifest as unknown as Prisma.InputJsonValue, manifestHash, storageKey } });
  },
}));

for (const [field, method] of [["prepareRaiseDispute", "raiseDispute"], ["prepareSubmitCounterpartyEvidence", "submitCounterpartyEvidence"]] as const) {
  builder.mutationField(field, (t) => t.field({
    type: PreparedCallRef, args: { issueId: t.arg.id({ required: true }), manifestId: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const { user, projection, wallet, side } = await partyProjection(ctx, String(args.issueId));
      if (method === "raiseDispute" && projection.phase !== "FUNDED") throw gqlError("Ký quỹ không ở trạng thái tranh chấp", "INVALID_PHASE");
      if (method === "submitCounterpartyEvidence") {
        if (projection.phase !== "DISPUTED") throw gqlError("Tranh chấp không nhận bằng chứng", "INVALID_PHASE");
        await assertEvidenceWindow(projection, wallet);
      }
      const manifest = await ctx.db.evidenceManifest.findUnique({ where: { id: String(args.manifestId) } });
      if (!manifest || manifest.issueId !== projection.issueId || manifest.submittedById !== user.id || manifest.side !== side)
        throw gqlError("Bằng chứng không thuộc người gửi hoặc bài toán", "FORBIDDEN");
      return createPreparedCall(ctx.db, { userId: user.id, issueId: projection.issueId, escrowKey: projection.escrowKey, method, args: { escrowId: projection.escrowKey, evidenceManifestHash: manifest.manifestHash } });
    },
  }));
}
