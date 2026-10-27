// apps/worker/src/effects/index.ts
// Áp effect của fold lên DB, trong cùng transaction với ChainEvent.
// Nhánh escrow do A4 viết. A3 thêm nhánh `config`, A5 thêm nhánh `dispute`.

import type { Prisma } from "@bloody-roar/database";
import type { EventMeta, FoldEffect } from "@bloody-roar/shared/escrow";

export async function applyFoldEffects(
  tx: Prisma.TransactionClient,
  effects: FoldEffect[],
  meta: EventMeta & { chainEventId: string; escrowIdHash: `0x${string}` },
): Promise<void> {
  for (const effect of effects) {
    switch (effect.kind) {
      // TODO(A4): BE-36 (FUNDED), BE-39b (WORK_SUBMITTED), BE-49a (SETTLEMENT_*), BE-44 (ESCROW_RESOLVED), BE-48 (CLAIMED)
      case "FUNDED":
      case "WORK_SUBMITTED":
      case "SETTLEMENT_PROPOSED":
      case "SETTLEMENT_REVOKED":
      case "ESCROW_RESOLVED":
      case "CLAIMED":
        break;
      default:
        break;
    }
  }
}
