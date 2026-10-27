// packages/shared/src/escrow/reservation-check.ts
// BE-66c, phần thuần: deposit có khớp reservation không. Trả về các lý do lệch. Mảng rỗng nghĩa là khớp.
import type { Hex } from "./types";

export type DepositFact = {
  client: Hex;
  developer: Hex;
  amount: bigint;
  deliveryDeadline: bigint;
  termsHash: Hex;
  token: Hex;
};

export type ReservationFacts = DepositFact;

function same(a: Hex, b: Hex): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function checkDepositAgainstReservation(deposit: DepositFact, reservation: ReservationFacts): string[] {
  const reasons: string[] = [];
  if (!same(deposit.client, reservation.client)) reasons.push("client");
  if (!same(deposit.developer, reservation.developer)) reasons.push("developer");
  if (deposit.amount !== reservation.amount) reasons.push("amount");
  if (deposit.deliveryDeadline !== reservation.deliveryDeadline) reasons.push("deadline");
  if (!same(deposit.termsHash, reservation.termsHash)) reasons.push("termsHash");
  if (!same(deposit.token, reservation.token)) reasons.push("token");
  return reasons;
}
