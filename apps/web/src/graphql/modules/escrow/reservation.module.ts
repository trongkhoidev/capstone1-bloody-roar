// apps/web/src/graphql/modules/escrow/reservation.module.ts
// Chọn người và giữ chỗ ký quỹ (UC-01): BE-23, BE-31, BE-38, BE-41f.
// Chỉ ghi FundingReservation và đổi trạng thái Issue. Không gọi chain.

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
  type Hex,
} from "@bloody-roar/shared/escrow";
import { parseTokenAmount } from "@bloody-roar/shared/money";
import { MAX_PAGE_SIZE } from "@bloody-roar/shared";
import { builder } from "../../builder";
import { requireAuth } from "../../context";
import { gqlError, parseOrThrow } from "../../errors";
import { escrowTarget } from "../../../lib/escrow/prepare";
import { createLogger } from "../../../lib/logger";

const log = createLogger("reservations");
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const ReservationStatusEnum = builder.enumType(ReservationStatus, {
  name: "ReservationStatus",
});

export const FundingReservationRef = builder.prismaObject("FundingReservation", {
  description: "Chỗ giữ ký quỹ cho một ứng viên đã được chọn",
  fields: (t) => ({
    id: t.exposeID("id"),
    issueId: t.exposeString("issueId"),
    applicationId: t.exposeString("applicationId"),
    clientId: t.exposeString("clientId"),
    developerId: t.exposeString("developerId"),
    escrowKey: t.exposeString("escrowKey"),
    escrowIdHash: t.exposeString("escrowIdHash"),
    status: t.expose("status", { type: ReservationStatusEnum }),
    amountRaw: t.string({ resolve: (reservation) => reservation.amountRaw.toFixed() }),
    deliveryDeadline: t.string({
      resolve: (reservation) => reservation.deliveryDeadline.toISOString(),
    }),
    termsHash: t.exposeString("termsHash"),
    termsVersion: t.exposeInt("termsVersion"),
    expiresAt: t.string({ resolve: (reservation) => reservation.expiresAt.toISOString() }),
    createdAt: t.string({ resolve: (reservation) => reservation.createdAt.toISOString() }),
  }),
});

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
      "Hạn giao hàng phải sau 72 giờ và không quá 180 ngày",
      "DELIVERY_DEADLINE_INVALID",
    );
  }
}

// BE-41f: br_<issueId>_<n>, ASCII, tối đa 64 ký tự
function buildEscrowKey(issueId: string, sequence: number): string {
  const key = `br_${issueId}_${sequence}`;
  if (key.length > 64 || !/^[\x21-\x7e]+$/.test(key)) {
    throw gqlError("Không tạo được khóa escrow cho bài toán này", "ESCROW_KEY_INVALID");
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
};

// BE-39, QĐ-22: hash này được deposit() và effect FUNDED so khớp với reservation
function reservationTermsHash(
  issue: TermsIssue,
  criteria: TermsCriterion[],
  deliveryDeadline: Date,
): Hex {
  return computeTermsHash({
    issueId: issue.id,
    termsVersion: issue.termsVersion,
    title: issue.title,
    descriptionSha256: createHash("sha256").update(issue.description, "utf8").digest("hex"),
    category: issue.category,
    acceptanceCriteria: criteria.map((criterion) => ({
      id: criterion.id,
      text: `Given ${criterion.given}, when ${criterion.when}, then ${criterion.then}`,
      approved: criterion.isApproved,
    })),
    token: issue.token.address as Hex,
    amountRaw: parseTokenAmount(issue.bountyAmount.toFixed(), issue.token.decimals).toString(),
    deliveryDeadline: String(Math.floor(deliveryDeadline.getTime() / 1000)),
    githubRepo: issue.githubRepo ?? "",
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
    description: "Client chọn một ứng viên: tạo reservation AWAITING_FUNDING (BE-23)",
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
            if (!issue || issue.isDraft) throw gqlError("Bài toán không tồn tại", "NOT_FOUND");
            if (issue.clientId !== user.id)
              throw gqlError("Chỉ chủ bài toán mới chọn được ứng viên", "FORBIDDEN");
            if (issue.status !== IssueStatus.OPEN)
              throw gqlError("Bài toán không còn nhận ứng viên", "ISSUE_NOT_OPEN");

            const application = await tx.application.findFirst({
              where: {
                id: input.applicationId,
                issueId: issue.id,
                status: ApplicationStatus.PENDING,
              },
            });
            if (!application)
              throw gqlError("Ứng tuyển không hợp lệ cho bài toán này", "NOT_FOUND");

            const criteria = await tx.testCase.findMany({
              where: { issueId: issue.id },
              select: { id: true, given: true, when: true, then: true, isApproved: true },
            });
            if (!criteria.some((criterion) => criterion.isApproved))
              throw gqlError("Cần ít nhất một tiêu chí đã được duyệt", "NO_APPROVED_CRITERIA");

            const sequence = (await tx.fundingReservation.count({ where: { issueId: issue.id } })) + 1;
            const escrowKey = buildEscrowKey(issue.id, sequence);
            const target = escrowTarget();
            const amountRaw = parseTokenAmount(issue.bountyAmount.toFixed(), issue.token.decimals);

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
                termsHash: reservationTermsHash(issue, criteria, deliveryDeadline),
                termsVersion: issue.termsVersion,
                expiresAt: new Date(now.getTime() + ESCROW_CONSTANTS.RESERVATION_HOURS * HOUR_MS),
              },
            });

            const moved = await tx.issue.updateMany({
              where: { id: issue.id, status: IssueStatus.OPEN },
              data: { status: IssueStatus.AWAITING_FUNDING },
            });
            if (moved.count !== 1)
              throw gqlError("Bài toán vừa được chọn ứng viên khác", "ISSUE_NOT_OPEN");

            return { reservation, issue: { id: issue.id, title: issue.title } };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error) {
          if (error.code === "P2002")
            throw gqlError("Bài toán đã có reservation đang hoạt động", "ISSUE_ALREADY_RESERVED");
          if (error.code === "P2034")
            throw gqlError("Trạng thái bài toán vừa đổi, vui lòng thử lại", "ISSUE_NOT_OPEN");
        }
        throw error;
      }

      await notifyOnce(ctx.db, {
        dedupeKey: `reservation:${result.reservation.id}:FUNDING_REQUIRED`,
        userId: result.reservation.developerId,
        type: "FUNDING_REQUIRED",
        title: "Cần nạp ký quỹ",
        body: `Khách hàng đã chọn bạn cho “${result.issue.title}”. Hãy nạp ký quỹ trong 24 giờ.`,
        actorId: user.id,
        link: `/issues/${result.issue.id}`,
        data: { issueId: result.issue.id, reservationId: result.reservation.id },
      });
      return result.reservation;
    },
  }),
);

builder.queryField("reservation", (t) =>
  t.field({
    description: "Reservation đang hoạt động của một bài toán (chỉ client hoặc developer)",
    type: FundingReservationRef,
    nullable: true,
    args: { issueId: t.arg.id({ required: true }) },
    resolve: (_root, args, ctx) => {
      const user = requireAuth(ctx);
      return ctx.db.fundingReservation.findFirst({
        where: {
          issueId: String(args.issueId),
          status: { in: [ReservationStatus.AWAITING_FUNDING, ReservationStatus.FUNDED] },
          OR: [{ clientId: user.id }, { developerId: user.id }],
        },
        orderBy: { createdAt: "desc" },
      });
    },
  }),
);

builder.queryField("myReservations", (t) =>
  t.field({
    description: "Reservation mà người dùng là client hoặc developer, mới nhất trước",
    type: [FundingReservationRef],
    resolve: (_root, _args, ctx) => {
      const user = requireAuth(ctx);
      return ctx.db.fundingReservation.findMany({
        where: { OR: [{ clientId: user.id }, { developerId: user.id }] },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: MAX_PAGE_SIZE,
      });
    },
  }),
);

builder.mutationField("cancelReservation", (t) =>
  t.field({
    description: "Client hủy reservation đang chờ nạp ký quỹ; bài toán về OPEN (BE-38)",
    type: FundingReservationRef,
    args: { reservationId: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      const reservation = await ctx.db.fundingReservation.findUnique({
        where: { id: String(args.reservationId) },
      });
      if (!reservation) throw gqlError("Reservation không tồn tại", "NOT_FOUND");
      if (reservation.clientId !== user.id)
        throw gqlError("Chỉ khách hàng mới hủy được reservation", "FORBIDDEN");

      return ctx.db.$transaction(async (tx) => {
        const cancelled = await tx.fundingReservation.updateMany({
          where: { id: reservation.id, status: ReservationStatus.AWAITING_FUNDING },
          data: { status: ReservationStatus.CANCELLED },
        });
        if (cancelled.count !== 1)
          throw gqlError("Reservation không còn chờ nạp ký quỹ", "RESERVATION_NOT_CANCELLABLE");
        await tx.issue.updateMany({
          where: { id: reservation.issueId, status: IssueStatus.AWAITING_FUNDING },
          data: { status: IssueStatus.OPEN },
        });
        return tx.fundingReservation.findUniqueOrThrow({ where: { id: reservation.id } });
      });
    },
  }),
);
