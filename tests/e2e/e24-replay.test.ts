import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { fixture } from "./harness/fixture";
import { fund } from "./harness/funding";
import { waitFor } from "./harness/waitFor";

beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));

test("E24: replaying from the deploy block rebuilds the same projection", async () => {
  const f = await fixture();
  await fund(f);
  const before = await f.prisma.escrowProjection.findUniqueOrThrow({ where: { issueId: f.issueId } });
  const replay = Bun.spawnSync(["bun", "run", "worker:replay", "--from", process.env.ESCROW_DEPLOY_BLOCK!], { env: process.env, stdout: "pipe", stderr: "pipe" });
  if (replay.exitCode !== 0) throw new Error(`Replay CLI failed (${replay.exitCode}): ${replay.stderr.toString().slice(0, 500)}`);
  // The CLI only requests the replay; the worker runs it and returns the checkpoint to IDLE.
  const checkpointWhere = { chainId: 31337, contractAddress: process.env.ESCROW_ADDRESS!.toLowerCase() };
  await waitFor(async () => (await f.prisma.projectionCheckpoint.findFirstOrThrow({ where: checkpointWhere })).replayStatus === "IDLE");
  const after = await f.prisma.escrowProjection.findUniqueOrThrow({ where: { issueId: f.issueId } });
  expect(after.phase).toBe(before.phase);
  expect(after.amountRaw.toFixed()).toBe(before.amountRaw.toFixed());
  expect(after.projectionVersion).toBeGreaterThanOrEqual(before.projectionVersion);
}, 240_000);
