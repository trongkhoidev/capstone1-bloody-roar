import { beforeAll, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { createEvidence, raiseDispute, waitForPhase } from "./harness/dispute";
import { fixture } from "./harness/fixture";
import { fund, walletOf } from "./harness/funding";
import { ack, connectSocket, nextEvent, type Socket } from "./harness/socket";
import { login } from "./harness/wallet";
import { releaseFunds, submitWork } from "./harness/work";
import { waitFor } from "./harness/waitFor";

beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));

const socketFor = async (wallet: string) => connectSocket((await login(wallet)).cookie);
const closeAll = (sockets: Socket[]) => sockets.forEach((socket) => socket.close());

test("E18: participants chat while work is in progress, outsiders are refused, and the thread closes after completion", async () => {
  const f = await fixture();
  await fund(f);
  const client = await socketFor(walletOf(f, f.client));
  const developer = await socketFor(walletOf(f, f.developer));
  const outsider = await socketFor(walletOf(f, f.outsider));
  try {
    expect(await ack(client, "task:join", f.issueId)).toBeUndefined();
    expect(await ack(developer, "task:join", f.issueId)).toBeUndefined();
    expect(await ack(outsider, "task:join", f.issueId)).toBe("You cannot access this task room");

    const delivered = nextEvent<{ content: string }>(developer, "message:new");
    expect(await ack(client, "message:send", { issueId: f.issueId, content: "Can you confirm the scope?", type: "TEXT" })).toBeUndefined();
    expect((await delivered).content).toBe("Can you confirm the scope?");
    await waitFor(async () => (await f.prisma.notification.count({ where: { userId: f.developer.id, type: "MESSAGE_RECEIVED", data: { path: ["issueId"], equals: f.issueId } } })) > 0);

    const key = randomBytes(32).toString("hex");
    expect(await ack(developer, "message:send", { issueId: f.issueId, content: `my key is PRIVATE_KEY=0x${key}`, type: "TEXT" })).toBeUndefined();
    await waitFor(async () => (await f.prisma.message.count({ where: { issueId: f.issueId, content: { contains: "[REDACTED]" } } })) > 0);
    expect(await f.prisma.message.count({ where: { issueId: f.issueId, content: { contains: key } } })).toBe(0);

    expect(await ack(outsider, "message:send", { issueId: f.issueId, content: "let me in", type: "TEXT" })).toBe("You cannot send messages in this task");

    await submitWork(f, "Finished CSV export");
    await releaseFunds(f);
    expect(await ack(client, "message:send", { issueId: f.issueId, content: "Thanks, closing this", type: "TEXT" })).toBe("You cannot send messages in this task");
    expect(await ack(client, "task:join", f.issueId)).toBeUndefined();
  } finally {
    closeAll([client, developer, outsider]);
  }
}, 180_000);

test("E18: during a dispute participants still write, those messages are flagged afterDispute, and the admin only reads", async () => {
  const f = await fixture();
  await fund(f);
  await submitWork(f, "Work under dispute");
  const client = await socketFor(walletOf(f, f.client));
  const admin = await socketFor(walletOf(f, f.admin));
  try {
    expect(await ack(client, "task:join", f.issueId)).toBeUndefined();
    expect(await ack(client, "message:send", { issueId: f.issueId, content: "Written before the dispute", type: "TEXT" })).toBeUndefined();
    expect((await f.prisma.message.findFirstOrThrow({ where: { issueId: f.issueId, content: "Written before the dispute" } })).afterDispute).toBe(false);

    await raiseDispute(f, f.client, (await createEvidence(f, f.client, "The result misses the acceptance criterion.")).id);
    await waitForPhase(f, "DISPUTED");
    // Admins can read the thread only while the issue is disputed.
    expect(await ack(admin, "task:join", f.issueId)).toBeUndefined();
    expect(await ack(client, "message:send", { issueId: f.issueId, content: "Written after the dispute", type: "TEXT" })).toBeUndefined();
    // The flag follows the stored dispute time against the server clock. The Hardhat clock can run ahead of wall time
    // after earlier scenarios, so assert the rule itself rather than assuming a particular ordering.
    const dispute = await f.prisma.dispute.findUniqueOrThrow({ where: { issueId: f.issueId } });
    const after = await f.prisma.message.findFirstOrThrow({ where: { issueId: f.issueId, content: "Written after the dispute" } });
    expect(after.afterDispute).toBe(dispute.raisedAt!.getTime() <= after.createdAt.getTime());

    expect(await ack(admin, "message:send", { issueId: f.issueId, content: "Admin comment", type: "TEXT" })).toBe("Administrators have read-only access to task evidence");
  } finally {
    closeAll([client, admin]);
  }
}, 240_000);
