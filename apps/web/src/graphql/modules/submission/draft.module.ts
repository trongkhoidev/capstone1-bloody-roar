import { createHash, randomUUID } from "node:crypto";
import { createNotificationIdempotent, NOTIFICATION_CREATED_CHANNEL, postSystemMessage, EscrowPhase, IssueStatus, Prisma, SubmissionStatus } from "@bloody-roar/database";
import { computeDeliveryHash } from "@bloody-roar/shared/escrow";
import { z } from "zod";
import { builder } from "../../builder";
import { requireAuth, type GraphQLContext } from "../../context";
import { readChainTime } from "../../../lib/escrow/chain-time";
import { gqlError, parseOrThrow } from "../../errors";
import { SubmissionRef, SUBMISSION_INCLUDE } from "./submission.module";
import { PreparedCallRef } from "../escrow/release.module";
import { createPreparedCall, escrowTarget } from "../../../lib/escrow/prepare";
import { guardMessage } from "../../../ai/guard/service";
import { getSocketIOOrNull, toMessagePayload } from "../../../socket/handlers";

import { assertSubmissionTestsPassed } from "../../../lib/test-runs";

const draftSchema = z.object({
  issueId: z.string().min(1),
  submissionId: z.string().min(1).optional(),
  description: z.string().trim().max(4000).default(""),
  pullRequestUrl: z.string().url().max(500).or(z.literal("")).default(""),
  commitSha: z.string().regex(/^(?:[a-fA-F0-9]{40}|)$/).default(""),
  attachmentIds: z.array(z.string().min(1)).max(20).default([]),
}).refine((value) => Boolean(value.description || value.pullRequestUrl || value.commitSha || value.attachmentIds.length), {
  message: "Provide the submission content",
}).refine((value) => new Set(value.attachmentIds).size === value.attachmentIds.length, {
  message: "Duplicate attachment",
});

async function deliveryClock(ctx: GraphQLContext, issueId: string, userId: string) {
  const issue = await ctx.db.issue.findUnique({ where: { id: issueId }, select: { developerId: true } });
  if (!issue) throw gqlError("Bounty not found", "NOT_FOUND");
  if (issue.developerId !== userId) throw gqlError("Only the assigned developer can create a draft", "FORBIDDEN");
  const projection = await ctx.db.escrowProjection.findUnique({ where: { issueId } });
  if (!projection || projection.phase !== EscrowPhase.FUNDED) throw gqlError("This bounty is not accepting submissions", "INVALID_PHASE");
  const target = escrowTarget();
  if (projection.chainId !== target.chainId || projection.contractAddress.toLowerCase() !== target.contractAddress.toLowerCase())
    throw gqlError("Escrow does not match the configured contract", "ESCROW_CHAIN_MISMATCH");
  return { now: await readChainTime(projection.chainId), id: projection.id, chainId: projection.chainId, contractAddress: projection.contractAddress };
}

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
    const clock = await deliveryClock(ctx, input.issueId, user.id);
    return ctx.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM issues WHERE id = ${input.issueId} FOR UPDATE`;
      const issue = await tx.issue.findUnique({ where: { id: input.issueId }, select: { id: true, developerId: true, status: true, githubRepo: true } });
      if (!issue) throw gqlError("Bounty not found", "NOT_FOUND");
      if (issue.developerId !== user.id) throw gqlError("Only the assigned developer can create a draft", "FORBIDDEN");
      const projection = await tx.escrowProjection.findUnique({ where: { issueId: issue.id } });
      if (issue.status !== IssueStatus.IN_PROGRESS || !projection || projection.phase !== EscrowPhase.FUNDED || projection.developer.toLowerCase() !== user.walletAddress.toLowerCase())
        throw gqlError("This bounty is not accepting submissions", "INVALID_PHASE");
      if (projection.id !== clock.id || projection.chainId !== clock.chainId || projection.contractAddress.toLowerCase() !== clock.contractAddress.toLowerCase())
        throw gqlError("The escrow just changed", "ESCROW_CHAIN_MISMATCH");
      if (clock.now > projection.deliveryDeadline) throw gqlError("The delivery deadline has passed", "DEADLINE_PASSED");
      if (input.pullRequestUrl) {
        const pr = new URL(input.pullRequestUrl);
        if (pr.protocol !== "https:" || pr.hostname !== "github.com" || !/^\/[^/]+\/[^/]+\/pull\/\d+\/?$/.test(pr.pathname))
          throw gqlError("Invalid pull request URL", "INVALID_PULL_REQUEST_URL");
        if (issue.githubRepo) {
          const repo = new URL(issue.githubRepo);
          const normalize = (path: string) => path.replace(/\.git\/?$/, "").replace(/\/$/, "").toLowerCase();
          if (repo.hostname !== "github.com" || normalize(repo.pathname) !== normalize(pr.pathname.split("/").slice(0, 3).join("/")))
            throw gqlError("The pull request is not in the bounty's repository", "PULL_REQUEST_REPOSITORY_MISMATCH");
        }
      }
      const existing = input.submissionId ? await tx.submission.findUnique({ where: { id: input.submissionId } }) : null;
      if (input.submissionId && (!existing || existing.issueId !== issue.id || existing.developerId !== user.id))
        throw gqlError("Draft not found", "NOT_FOUND");
      if (existing && existing.status !== SubmissionStatus.DRAFT) throw gqlError("Only drafts can be edited", "SUBMISSION_NOT_DRAFT");
      const prepared = existing?.deliveryHash && await tx.transactionIntent.findFirst({ where: { issueId: issue.id, method: "submitWork", args: { path: ["deliveryHash"], equals: existing.deliveryHash } }, select: { id: true } });
      const attachments = await tx.attachment.findMany({ where: { id: { in: input.attachmentIds }, issueId: issue.id, uploaderId: user.id, purpose: "DELIVERY", status: "ATTACHED" } });
      if (attachments.length !== input.attachmentIds.length || attachments.some((file) => !file.sha256 || !/^[a-fA-F0-9]{64}$/.test(file.sha256)))
        throw gqlError("Invalid delivery file", "INVALID_ATTACHMENT");
      const id = existing && !prepared ? existing.id : randomUUID();
      const byId = new Map(attachments.map((file) => [file.id, file]));
      const description = input.description ? (await guardMessage(input.description, { issueId: issue.id })).content : "";
      const manifest = { issueId: issue.id, submissionId: id,
        descriptionSha256: createHash("sha256").update(description, "utf8").digest("hex"),
        prUrl: input.pullRequestUrl, commitSha: input.commitSha,
        attachments: input.attachmentIds.map((fileId) => { const file = byId.get(fileId)!; return { key: file.fileUrl, sha256: file.sha256!, mime: file.fileMime, size: file.fileSize }; }),
      };
      const data = { description: description || null, pullRequestUrl: input.pullRequestUrl || null, commitSha: input.commitSha || null,
        manifest, deliveryHash: computeDeliveryHash(manifest), status: SubmissionStatus.DRAFT };
      const include = SUBMISSION_INCLUDE;
      if (existing && !prepared) return tx.submission.update({ where: { id }, data, include });
      await tx.submission.updateMany({
        where: { issueId: issue.id, developerId: user.id, status: SubmissionStatus.DRAFT },
        data: { status: SubmissionStatus.SUPERSEDED, supersededAt: new Date() },
      });
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
    const submission = await ctx.db.submission.findUnique({ where: { id } });
    if (!submission || submission.developerId !== user.id) throw gqlError("Draft not found", "NOT_FOUND");
    const clock = await deliveryClock(ctx, submission.issueId, user.id);
    return ctx.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM issues WHERE id = ${submission.issueId} FOR UPDATE`;
      const fresh = await tx.submission.findUnique({ where: { id } });
      const issue = await tx.issue.findUnique({ where: { id: submission.issueId }, select: { developerId: true, status: true } });
      const projection = await tx.escrowProjection.findUnique({ where: { issueId: submission.issueId } });
      if (!fresh || fresh.issueId !== submission.issueId || fresh.developerId !== user.id || fresh.status !== SubmissionStatus.DRAFT || !fresh.deliveryHash || !fresh.manifest)
        throw gqlError("Invalid draft", "SUBMISSION_NOT_DRAFT");
      if (!issue || issue.developerId !== user.id || issue.status !== IssueStatus.IN_PROGRESS || !projection || !projection.escrowKey || projection.phase !== EscrowPhase.FUNDED)
        throw gqlError("This bounty is not accepting submissions", "INVALID_PHASE");
      if (projection.developer.toLowerCase() !== user.walletAddress.toLowerCase()) throw gqlError("Developer wallet does not match", "FORBIDDEN");
      const target = escrowTarget();
      if (projection.chainId !== target.chainId || projection.contractAddress.toLowerCase() !== target.contractAddress.toLowerCase())
        throw gqlError("Escrow does not match the configured contract", "ESCROW_CHAIN_MISMATCH");
      if (projection.id !== clock.id || projection.chainId !== clock.chainId || projection.contractAddress.toLowerCase() !== clock.contractAddress.toLowerCase())
        throw gqlError("The escrow just changed", "ESCROW_CHAIN_MISMATCH");
      if (clock.now > projection.deliveryDeadline) throw gqlError("The delivery deadline has passed", "DEADLINE_PASSED");
      await assertSubmissionTestsPassed(tx, fresh);
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
    for (let attempt = 0; ; attempt++) {
      try {
        const { changed, message } = await ctx.db.$transaction(async (tx) => {
          const initial = await tx.submission.findUnique({ where: { id: String(args.submissionId) } });
          if (!initial) throw gqlError("Submission not found", "NOT_FOUND");
          await tx.$queryRaw`SELECT id FROM issues WHERE id = ${initial.issueId} FOR UPDATE`;
          const submission = await tx.submission.findUnique({ where: { id: initial.id }, include: { issue: true } });
          if (!submission) throw gqlError("Submission not found", "NOT_FOUND");
          if (submission.issue.clientId !== user.id) throw gqlError("Only the client can request changes", "FORBIDDEN");
          const projection = await tx.escrowProjection.findUnique({ where: { issueId: submission.issueId } });
          if (!projection || projection.phase !== EscrowPhase.FUNDED || projection.client.toLowerCase() !== user.walletAddress.toLowerCase() ||
              submission.status !== SubmissionStatus.SUBMITTED || !submission.deliveryHash || projection.deliveryHash?.toLowerCase() !== submission.deliveryHash.toLowerCase())
            throw gqlError("The submission is no longer awaiting review", "SUBMISSION_NOT_REVIEWABLE");
          const notesHash = createHash("sha256").update(notes).digest("hex");
          const changed = await tx.submission.update({ where: { id: submission.id }, data: { changesRequested: true, reviewNotes: notes, reviewedAt: new Date() }, include: SUBMISSION_INCLUDE });
          const notification = await createNotificationIdempotent(tx, { userId: submission.developerId, type: "CHANGES_REQUESTED", title: "The client requested changes",
            body: notes, link: `/issues/${submission.issueId}`, data: { issueId: submission.issueId, submissionId: submission.id },
            dedupeKey: `changes:${submission.id}:${notesHash}` });
          if (notification) await tx.$executeRaw`SELECT pg_notify(${NOTIFICATION_CREATED_CHANNEL}, ${JSON.stringify({ userId: submission.developerId, id: notification.id })})`;
          const message = await postSystemMessage(tx, submission.issue, user.id, "Changes requested", `changes:${submission.id}:${notesHash}:sys`);
          return { changed, message };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        const io = getSocketIOOrNull();
        if (message && io) {
          io.to(`conv:${message.conversationId}`).emit("message:new", toMessagePayload(message, message.sender));
          io.to(`user:${changed.developerId}`).emit("inbox:update", { conversationId: message.conversationId, lastMessageAt: message.createdAt.toISOString(), unreadDelta: 1 });
        }
        return changed;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt >= 4) throw error;
        await new Promise((resolve) => setTimeout(resolve, 20 * 2 ** attempt));
      }
    }
  },
}));
