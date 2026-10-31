// One import and one array entry per job. Other agents add their job here.
import { alertsJob } from "../alerts";
import { cleanupJob } from "./cleanup";
import type { Job } from "../runtime/scheduler";
import { deadlinesJob } from "./deadlines";
import { indexerJob } from "./indexer";
import { intentsJob } from "./intents";
import { reservationsJob } from "./reservations";
import { reconciliationJob } from "./reconciliation";
import { contractConfigJob } from "./contract-config";

export const jobs: Job[] = [indexerJob, intentsJob, reservationsJob, deadlinesJob, reconciliationJob, alertsJob, cleanupJob, contractConfigJob];
