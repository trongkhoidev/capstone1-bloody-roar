// apps/web/src/graphql/modules/escrow/intent.module.ts
// Chữ ký ký quỹ (BE-32) và trạng thái giao dịch (BE-35). Không đặt CONFIRMED: chỉ applier làm,
// sau khi event deposit đã được fold (xem apps/worker/src/effects/escrow.ts).

import { MINUTE_MS } from "@bloody-roar/shared/constants";
import { depositTotal } from "@bloody-roar/shared/money";
import { z } from "zod";
import { IntentStatus, ReservationStatus } from "@bloody-roar/database";
import {
  encodeErc20Approve,
  ESCROW_CONSTANTS,
  recoverFundingIntentSigner,
  type FundingIntentInput,
  type PreparedCall,
  type Hex,
} from "@bloody-roar/shared/escrow";
import { MAX_PAGE_SIZE } from "@bloody-roar/shared";
import { builder } from "../../builder";
import { requireAuth } from "../../context";
import { gqlError, parseOrThrow } from "../../errors";
import { FundingReservationRef } from "./reservation.module";
import { PreparedCallRef } from "./release.module";
import { createPreparedCall, escrowTarget } from "../../../lib/escrow/prepare";
import { readFundingState } from "../../../lib/escrow/funding";


const IntentStatusEnum = builder.enumType(IntentStatus, { name: "IntentStatus" });

export const TransactionIntentRef = builder.prismaObject("TransactionIntent", {
  description: "Escrow transaction signed by the user, tracked from awaiting signature to confirmation",
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
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/, "Invalid signature"),
  nonce: z.string().regex(/^\d+$/, "Nonce must be an integer").max(78),
  intentExpiry: z.string().datetime(),
});

const TxHashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Invalid transaction hash");

const unix = (date: Date) => BigInt(Math.floor(date.getTime() / 1000));

// BE-32: client ký FundingIntent (QĐ-18). Chữ ký phải được recover về đúng ví của client.
builder.mutationField("submitFundingIntent", (t) =>
  t.field({
    description: "Client signs a FundingIntent for the reservation, signing window at most 30 minutes (BE-32)",
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
      if (!reservation) throw gqlError("Reservation not found", "NOT_FOUND");
      if (reservation.clientId !== user.id)
        throw gqlError("Only the client can sign the funding", "FORBIDDEN");

      const now = new Date();
      if (reservation.status !== ReservationStatus.AWAITING_FUNDING || reservation.expiresAt <= now)
        throw gqlError("The reservation is no longer awaiting funding", "RESERVATION_NOT_FUNDABLE");

      const expiry = new Date(input.intentExpiry);
      if (
        expiry <= now ||
        expiry.getTime() > now.getTime() + ESCROW_CONSTANTS.INTENT_MINUTES * MINUTE_MS
      ) {
        throw gqlError("The signing deadline must be within the next 30 minutes", "INTENT_EXPIRY_INVALID");
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
        throw gqlError("Invalid signature", "INVALID_SIGNATURE");
      }
      if (signer.toLowerCase() !== client.walletAddress.toLowerCase())
        throw gqlError("Signature does not match the client's wallet", "INVALID_SIGNATURE");

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
          throw gqlError("This nonce was already used", "NONCE_USED");
        throw error;
      }
    },
  }),
);

const PreparedDepositRef = builder.objectRef<{ steps: PreparedCall[] }>("PreparedEscrowDeposit").implement({
  fields: (t) => ({ steps: t.field({ type: [PreparedCallRef], resolve: (result) => result.steps }) }),
});

builder.mutationField("prepareEscrowDeposit", (t) =>
  t.field({
    type: PreparedDepositRef,
    args: { reservationId: t.arg.id({ required: true }) },
    resolve: async (_root, args, ctx) => {
      const user = requireAuth(ctx);
      const reservation = await ctx.db.fundingReservation.findUnique({ where: { id: String(args.reservationId) } });
      if (!reservation) throw gqlError("Reservation not found", "NOT_FOUND");
      if (reservation.clientId !== user.id) throw gqlError("Only the client can fund the escrow", "FORBIDDEN");
      const now = new Date();
      if (reservation.status !== ReservationStatus.AWAITING_FUNDING || reservation.expiresAt <= now)
        throw gqlError("The reservation is no longer awaiting funding", "RESERVATION_NOT_FUNDABLE");
      if (!reservation.intentSignature || !reservation.intentNonce || !reservation.intentExpiresAt || reservation.intentExpiresAt <= now)
        throw gqlError("FundingIntent is unsigned or has expired", "FUNDING_INTENT_INVALID");
      const target = escrowTarget();
      if (reservation.chainId !== target.chainId || reservation.contractAddress.toLowerCase() !== target.contractAddress.toLowerCase())
        throw gqlError("Reservation does not match the escrow configuration", "ESCROW_CHAIN_MISMATCH");
      const [client, developer] = await Promise.all([
        ctx.db.user.findUniqueOrThrow({ where: { id: reservation.clientId }, select: { walletAddress: true } }),
        ctx.db.user.findUniqueOrThrow({ where: { id: reservation.developerId }, select: { walletAddress: true } }),
      ]);
      const intent: FundingIntentInput = {
        chainId: reservation.chainId, verifyingContract: reservation.contractAddress as Hex, escrowId: reservation.escrowKey,
        client: client.walletAddress as Hex, developer: developer.walletAddress as Hex, token: reservation.tokenAddress as Hex,
        amount: BigInt(reservation.amountRaw.toFixed()), deliveryDeadline: unix(reservation.deliveryDeadline),
        termsHash: reservation.termsHash as Hex, intentExpiry: unix(reservation.intentExpiresAt), nonce: BigInt(reservation.intentNonce),
      };
      if (intent.amount <= 0n) throw gqlError("Invalid escrow amount", "FUNDING_INTENT_INVALID");
      let signer: Hex;
      try { signer = await recoverFundingIntentSigner(intent, reservation.intentSignature as Hex); }
      catch { throw gqlError("Invalid FundingIntent", "FUNDING_INTENT_INVALID"); }
      if (signer.toLowerCase() !== client.walletAddress.toLowerCase() || user.walletAddress.toLowerCase() !== client.walletAddress.toLowerCase())
        throw gqlError("FundingIntent does not match the client's wallet", "FUNDING_INTENT_INVALID");
      const chain = await readFundingState({ chainId: target.chainId, contractAddress: target.contractAddress,
        tokenAddress: reservation.tokenAddress as Hex, clientAddress: client.walletAddress as Hex });
      if (chain.token.toLowerCase() !== reservation.tokenAddress.toLowerCase()) throw gqlError("Token does not match the escrow contract", "INVALID_TOKEN");
      if (chain.paused) throw gqlError("Escrow is paused", "ESCROW_PAUSED");
      if (chain.blockTimestamp >= intent.deliveryDeadline) throw gqlError("The delivery deadline has passed", "DELIVERY_DEADLINE_INVALID");
      const total = depositTotal(intent.amount, ESCROW_CONSTANTS.FEE_BPS);
      if (chain.balance < total) throw gqlError("Insufficient token balance", "INSUFFICIENT_BALANCE");
      const expiry = new Date(Math.min(reservation.expiresAt.getTime(), reservation.intentExpiresAt.getTime(), now.getTime() + ESCROW_CONSTANTS.INTENT_MINUTES * MINUTE_MS));
      return ctx.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM funding_reservations WHERE id = ${reservation.id} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM issues WHERE id = ${reservation.issueId} FOR UPDATE`;
        const fresh = await tx.fundingReservation.findUnique({ where: { id: reservation.id } });
        const issue = await tx.issue.findUnique({ where: { id: reservation.issueId }, select: { status: true, termsVersion: true } });
        if (!fresh || fresh.status !== ReservationStatus.AWAITING_FUNDING || fresh.expiresAt <= new Date() || expiry <= new Date() ||
            fresh.intentSignature !== reservation.intentSignature || fresh.intentNonce !== reservation.intentNonce ||
            fresh.intentExpiresAt?.getTime() !== reservation.intentExpiresAt?.getTime() || fresh.expiresAt.getTime() !== reservation.expiresAt.getTime() || fresh.termsVersion !== reservation.termsVersion ||
            fresh.clientId !== reservation.clientId || fresh.developerId !== reservation.developerId || fresh.issueId !== reservation.issueId ||
            fresh.escrowKey !== reservation.escrowKey || fresh.chainId !== reservation.chainId || fresh.contractAddress !== reservation.contractAddress ||
            fresh.tokenAddress !== reservation.tokenAddress || fresh.amountRaw.toFixed() !== reservation.amountRaw.toFixed() ||
            fresh.deliveryDeadline.getTime() !== reservation.deliveryDeadline.getTime() || fresh.termsHash !== reservation.termsHash ||
            !issue || issue.status !== "AWAITING_FUNDING" || issue.termsVersion !== reservation.termsVersion)
          throw gqlError("The reservation or its terms changed", "RESERVATION_NOT_FUNDABLE");
        const steps: PreparedCall[] = [];
        if (chain.allowance < total) {
          const approvalArgs = { spender: target.contractAddress, amount: total.toString() };
          const approval = await tx.transactionIntent.create({ data: { userId: user.id, issueId: reservation.issueId,
            escrowKey: reservation.escrowKey, chainId: target.chainId, contractAddress: reservation.tokenAddress,
            method: "approve", args: approvalArgs, status: IntentStatus.AWAITING_SIGNATURE, expiresAt: expiry } });
          steps.push({ intentId: approval.id, chainId: target.chainId, to: reservation.tokenAddress as Hex, method: "approve",
            args: approvalArgs, data: encodeErc20Approve(target.contractAddress, total.toString()), value: "0", expiresAt: expiry.toISOString() });
        }
        steps.push(await createPreparedCall(tx, { userId: user.id, issueId: reservation.issueId, escrowKey: reservation.escrowKey,
          method: "deposit", expiresAt: expiry, args: { escrowId: reservation.escrowKey, developer: developer.walletAddress,
            amount: intent.amount.toString(), deliveryDeadline: intent.deliveryDeadline.toString(), termsHash: reservation.termsHash } }));
        return { steps };
      });
    },
  }),
);

// BE-35: sau khi ví gửi giao dịch, ghi txHash. Không đặt CONFIRMED ở đây.
builder.mutationField("recordTransactionSubmitted", (t) =>
  t.field({
    description: "Record the transaction hash after the wallet submitted it (AWAITING_SIGNATURE → SUBMITTED)",
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
        throw gqlError("Transaction not found", "NOT_FOUND");
      if (intent.status !== IntentStatus.AWAITING_SIGNATURE)
        throw gqlError("Transaction is not awaiting a signature", "INTENT_NOT_SUBMITTABLE");
      if (intent.expiresAt <= new Date())
        throw gqlError("Transaction has expired", "INTENT_EXPIRED");

      try {
        const moved = await ctx.db.transactionIntent.updateMany({
          where: { id: intent.id, status: IntentStatus.AWAITING_SIGNATURE },
          data: { status: IntentStatus.SUBMITTED, txHash, submittedAt: new Date() },
        });
        if (moved.count !== 1)
          throw gqlError("Transaction status just changed", "INTENT_NOT_SUBMITTABLE");
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002")
          throw gqlError("This transaction hash was already recorded", "TX_HASH_USED");
        throw error;
      }
      return ctx.db.transactionIntent.findUniqueOrThrow({ where: { id: intent.id } });
    },
  }),
);

builder.queryField("myTransactions", (t) =>
  t.field({
    description: "The user's escrow transactions, newest first",
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
