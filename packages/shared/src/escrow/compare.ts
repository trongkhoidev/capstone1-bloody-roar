// packages/shared/src/escrow/compare.ts
// Đối chiếu projection với chain (BE-66, phần thuần). Không gọi RPC: người gọi đọc chain ở safe block rồi truyền vào.
import type { DisputeState, EscrowPhase, EscrowResolutionKind, EscrowState, Hex, SettlementState } from "./types";

// Như contract trả về, nhưng hash bằng 0 đã đổi thành null, và settlement/dispute rỗng đã đổi thành null.
export type OnchainEscrowView = {
  client: Hex;
  developer: Hex;
  arbiter: Hex;
  feeRecipient: Hex;
  amount: bigint;
  depositedAt: bigint;
  deliveryDeadline: bigint;
  termsHash: Hex;
  deliveryHash: Hex | null;
  phase: EscrowPhase;
  resolutionKind: EscrowResolutionKind;
  settlement: SettlementState | null;
  dispute: DisputeState | null;
};

export type ReconciliationDiff = { field: string; projection: string; onchain: string };

export type ClaimableRow = { recipient: Hex; amount: bigint };

// So sánh theo dạng JSON. Địa chỉ và hash không phân biệt hoa thường, bigint thành chuỗi.
function canon(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item === "bigint") return item.toString();
    if (typeof item === "string") return item.toLowerCase();
    return item;
  });
}

export function compareProjectionWithChain(projection: EscrowState, onchain: OnchainEscrowView): ReconciliationDiff[] {
  const pairs: Array<[string, unknown, unknown]> = [
    ["client", projection.client, onchain.client],
    ["developer", projection.developer, onchain.developer],
    ["arbiter", projection.arbiter, onchain.arbiter],
    ["feeRecipient", projection.feeRecipient, onchain.feeRecipient],
    ["amount", projection.amount, onchain.amount],
    ["depositedAt", projection.depositedAt, onchain.depositedAt],
    ["deliveryDeadline", projection.deliveryDeadline, onchain.deliveryDeadline],
    ["termsHash", projection.termsHash, onchain.termsHash],
    ["deliveryHash", projection.deliveryHash, onchain.deliveryHash],
    ["phase", projection.phase, onchain.phase],
    ["resolutionKind", projection.resolutionKind, onchain.resolutionKind],
    ["settlement", projection.settlement, onchain.settlement],
    ["dispute", projection.dispute, onchain.dispute],
  ];
  return pairs.flatMap(([field, mine, theirs]) =>
    canon(mine) === canon(theirs) ? [] : [{ field, projection: canon(mine), onchain: canon(theirs) }],
  );
}

// Công thức accountedBalance() của contract: principal chưa resolve cộng với claimable chưa claim.
export function accountedBalance(states: EscrowState[], claimables: ClaimableRow[]): bigint {
  const unresolved = states.reduce((sum, state) => (state.phase === "RESOLVED" ? sum : sum + state.amount), 0n);
  const claimable = claimables.reduce((sum, row) => sum + row.amount, 0n);
  return unresolved + claimable;
}

// isSolvent() của contract: số dư token của contract phải đủ phủ accountedBalance().
export function isSolvent(tokenBalance: bigint, accounted: bigint): boolean {
  return tokenBalance >= accounted;
}
