import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { beforeAll } from "bun:test";
import { expect, test } from "bun:test";
import { tryAcquireWorkerLock } from "../src/runtime/lock";

beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));

const url = process.env.DIRECT_URL || process.env.DATABASE_URL || "";

test("a second worker cannot take the lock until the first releases it", async () => {
  const first = await tryAcquireWorkerLock(url);
  if (!first) throw new Error("first worker should get the lock");
  expect(await tryAcquireWorkerLock(url)).toBeNull();
  expect(first.isHeld()).toBe(true);

  await first.release();
  const again = await tryAcquireWorkerLock(url);
  expect(again).not.toBeNull();
  await again?.release();
});
