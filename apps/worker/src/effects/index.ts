// apps/worker/src/effects/index.ts
// Áp effect của fold lên DB, trong cùng transaction với ChainEvent.
// Nhánh escrow do A4 viết ở escrow.ts. A3 thêm nhánh `config`, A5 thêm nhánh `dispute`.

import type { Prisma } from "@bloody-roar/database";
import type { FoldEffect } from "@bloody-roar/shared/escrow";
import { applyFunded, type EffectMeta } from "./escrow";

export async function applyFoldEffects(
  tx: Prisma.TransactionClient,
  effects: FoldEffect[],
  meta: EffectMeta,
): Promise<void> {
  for (const effect of effects) {
    switch (effect.kind) {
      case "FUNDED":
        await applyFunded(tx, effect, meta);
        break;
      // TODO(A4): WORK_SUBMITTED (BE-39b), SETTLEMENT_PROPOSED/REVOKED (BE-49a), ESCROW_RESOLVED (BE-44), CLAIMED (BE-48)
      default:
        break;
    }
  }
}
