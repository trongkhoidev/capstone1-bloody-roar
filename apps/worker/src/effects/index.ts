// apps/worker/src/effects/index.ts
// Áp effect của fold lên DB, trong cùng transaction với ChainEvent.
// Nhánh escrow do A4 viết ở escrow.ts. A3 thêm nhánh `config`, A5 thêm nhánh `dispute`.

import type { Prisma } from "@bloody-roar/database";
import type { FoldEffect } from "@bloody-roar/shared/escrow";
import { applyFunded, type EffectMeta } from "./escrow";
import { applyWorkSubmitted } from "./work";
import { applyResolved } from "./resolved";
import { applySettlement } from "./settlement";
import { applyClaimed } from "./claimed";

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
      case "WORK_SUBMITTED":
        await applyWorkSubmitted(tx, effect, meta);
        break;
      case "ESCROW_RESOLVED":
        await applyResolved(tx, effect, meta);
        break;
      case "SETTLEMENT_PROPOSED":
      case "SETTLEMENT_REVOKED":
        await applySettlement(tx, effect, meta);
        break;
      case "CLAIMED":
        await applyClaimed(tx, effect, meta);
        break;
      default:
        break;
    }
  }
}
