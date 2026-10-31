// apps/web/src/graphql/modules/escrow/reservation.module.ts
// Chọn người và giữ chỗ ký quỹ (UC-01): BE-23, BE-31, BE-38, BE-41f.
// Chỉ ghi FundingReservation và đổi trạng thái Issue. Không gọi chain.




import {
  ReservationStatus,
  } from "@bloody-roar/database";

import { MAX_PAGE_SIZE } from "@bloody-roar/shared";
import { builder } from "../../builder";
import { requireAuth } from "../../context";






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
    clientWallet: t.string({
      resolve: async (reservation, _args, ctx) =>
        (await ctx.db.user.findUniqueOrThrow({ where: { id: reservation.clientId }, select: { walletAddress: true } })).walletAddress,
    }),
    developerWallet: t.string({
      resolve: async (reservation, _args, ctx) =>
        (await ctx.db.user.findUniqueOrThrow({ where: { id: reservation.developerId }, select: { walletAddress: true } })).walletAddress,
    }),
    escrowKey: t.exposeString("escrowKey"),
    escrowIdHash: t.exposeString("escrowIdHash"),
    status: t.expose("status", { type: ReservationStatusEnum }),
    amountRaw: t.string({ resolve: (reservation) => reservation.amountRaw.toFixed() }),
    deliveryDeadline: t.string({
      resolve: (reservation) => reservation.deliveryDeadline.toISOString(),
    }),
    termsHash: t.exposeString("termsHash"),
    termsVersion: t.exposeInt("termsVersion"),
    chainId: t.exposeInt("chainId"),
    contractAddress: t.exposeString("contractAddress"),
    tokenAddress: t.exposeString("tokenAddress"),
    expiresAt: t.string({ resolve: (reservation) => reservation.expiresAt.toISOString() }),
    createdAt: t.string({ resolve: (reservation) => reservation.createdAt.toISOString() }),
  }),
});

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
