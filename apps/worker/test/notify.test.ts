import { afterAll, expect, test } from "bun:test";
import { Client } from "pg";
import { prisma, PROJECTION_CHANGED_CHANNEL } from "@bloody-roar/database";
import { notifyProjectionChanged } from "../src/indexer/notify";

const url = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
const listener = new Client({ connectionString: url });
const received: Array<{ channel: string; payload: string }> = [];
await listener.connect();
await listener.query(`LISTEN ${PROJECTION_CHANGED_CHANNEL}`);
listener.on("notification", (msg) => received.push({ channel: msg.channel, payload: msg.payload ?? "" }));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const payload = { escrowId: "esc_1", issueId: "issue_1", projectionVersion: 3 };

afterAll(async () => {
  await listener.end();
  await prisma.$disconnect();
});

test("projection_changed reaches a LISTENing client once the transaction commits", async () => {
  received.length = 0;
  await prisma.$transaction((tx) => notifyProjectionChanged(tx, payload));
  await sleep(200);
  expect(received).toEqual([{ channel: PROJECTION_CHANGED_CHANNEL, payload: JSON.stringify(payload) }]);
});

test("a rolled-back transaction sends nothing", async () => {
  received.length = 0;
  await expect(
    prisma.$transaction(async (tx) => {
      await notifyProjectionChanged(tx, payload);
      throw new Error("rollback");
    }),
  ).rejects.toThrow("rollback");
  await sleep(200);
  expect(received).toEqual([]);
});
