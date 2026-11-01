import { reconcileIntents, reconcileIndexedIntents } from "../reconciler/intents";
import type { Job } from "../runtime/scheduler";

export const intentsJob: Job = {
  name: "intents",
  everyMs: 15_000,
  async run({ db, rpc, now, config }) {
    await reconcileIndexedIntents(db, config);
    await reconcileIntents({ db, rpc, now, config });
  },
};
