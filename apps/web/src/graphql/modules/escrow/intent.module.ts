// apps/web/src/graphql/modules/escrow/intent.module.ts
// Chữ ký ký quỹ (BE-32) và trạng thái giao dịch (BE-35). Không đặt CONFIRMED: chỉ applier làm,
// sau khi event deposit đã được fold (xem apps/worker/src/effects/escrow.ts).

import { z } from "zod";
import { IntentStatus, ReservationStatus } from "@bloody-roar/database";
import {
  ESCROW_CONSTANTS,
  recoverFundingIntentSigner,
  type FundingIntentInput,
  type Hex,
} from "@bloody-roar/shared/escrow";
import { MAX_PAGE_SIZE } from "@bloody-roar/shared";
import { builder } from "../../builder";
import { requireAuth } from "../../context";
import { gqlError, parseOrThrow } from "../../errors";
import { FundingReservationRef } from "./reservation.module";

const MINUTE_MS = 60_000;

const IntentStatusEnum = builder.enumType(IntentStatus, { name: "IntentStatus" });

export const TransactionIntentRef = builder.prismaObject("TransactionIntent", {
  description: "Giao dịch escrow do người dùng ký, theo dõi từ lúc chờ ký đến khi xác nhận",
  fields: (t) => ({
    id: t.exposeID("id"),
    method: t.exposeString("method"),
    status: t.expose("status", { type: IntentStatusEnum }),
    issueId: t.exposeString("issueId", { nullable: true }),
    escrowKey: t.exposeString("escrowKey", { nullable: true }),
    txHash: t.exposeString("txHash", { nullable: true }),
    failureReason: t.exposeString("failureReason", { nullable: true }),
    expiresAt: t.string({ resolve: (intent) => intent.expiresAt.toISOString() }),
    createdAt: t.string({ resolve: (intent) => intent.createdAt.toISOString() }),
  }),
});

const SubmitFundingIntentSchema = z.object({
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/, "Chữ ký không hợp lệ"),
  nonce: z.string().regex(/^\d+$/, "Nonce phải là số nguyên").max(78),
  intentExpiry: z.string().datetime(),
});

const TxHashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Mã giao dịch không hợp lệ");

const unix = (date: Date) => BigInt(Math.floor(date.getTime() / 1000));

// BE-32: client ký FundingIntent (QĐ-18). Chữ ký phải được recover về đúng ví của client.
builder.mutationField("submitFundingIntent", (t) =>
  t.field({
    description: "Client ký FundingIntent cho reservation, hạn ký tối đa 30 phút (BE-32)",
    type: FundingReservationRef,
    args: {
      reservationId: t.arg.id({ required: true }),
      signature: t.arg.string({ required: true }),
      nonce: t.arg.string({ required: true }),
      intentExpiry: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      const input = parseOrThrow(SubmitFundingIntentSchema, {
        signature: args.signature,
        nonce: args.nonce,
        intentExpiry: args.intentExpiry,
      });
      const reservation = await ctx.db.fundingReservation.findUnique({
        where: { id: String(args.reservationId) },
      });
      if (!reservation) throw gqlError("Reservation không tồn tại", "NOT_FOUND");
      if (reservation.clientId !== user.id)
        throw gqlError("Chỉ khách hàng mới ký được ký quỹ", "FORBIDDEN");

      const now = new Date();
      if (reservation.status !== ReservationStatus.AWAITING_FUNDING || reservation.expiresAt <= now)
        throw gqlError("Reservation không còn chờ nạp ký quỹ", "RESERVATION_NOT_FUNDABLE");

      const expiry = new Date(input.intentExpiry);
      if (
        expiry <= now ||
        expiry.getTime() > now.getTime() + ESCROW_CONSTANTS.INTENT_MINUTES * MINUTE_MS
      ) {
        throw gqlError("Hạn ký phải trong vòng 30 phút tới", "INTENT_EXPIRY_INVALID");
      }

      const [client, developer] = await Promise.all([
        ctx.db.user.findUniqueOrThrow({
          where: { id: reservation.clientId },
          select: { walletAddress: true },
        }),
        ctx.db.user.findUniqueOrThrow({
          where: { id: reservation.developerId },
          select: { walletAddress: true },
        }),
      ]);
      // Các trường lấy từ reservation, đúng với thứ client thấy khi ký
      const intent: FundingIntentInput = {
        chainId: reservation.chainId,
        verifyingContract: reservation.contractAddress as Hex,
        escrowId: reservation.escrowKey,
        client: client.walletAddress as Hex,
        developer: developer.walletAddress as Hex,
        token: reservation.tokenAddress as Hex,
        amount: BigInt(reservation.amountRaw.toFixed()),
        deliveryDeadline: unix(reservation.deliveryDeadline),
        termsHash: reservation.termsHash as Hex,
        intentExpiry: unix(expiry),
        nonce: BigInt(input.nonce),
      };

      let signer: Hex;
      try {
        signer = await recoverFundingIntentSigner(intent, input.signature as Hex);
      } catch {
        throw gqlError("Chữ ký không hợp lệ", "INVALID_SIGNATURE");
      }
      if (signer.toLowerCase() !== client.walletAddress.toLowerCase())
        throw gqlError("Chữ ký không khớp ví của khách hàng", "INVALID_SIGNATURE");

      try {
        return await ctx.db.fundingReservation.update({
          where: { id: reservation.id },
          data: {
            intentSignature: input.signature,
            intentNonce: input.nonce,
            intentExpiresAt: expiry,
          },
        });
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002")
          throw gqlError("Nonce này đã được dùng", "NONCE_USED");
        throw error;
      }
    },
  }),
);

// BE-35: sau khi ví gửi giao dịch, ghi txHash. Không đặt CONFIRMED ở đây.
builder.mutationField("recordTransactionSubmitted", (t) =>
  t.field({
    description: "Ghi mã giao dịch sau khi ví đã gửi lên chain (AWAITING_SIGNATURE → SUBMITTED)",
    type: TransactionIntentRef,
    args: {
      intentId: t.arg.id({ required: true }),
      txHash: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      const txHash = parseOrThrow(TxHashSchema, args.txHash).toLowerCase();
      const intent = await ctx.db.transactionIntent.findUnique({
        where: { id: String(args.intentId) },
      });
      if (!intent || intent.userId !== user.id)
        throw gqlError("Giao dịch không tồn tại", "NOT_FOUND");
      if (intent.status !== IntentStatus.AWAITING_SIGNATURE)
        throw gqlError("Giao dịch không ở trạng thái chờ ký", "INTENT_NOT_SUBMITTABLE");
      if (intent.expiresAt <= new Date())
        throw gqlError("Giao dịch đã hết hạn", "INTENT_EXPIRED");

      try {
        const moved = await ctx.db.transactionIntent.updateMany({
          where: { id: intent.id, status: IntentStatus.AWAITING_SIGNATURE },
          data: { status: IntentStatus.SUBMITTED, txHash, submittedAt: new Date() },
        });
        if (moved.count !== 1)
          throw gqlError("Giao dịch vừa đổi trạng thái", "INTENT_NOT_SUBMITTABLE");
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002")
          throw gqlError("Mã giao dịch này đã được ghi nhận", "TX_HASH_USED");
        throw error;
      }
      return ctx.db.transactionIntent.findUniqueOrThrow({ where: { id: intent.id } });
    },
  }),
);

builder.queryField("myTransactions", (t) =>
  t.field({
    description: "Giao dịch escrow của người dùng, mới nhất trước",
    type: [TransactionIntentRef],
    resolve: (_root, _args, ctx) => {
      const user = requireAuth(ctx);
      return ctx.db.transactionIntent.findMany({
        where: { userId: user.id },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: MAX_PAGE_SIZE,
      });
    },
  }),
);
