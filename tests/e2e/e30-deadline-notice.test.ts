import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { deadlinesJob } from "../../apps/worker/src/jobs/deadlines";
import { fixture } from "./harness/fixture";
import { fund } from "./harness/funding";

beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));

test("E30: the deadline job tells each party once when a delivery deadline passes undelivered", async () => {
  const f = await fixture();
  await fund(f);
  // The job notifies once a deadline has passed without delivery, so move the deadline just into the past.
  await f.prisma.escrowProjection.update({ where: { issueId: f.issueId }, data: { deliveryDeadline: new Date(Date.now() - 60_000) } });

  // The job only logs; a no-op logger keeps the harness free of a root-level pino dependency.
  const noop = () => undefined;
  const log = { debug: noop, info: noop, warn: noop, error: noop, child: () => log };
  await deadlinesJob.run({ db: f.prisma, log, now: () => new Date() } as never);
  await deadlinesJob.run({ db: f.prisma, log, now: () => new Date() } as never);

  for (const user of [f.client, f.developer]) {
    expect(await f.prisma.notification.count({ where: { userId: user.id, type: "DEADLINE_APPROACHING", data: { path: ["issueId"], equals: f.issueId } } })).toBe(1);
  }
}, 180_000);
