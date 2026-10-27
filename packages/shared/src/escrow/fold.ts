// packages/shared/src/escrow/fold.ts
// Hàm thuần: không I/O, không đọc env. Quy tắc suy ra từ BloodyRoarEscrow.sol.
import type { DecodedEscrowEvent, EscrowState, EventMeta, FoldEffect } from "./types";

// state là null với event không thuộc escrow nào (Claimed, Paused, governance). Khi đó state trả về là đầu vào, không đổi.
export type FoldResult = { state: EscrowState | null; effects: FoldEffect[] };

export function foldEscrowEvent(
  state: EscrowState | null,
  event: DecodedEscrowEvent,
  meta: EventMeta,
): FoldResult {
  throw new Error("not implemented");
}
