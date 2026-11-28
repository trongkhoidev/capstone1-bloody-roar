// apps/web/src/graphql/modules/escrow/reservation.module.ts
// Chọn người và giữ chỗ ký quỹ (UC-01): BE-23, BE-31, BE-38, BE-41f.
// Chỉ ghi FundingReservation và đổi trạng thái Issue. Không gọi chain.

import { DAY_MS, HOUR_MS, REUSE_PRICE_BPS } from "@bloody-roar/shared/constants";
import { ensureWorkConversation } from "@bloody-roar/database";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  ApplicationStatus,
  IssueStatus,
  Prisma,
  ReservationStatus,
  createNotificationIdempotent,
  type FundingReservation,
  type PrismaClient,
} from "@bloody-roar/database";
import {
  computeTermsHash,
  ESCROW_CONSTANTS,
  keccakUtf8,
  REUSE_LICENCE_TERMS,
  type Hex,
} from "@bloody-roar/shared/escrow";
import { bpsOf, parseTokenAmount } from "@bloody-roar/shared/money";

import { builder } from "../../builder";
import { requireAuth } from "../../context";
import { gqlError, parseOrThrow } from "../../errors";
import { escrowTarget } from "../../../lib/escrow/prepare";
import { readEscrowToken } from "../../../lib/escrow/token";
import { createLogger } from "../../../lib/logger";
import { notifyIssueAccessChanged } from "../../../socket/handlers";

import { FundingReservationRef } from "./reservation.module";

const log = createLogger("reservations");

const SelectDeveloperSchema = z.object({
  issueId: z.string().min(1).max(191),
  applicationId: z.string().min(1).max(191),
  deliveryDeadline: z.string().datetime(),
});

// BE-23: hạn giao hàng ≥ hết hạn reservation (24 giờ) + 48 giờ, và ≤ 180 ngày (QĐ-19)
function assertDeliveryDeadline(deliveryDeadline: Date, now: Date) {
  const earliest = now.getTime() + (ESCROW_CONSTANTS.RESERVATION_HOURS + 48) * HOUR_MS;
  const latest = now.getTime() + ESCROW_CONSTANTS.MAX_DELIVERY_DAYS * DAY_MS;
  const time = deliveryDeadline.getTime();
  if (time < earliest || time > latest) {
    throw gqlError(
      "The delivery deadline must be more than 72 hours away and within 180 days",
      "DELIVERY_DEADLINE_INVALID",
    );
  }
}

// BE-41f: br_<issueId>_<n>, ASCII, tối đa 64 ký tự
function buildEscrowKey(issueId: string, sequence: number): string {
  const key = `br_${issueId}_${sequence}`;
  if (key.length > 64 || !/^[\x21-\x7e]+$/.test(key)) {
    throw gqlError("Could not create an escrow key for this bounty", "ESCROW_KEY_INVALID");
  }
  return key;
}

type TermsIssue = {
  id: string;
  title: string;
  description: string;
  category: string;
  githubRepo: string | null;
  termsVersion: number;
  bountyAmount: Prisma.Decimal;
  token: { address: string; decimals: number };
};

type TermsCriterion = {
  id: string;
  given: string;
  when: string;
  then: string;
  isApproved: boolean;
  testCode?: string | null;
  testFilePath?: string | null;
};

function reservationTermsHash(
  issue: TermsIssue,
  criteria: TermsCriterion[],
  deliveryDeadline: Date,
  amountRaw: bigint,
  reuseOfIssueId: string | null,
): Hex {
  return computeTermsHash({
    issueId: issue.id,
    termsVersion: issue.termsVersion,
    title: issue.title,
    descriptionSha256: createHash("sha256").update(issue.description, "utf8").digest("hex"),
    category: issue.category,
    acceptanceCriteria: criteria.map((criterion) => ({
      id: criterion.id,
      text: `Given ${criterion.given}, when ${criterion.when}, then ${criterion.then}` + (criterion.testCode ? ` | test=${createHash("sha256").update((criterion.testFilePath ?? "") + "\n" + criterion.testCode).digest("hex")}` : ""),
      approved: criterion.isApproved,
    })),
    token: issue.token.address as Hex,
    amountRaw: amountRaw.toString(),
    deliveryDeadline: String(Math.floor(deliveryDeadline.getTime() / 1000)),
    githubRepo: issue.githubRepo ?? "",
    licence: REUSE_LICENCE_TERMS,
    ...(reuseOfIssueId ? { reuseOfIssueId } : {}),
  });
}

// Thông báo lỗi không làm hỏng mutation đã commit; lỗi được ghi log
async function notifyOnce(
  db: PrismaClient,
  input: Parameters<typeof createNotificationIdempotent>[1],
) {
  try {
    await createNotificationIdempotent(db, input);
  } catch (error) {
    log.warn({ error, dedupeKey: input.dedupeKey }, "Could not persist notification");
  }
}

builder.mutationField("selectDeveloper", (t) =>
  t.field({
    description: "Client selects an applicant: creates an AWAITING_FUNDING reservation (BE-23)",
    type: FundingReservationRef,
    args: {
      issueId: t.arg.id({ required: true }),
      applicationId: t.arg.id({ required: true }),
      deliveryDeadline: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      const input = parseOrThrow(SelectDeveloperSchema, {
        issueId: String(args.issueId),
        applicationId: String(args.applicationId),
        deliveryDeadline: args.deliveryDeadline,
      });
      const now = new Date();
      const deliveryDeadline = new Date(input.deliveryDeadline);
      assertDeliveryDeadline(deliveryDeadline, now);

      let result: {
        reservation: FundingReservation;
        issue: { id: string; title: string };
      };
      try {
        result = await ctx.db.$transaction(
          async (tx) => {
            const issue = await tx.issue.findUnique({
              where: { id: input.issueId },
              include: { token: true },
            });
            if (!issue || issue.isDraft) throw gqlError("Bounty not found", "NOT_FOUND");
            if (issue.clientId !== user.id)
              throw gqlError("Only the bounty owner can select an applicant", "FORBIDDEN");
            if (issue.status !== IssueStatus.OPEN)
              throw gqlError("This bounty no longer accepts applicants", "ISSUE_NOT_OPEN");

            const application = await tx.application.findFirst({
              where: {
                id: input.applicationId,
                issueId: issue.id,
                status: ApplicationStatus.PENDING,
              },
            });
            if (!application)
              throw gqlError("This application is not valid for this bounty", "NOT_FOUND");

            const criteria = await tx.testCase.findMany({
              where: { issueId: issue.id },
              select: { id: true, given: true, when: true, then: true, isApproved: true, testCode: true, testFilePath: true },
            });
            if (!criteria.some((criterion) => criterion.isApproved))
              throw gqlError("At least one approved criterion is required", "NO_APPROVED_CRITERIA");

            const sequence = (await tx.fundingReservation.count({ where: { issueId: issue.id } })) + 1;
            const escrowKey = buildEscrowKey(issue.id, sequence);
            const target = escrowTarget();
            if (issue.token.chainId !== target.chainId)
              throw gqlError("Token is not on the active chain", "INVALID_TOKEN");
            const contractToken = await readEscrowToken(target.contractAddress, target.chainId);
            if (contractToken.toLowerCase() !== issue.token.address.toLowerCase())
              throw gqlError("Token does not match the escrow contract", "INVALID_TOKEN");
            const bountyRaw = parseTokenAmount(issue.bountyAmount.toFixed(), issue.token.decimals);
            const amountRaw = application.reuseOfIssueId ? bpsOf(bountyRaw, REUSE_PRICE_BPS) : bountyRaw;

            const reservation = await tx.fundingReservation.create({
              data: {
                issueId: issue.id,
                applicationId: application.id,
                clientId: user.id,
                developerId: application.developerId,
                escrowKey,
                escrowIdHash: keccakUtf8(escrowKey),
                chainId: target.chainId,
                contractAddress: target.contractAddress,
                tokenAddress: issue.token.address,
                amountRaw: amountRaw.toString(),
                deliveryDeadline,
                termsHash: reservationTermsHash(issue, criteria, deliveryDeadline, amountRaw, application.reuseOfIssueId ?? null),
                termsVersion: issue.termsVersion,
                expiresAt: new Date(now.getTime() + ESCROW_CONSTANTS.RESERVATION_HOURS * HOUR_MS),
              },
            });

            const moved = await tx.issue.updateMany({
              where: { id: issue.id, status: IssueStatus.OPEN },
              data: { status: IssueStatus.AWAITING_FUNDING },
            });
            if (moved.count !== 1)
              throw gqlError("Another applicant was just selected for this bounty", "ISSUE_NOT_OPEN");

            await ensureWorkConversation(tx, { id: issue.id, clientId: user.id, developerId: application.developerId });
            return { reservation, issue: { id: issue.id, title: issue.title } };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error) {
          if (error.code === "P2002")
            throw gqlError("This bounty already has an active reservation", "ISSUE_ALREADY_RESERVED");
          if (error.code === "P2034")
            throw gqlError("The bounty status just changed, please try again", "ISSUE_NOT_OPEN");
        }
        throw error;
      }

      await notifyOnce(ctx.db, {
        dedupeKey: `reservation:${result.reservation.id}:FUNDING_REQUIRED`,
        userId: result.reservation.developerId,
        type: "FUNDING_REQUIRED",
        title: "Escrow funding needed",
        body: `The client selected you for “${result.issue.title}”. Funding is due within 24 hours.`,
        actorId: user.id,
        link: `/issues/${result.issue.id}`,
        data: { issueId: result.issue.id, reservationId: result.reservation.id },
      });
      notifyIssueAccessChanged(result.issue.id);
      return result.reservation;
    },
  }),
);

builder.mutationField("cancelReservation", (t) =>
  t.field({
    description: "Client cancels a reservation awaiting funding; the bounty returns to OPEN (BE-38)",
    type: FundingReservationRef,
    args: { reservationId: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      const reservation = await ctx.db.fundingReservation.findUnique({
        where: { id: String(args.reservationId) },
      });
      if (!reservation) throw gqlError("Reservation not found", "NOT_FOUND");
      if (reservation.clientId !== user.id)
        throw gqlError("Only the client can cancel the reservation", "FORBIDDEN");

      const cancelled = await ctx.db.$transaction(async (tx) => {
        const cancelled = await tx.fundingReservation.updateMany({
          where: { id: reservation.id, status: ReservationStatus.AWAITING_FUNDING },
          data: { status: ReservationStatus.CANCELLED },
        });
        if (cancelled.count !== 1)
          throw gqlError("The reservation is no longer awaiting funding", "RESERVATION_NOT_CANCELLABLE");
        await tx.issue.updateMany({
          where: { id: reservation.issueId, status: IssueStatus.AWAITING_FUNDING },
          data: { status: IssueStatus.OPEN },
        });
        return tx.fundingReservation.findUniqueOrThrow({ where: { id: reservation.id } });
      });
      notifyIssueAccessChanged(cancelled.issueId);
      return cancelled;
    },
  }),
);
