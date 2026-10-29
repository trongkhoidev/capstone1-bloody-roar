import { createHash, randomUUID } from "node:crypto";
import { createNotificationIdempotent, NOTIFICATION_CREATED_CHANNEL, EscrowPhase, IssueStatus, Prisma, SubmissionStatus } from "@bloody-roar/database";
import { computeDeliveryHash } from "@bloody-roar/shared/escrow";
import { z } from "zod";
import { builder } from "../../builder";
import { requireAuth } from "../../context";
import { gqlError, parseOrThrow } from "../../errors";
import { SubmissionRef, SUBMISSION_INCLUDE } from "./submission.module";
import { PreparedCallRef } from "../escrow/release.module";
import { createPreparedCall, escrowTarget } from "../../../lib/escrow/prepare";

const draftSchema = z.object({
  issueId: z.string().min(1),
  submissionId: z.string().min(1).optional(),
  description: z.string().trim().max(4000).default(""),
  pullRequestUrl: z.string().url().max(500).or(z.literal("")).default(""),
  commitSha: z.string().regex(/^(?:[a-fA-F0-9]{40}|)$/).default(""),
  attachmentIds: z.array(z.string().min(1)).max(20).default([]),
}).refine((value) => Boolean(value.description || value.pullRequestUrl || value.commitSha || value.attachmentIds.length), {
  message: "Hãy cung cấp nội dung bài nộp",
}).refine((value) => new Set(value.attachmentIds).size === value.attachmentIds.length, {
  message: "Tệp đính kèm bị lặp",
});

builder.mutationField("createSubmissionDraft", (t) => t.field({
  type: SubmissionRef,
  args: {
    issueId: t.arg.id({ required: true }), submissionId: t.arg.id(), description: t.arg.string(),
    pullRequestUrl: t.arg.string(), commitSha: t.arg.string(), attachmentIds: t.arg.idList(),
  },
  resolve: async (_root, args, ctx) => {
    const user = requireAuth(ctx);
    const input = parseOrThrow(draftSchema, {
      issueId: String(args.issueId), ...(args.submissionId ? { submissionId: String(args.submissionId) } : {}),
      description: args.description ?? "", pullRequestUrl: args.pullRequestUrl ?? "", commitSha: args.commitSha ?? "",
      attachmentIds: args.attachmentIds?.map(String) ?? [],
    });
    return ctx.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM issues WHERE id = ${input.issueId} FOR UPDATE`;
      const issue = await tx.issue.findUnique({ where: { id: input.issueId }, select: { id: true, developerId: true, status: true, githubRepo: true } });
      if (!issue) throw gqlError("Bài toán không tồn tại", "NOT_FOUND");
      if (issue.developerId !== user.id) throw gqlError("Chỉ developer được giao bài mới tạo bản nháp", "FORBIDDEN");
      const projection = await tx.escrowProjection.findUnique({ where: { issueId: issue.id } });
      if (issue.status !== IssueStatus.IN_PROGRESS || !projection || projection.phase !== EscrowPhase.FUNDED || projection.developer.toLowerCase() !== user.walletAddress.toLowerCase())
        throw gqlError("Bài toán không ở trạng thái nhận bài nộp", "INVALID_PHASE");
      if (new Date() > projection.deliveryDeadline) throw gqlError("Đã hết hạn giao hàng", "DEADLINE_PASSED");
      if (input.pullRequestUrl) {
        const pr = new URL(input.pullRequestUrl);
        if (pr.protocol !== "https:" || pr.hostname !== "github.com" || !/^\/[^/]+\/[^/]+\/pull\/\d+\/?$/.test(pr.pathname))
          throw gqlError("URL pull request không hợp lệ", "INVALID_PULL_REQUEST_URL");
        if (issue.githubRepo) {
          const repo = new URL(issue.githubRepo);
          const normalize = (path: string) => path.replace(/\.git\/?$/, "").replace(/\/$/, "").toLowerCase();
          if (repo.hostname !== "github.com" || normalize(repo.pathname) !== normalize(pr.pathname.split("/").slice(0, 3).join("/")))
            throw gqlError("Pull request không thuộc repository của bài toán", "PULL_REQUEST_REPOSITORY_MISMATCH");
        }
      }
      const existing = input.submissionId ? await tx.submission.findUnique({ where: { id: input.submissionId } }) : null;
      if (input.submissionId && (!existing || existing.issueId !== issue.id || existing.developerId !== user.id))
        throw gqlError("Bản nháp không tồn tại", "NOT_FOUND");
      if (existing && existing.status !== SubmissionStatus.DRAFT) throw gqlError("Chỉ sửa được bản nháp", "SUBMISSION_NOT_DRAFT");
      const prepared = existing?.deliveryHash && await tx.transactionIntent.findFirst({ where: { issueId: issue.id, method: "submitWork", args: { path: ["deliveryHash"], equals: existing.deliveryHash } }, select: { id: true } });
      const attachments = await tx.attachment.findMany({ where: { id: { in: input.attachmentIds }, issueId: issue.id, uploaderId: user.id, purpose: "DELIVERY", status: "ATTACHED" } });
      if (attachments.length !== input.attachmentIds.length || attachments.some((file) => !file.sha256 || !/^[a-fA-F0-9]{64}$/.test(file.sha256)))
        throw gqlError("Tệp giao hàng không hợp lệ", "INVALID_ATTACHMENT");
      const id = existing && !prepared ? existing.id : randomUUID();
      const byId = new Map(attachments.map((file) => [file.id, file]));
      const manifest = { issueId: issue.id, submissionId: id,
        descriptionSha256: createHash("sha256").update(input.description, "utf8").digest("hex"),
        prUrl: input.pullRequestUrl, commitSha: input.commitSha,
        attachments: input.attachmentIds.map((fileId) => { const file = byId.get(fileId)!; return { key: file.fileUrl, sha256: file.sha256!, mime: file.fileMime, size: file.fileSize }; }),
      };
      const data = { description: input.description || null, pullRequestUrl: input.pullRequestUrl || null, commitSha: input.commitSha || null,
        manifest, deliveryHash: computeDeliveryHash(manifest), status: SubmissionStatus.DRAFT };
      const include = SUBMISSION_INCLUDE;
      if (existing && !prepared) return tx.submission.update({ where: { id }, data, include });
      return tx.submission.create({ data: { ...data, id, issueId: issue.id, developerId: user.id }, include });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  },
}));

builder.mutationField("prepareSubmitWork", (t) => t.field({
  type: PreparedCallRef,
  args: { submissionId: t.arg.id({ required: true }) },
  resolve: async (_root, args, ctx) => {
    const user = requireAuth(ctx);
    const id = String(args.submissionId);
    return ctx.db.$transaction(async (tx) => {
      const submission = await tx.submission.findUnique({ where: { id } });
      if (!submission || submission.developerId !== user.id) throw gqlError("Bản nháp không tồn tại", "NOT_FOUND");
      await tx.$queryRaw`SELECT id FROM issues WHERE id = ${submission.issueId} FOR UPDATE`;
      const fresh = await tx.submission.findUnique({ where: { id } });
      const issue = await tx.issue.findUnique({ where: { id: submission.issueId }, select: { developerId: true, status: true } });
      const projection = await tx.escrowProjection.findUnique({ where: { issueId: submission.issueId } });
      if (!fresh || fresh.status !== SubmissionStatus.DRAFT || !fresh.deliveryHash || !fresh.manifest)
        throw gqlError("Bản nháp không hợp lệ", "SUBMISSION_NOT_DRAFT");
      if (!issue || issue.developerId !== user.id || issue.status !== IssueStatus.IN_PROGRESS || !projection || !projection.escrowKey || projection.phase !== EscrowPhase.FUNDED)
        throw gqlError("Bài toán không ở trạng thái nhận bài nộp", "INVALID_PHASE");
      if (projection.developer.toLowerCase() !== user.walletAddress.toLowerCase()) throw gqlError("Ví developer không khớp", "FORBIDDEN");
      const target = escrowTarget();
      if (projection.chainId !== target.chainId || projection.contractAddress.toLowerCase() !== target.contractAddress.toLowerCase())
        throw gqlError("Ký quỹ không khớp cấu hình", "ESCROW_CHAIN_MISMATCH");
      if (new Date() > projection.deliveryDeadline) throw gqlError("Đã hết hạn giao hàng", "DEADLINE_PASSED");
      return createPreparedCall(tx, { userId: user.id, issueId: submission.issueId, escrowKey: projection.escrowKey,
        method: "submitWork", expiresAt: new Date(Math.min(projection.deliveryDeadline.getTime(), Date.now() + 30 * 60_000)),
        args: { escrowId: projection.escrowKey, deliveryHash: fresh.deliveryHash } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  },
}));

builder.mutationField("requestChanges", (t) => t.field({
  type: SubmissionRef,
  args: { submissionId: t.arg.id({ required: true }), notes: t.arg.string({ required: true }) },
  resolve: async (_root, args, ctx) => {
    const user = requireAuth(ctx);
    const notes = parseOrThrow(z.string().trim().min(1).max(2000), args.notes);
    return ctx.db.$transaction(async (tx) => {
      const initial = await tx.submission.findUnique({ where: { id: String(args.submissionId) } });
      if (!initial) throw gqlError("Bài nộp không tồn tại", "NOT_FOUND");
      await tx.$queryRaw`SELECT id FROM issues WHERE id = ${initial.issueId} FOR UPDATE`;
      const submission = await tx.submission.findUnique({ where: { id: initial.id }, include: { issue: true } });
      if (!submission) throw gqlError("Bài nộp không tồn tại", "NOT_FOUND");
      if (submission.issue.clientId !== user.id) throw gqlError("Chỉ khách hàng được yêu cầu sửa", "FORBIDDEN");
      const projection = await tx.escrowProjection.findUnique({ where: { issueId: submission.issueId } });
      if (!projection || projection.phase !== EscrowPhase.FUNDED || projection.client.toLowerCase() !== user.walletAddress.toLowerCase() ||
          submission.status !== SubmissionStatus.SUBMITTED || !submission.deliveryHash || projection.deliveryHash?.toLowerCase() !== submission.deliveryHash.toLowerCase())
        throw gqlError("Bài nộp không còn chờ xem xét", "SUBMISSION_NOT_REVIEWABLE");
      const changed = await tx.submission.update({ where: { id: submission.id }, data: { changesRequested: true, reviewNotes: notes, reviewedAt: new Date() }, include: SUBMISSION_INCLUDE });
      const notification = await createNotificationIdempotent(tx, { userId: submission.developerId, type: "CHANGES_REQUESTED", title: "Khách hàng yêu cầu chỉnh sửa",
        body: notes, link: `/issues/${submission.issueId}`, data: { issueId: submission.issueId, submissionId: submission.id },
        dedupeKey: `changes:${submission.id}:${createHash("sha256").update(notes).digest("hex")}` });
      if (notification) await tx.$executeRaw`SELECT pg_notify(${NOTIFICATION_CREATED_CHANNEL}, ${JSON.stringify({ userId: submission.developerId, id: notification.id })})`;
      return changed;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  },
}));
