// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "socket.io";
import { prisma } from "@bloody-roar/database";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { execute, loadSchema } from "./graphql-execute";
import type * as AuthModule from "../lib/auth";

const auth = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("../lib/auth", async (original) => ({ ...(await original<typeof AuthModule>()), verifyJWT: async () => auth.user }));
import { registerSocketHandlers } from "../socket/handlers";

const address = () => `0x${randomBytes(20).toString("hex")}`;
describe.skipIf(!process.env.TEST_DATABASE_URL)("message notifications on PostgreSQL", () => {
  let client: Awaited<ReturnType<typeof prisma.user.create>>, developer: typeof client;
  let issueId = "", otherIssueId = "", tokenId = "";
  let send: (content: string, issue?: string, clientMessageId?: string) => Promise<string | undefined>;
  beforeAll(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL); await loadSchema();
    client = await prisma.user.create({ data: { walletAddress: address(), role: "CLIENT" } });
    developer = await prisma.user.create({ data: { walletAddress: address(), role: "DEVELOPER" } });
    tokenId = (await prisma.token.create({ data: { symbol: "NTF", name: "Test token", address: address(), decimals: 6, chainId: 31337 } })).id;
    issueId = (await prisma.issue.create({ data: { title: "Notification race", description: "Notification race test fixture", category: "BUG_FIX", clientId: client.id, developerId: developer.id, status: "IN_PROGRESS", tokenId, bountyAmount: "100" } })).id;
    otherIssueId = (await prisma.issue.create({ data: { title: "Other notification", description: "Second notification fixture", category: "BUG_FIX", clientId: client.id, developerId: developer.id, status: "IN_PROGRESS", tokenId, bountyAmount: "100" } })).id;
    auth.user = client;
    let connection: ((socket: unknown) => void) | undefined;
    const io = { use: vi.fn(), on: (_event: string, handler: (socket: unknown) => void) => { connection = handler; }, to: () => ({ emit: vi.fn() }) };
    registerSocketHandlers(io as unknown as Server);
    const listeners = new Map<string, (...args: unknown[]) => unknown>();
    connection?.({ id: "test", data: { token: "test" }, rooms: new Set([`task:${issueId}`, `task:${otherIssueId}`]), on: (event: string, handler: (...args: unknown[]) => unknown) => listeners.set(event, handler) });
    send = (content, issue = issueId, clientMessageId) => new Promise((resolve) => { void listeners.get("message:send")?.({ issueId: issue, type: "TEXT", content, clientMessageId }, resolve); });
  }, 60_000);
  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: [client?.id, developer?.id].filter(Boolean) } } });
    await prisma.issue.deleteMany({ where: { id: { in: [issueId, otherIssueId].filter(Boolean) } } });
    if (tokenId) await prisma.token.deleteMany({ where: { id: tokenId } });
    await prisma.user.deleteMany({ where: { id: { in: [client?.id, developer?.id].filter(Boolean) } } });
    await prisma.$disconnect();
  });
  it("keeps a new message unread when an older displayed notification is marked read", async () => {
    expect(await send("first message")).toBeUndefined();
    const old = await prisma.notification.findFirstOrThrow({ where: { userId: developer.id, isRead: false, type: "MESSAGE_RECEIVED" } });
    expect(await send("second message")).toBeUndefined();
    const result = await execute(`mutation($id: ID!) { markNotificationRead(id: $id) { id } }`, { user: developer, db: prisma }, { id: old.id });
    expect(result.errors).toBeUndefined();
    expect(await prisma.notification.count({ where: { userId: developer.id, isRead: false, type: "MESSAGE_RECEIVED" } })).toBe(1);
  });
  it("marks only the snapshot when another message arrives before mark-all", async () => {
    const snapshot = await execute(`query { unreadNotificationIds }`, { user: developer, db: prisma });
    expect(snapshot.errors).toBeUndefined();
    expect(await send("new message after snapshot")).toBeUndefined();
    const result = await execute(`mutation($ids: [String!]!) { markAllNotificationsRead(ids: $ids) }`, { user: developer, db: prisma }, { ids: snapshot.data?.unreadNotificationIds });
    expect(result.errors).toBeUndefined();
    expect(await prisma.notification.count({ where: { userId: developer.id, isRead: false, type: "MESSAGE_RECEIVED" } })).toBe(1);
  });
  it("waits for the same recipient and issue lock without blocking another issue", async () => {
    let release!: () => void, locked!: () => void;
    const holding = new Promise<void>((resolve) => { locked = resolve; });
    const finish = new Promise<void>((resolve) => { release = resolve; });
    const holder = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${developer.id}), hashtext(${issueId}))::text`;
      locked();
      await finish;
    });
    await holding;
    const blocked = send("waiting for lock");
    try {
      let waiting = false;
      for (let n = 0; n < 40 && !waiting; n++) {
        const rows = await prisma.$queryRaw<Array<{ waiting: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted) AS waiting`;
        waiting = rows[0]?.waiting ?? false;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(waiting).toBe(true);
      expect(await send("other issue remains independent", otherIssueId)).toBeUndefined();
      auth.user = developer;
      expect(await send("other recipient remains independent")).toBeUndefined();
    } finally {
      auth.user = client;
      release();
      await holder;
    }
    expect(await blocked).toBeUndefined();
    for (const issue of [issueId, otherIssueId]) {
      expect(await prisma.notification.count({ where: { userId: developer.id, type: "MESSAGE_RECEIVED", isRead: false, link: `/issues/${issue}` } })).toBe(1);
    }
    expect(await prisma.notification.count({ where: { userId: client.id, type: "MESSAGE_RECEIVED", isRead: false, link: `/issues/${issueId}` } })).toBe(1);
  }, 15_000);
  it("rolls back a message when notification storage fails and accepts an idempotent retry", async () => {
    const id = `retry-${randomBytes(8).toString("hex")}`;
    await prisma.$executeRawUnsafe(`CREATE FUNCTION test_reject_chat_notification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.body = 'injected notification failure' THEN RAISE EXCEPTION 'test notification failure'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER test_reject_chat_notification BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION test_reject_chat_notification()`);
    try {
      expect(await send("injected notification failure", issueId, id)).toBe("Failed to send message");
      expect(await prisma.message.count({ where: { issueId, clientMessageId: id } })).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER test_reject_chat_notification ON notifications`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION test_reject_chat_notification()`);
    }
    expect(await send("injected notification failure", issueId, id)).toBeUndefined();
    expect(await send("injected notification failure", issueId, id)).toBeUndefined();
    expect(await prisma.message.count({ where: { issueId, clientMessageId: id } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: developer.id, isRead: false, type: "MESSAGE_RECEIVED", link: `/issues/${issueId}` } })).toBe(1);
  });
  it("keeps one unread notification after simultaneous sends to the same issue", async () => {
    const results = await Promise.all([send("parallel one"), send("parallel two")]);
    expect(results).toEqual([undefined, undefined]);
    expect(await prisma.notification.count({ where: { userId: developer.id, type: "MESSAGE_RECEIVED", isRead: false, link: `/issues/${issueId}` } })).toBe(1);
  });
});
