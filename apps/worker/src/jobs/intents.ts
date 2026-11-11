import { reconcileIntents } from "../reconciler/intents";
import type { Job } from "../runtime/scheduler";

export const intentsJob: Job = {
  name: "intents",
  everyMs: 15_000,
  async run({ db, rpc, now }) {
    await reconcileIntents({ db, rpc, now });
  },
};
