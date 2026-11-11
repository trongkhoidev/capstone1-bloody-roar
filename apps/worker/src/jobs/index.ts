// One import and one array entry per job. Other agents add their job here.
import { alertsJob } from "../alerts";
import type { Job } from "../runtime/scheduler";
import { deadlinesJob } from "./deadlines";
import { indexerJob } from "./indexer";
import { intentsJob } from "./intents";
import { reservationsJob } from "./reservations";

export const jobs: Job[] = [indexerJob, intentsJob, reservationsJob, deadlinesJob, alertsJob];
