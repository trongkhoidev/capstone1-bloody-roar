import { reconcileProjections } from "../reconciler/projections";
import type { Job } from "../runtime/scheduler";

export const reconciliationJob: Job = {
  name: "reconciliation",
  everyMs: 60_000,
  async run({ db, rpc, config, now }) {
    await reconcileProjections({ db, rpc, config, now });
  },
};
