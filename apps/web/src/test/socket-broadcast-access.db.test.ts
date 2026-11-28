// @vitest-environment node
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Server } from "socket.io";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import { prisma, ensureWorkConversation, type User } from "@bloody-roar/database";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { saveConversationMessage } from "../lib/chat-messages";

type Auth = { user: User; token: string };
type Handlers = {
  registerSocketHandlers: (io: Server) => void;
  broadcastConversationMessage: (io: Server, result: Awaited<ReturnType<typeof saveConversationMessage>>) => Promise<void>;
  broadcastMessageModified: (io: Server, message: Awaited<ReturnType<typeof saveConversationMessage>>["message"]) => Promise<void>;
};
type Bridge = {
  handleNotification: (io: Server, channel: string, rawPayload: string) => Promise<void>;
};

const address = () => `0x${randomBytes(20).toString("hex")}`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!process.env.TEST_DATABASE_URL)("socket broadcasts follow current database access", () => {
  let httpServer: HttpServer;
  let io: Server;
  let url = "";
  let handlers: Handlers;
  let bridge: Bridge;
  let signIn: (role: "CLIENT" | "DEVELOPER") => Promise<Auth>;
  let client: Auth, developer: Auth, rejected: Auth;
  let tokenId = "", issueId = "", conversationId = "";
  const sockets: ClientSocket[] = [];
  const users: string[] = [];
  const issues: string[] = [];
  const tokens: string[] = [];

  beforeAll(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    vi.stubEnv("AUTH_PRIVATE_KEY", `0x${"1".padStart(64, "0")}`);
    vi.stubEnv("AI_HASH_KEY", "socket-access-test");
    vi.stubEnv("AI_EXTERNAL_GUARD", "");
    const auth = await import("../lib/auth");
    handlers = await import("../socket/handlers");
    bridge = await import("../lib/realtime/escrow-bridge");
    signIn = async (role) => {
      const user = await prisma.user.create({ data: { role, walletAddress: address() } });
      users.push(user.id);
      const token = await auth.issueAuthToken(user.walletAddress);
      await prisma.session.create({ data: { userId: user.id, refreshHash: createHash("sha256").update(token).digest("hex"), nonce: randomUUID(), expiresAt: new Date(Date.now() + 60_000) } });
      return { user, token };
    };
    httpServer = createServer();
    io = new Server(httpServer);
    handlers.registerSocketHandlers(io);
    await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  }, 60_000);

  beforeEach(async () => {
    [client, developer, rejected] = await Promise.all([signIn("CLIENT"), signIn("DEVELOPER"), signIn("DEVELOPER")]);
    tokenId = (await prisma.token.create({ data: { symbol: "BCA", name: "Socket access", address: address(), decimals: 6, chainId: 31337 } })).id;
    tokens.push(tokenId);
    const issue = await prisma.issue.create({ data: { title: "Socket access", description: "Socket access fixture", category: "BUG_FIX", clientId: client.user.id, developerId: rejected.user.id, status: "IN_PROGRESS", tokenId, bountyAmount: "100" } });
    issueId = issue.id;
    issues.push(issueId);
    conversationId = (await prisma.$transaction((tx) => ensureWorkConversation(tx, issue))).id;
  });

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await prisma.notification.deleteMany({ where: { userId: { in: users } } });
    await prisma.issue.deleteMany({ where: { id: { in: issues } } });
    await prisma.token.deleteMany({ where: { id: { in: tokens } } });
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  const connect = (auth: Auth) => new Promise<ClientSocket>((resolve, reject) => {
    const socket = createClient(url, { auth: { token: auth.token }, transports: ["websocket"], forceNew: true });
    sockets.push(socket);
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
  const joinTask = (socket: ClientSocket) => new Promise<string | undefined>((resolve) => socket.emit("task:join", issueId, resolve));
  const members = async (room: string) => (await io.in(room).fetchSockets()).map((socket) => (socket.data as { user: { id: string } }).user.id).sort();
  const moveToDeveloper = async () => {
    const issue = await prisma.issue.update({ where: { id: issueId }, data: { developerId: developer.user.id } });
    await prisma.$transaction((tx) => ensureWorkConversation(tx, issue));
  };
  const record = (socket: ClientSocket) => {
    const events: string[] = [];
    for (const event of ["message:new", "message:modified", "escrow:invalidate"]) socket.on(event, () => events.push(event));
    return events;
  };

  it("stops new messages to a replaced developer and removes both chat rooms", async () => {
    const [clientSocket, developerSocket, rejectedSocket] = await Promise.all([connect(client), connect(developer), connect(rejected)]);
    expect(await joinTask(rejectedSocket)).toBeUndefined();
    expect(await joinTask(clientSocket)).toBeUndefined();
    await moveToDeveloper();
    expect(await joinTask(developerSocket)).toBeUndefined();
    const events = { client: record(clientSocket), developer: record(developerSocket), rejected: record(rejectedSocket) };

    const result = await saveConversationMessage(prisma, client.user, { conversationId, issueId, type: "TEXT", content: "terms update" });
    await handlers.broadcastConversationMessage(io, result);
    await sleep(100);

    expect(events.client).toContain("message:new");
    expect(events.developer).toContain("message:new");
    expect(events.rejected).not.toContain("message:new");
    expect(await members(`conv:${conversationId}`)).toEqual([client.user.id, developer.user.id].sort());
    expect(await members(`task:${issueId}`)).toEqual([client.user.id, developer.user.id].sort());
  });

  it("applies the same eviction before a message edit is broadcast", async () => {
    const [developerSocket, rejectedSocket] = await Promise.all([connect(developer), connect(rejected)]);
    expect(await joinTask(rejectedSocket)).toBeUndefined();
    await moveToDeveloper();
    expect(await joinTask(developerSocket)).toBeUndefined();
    const events = { developer: record(developerSocket), rejected: record(rejectedSocket) };
    const result = await saveConversationMessage(prisma, client.user, { conversationId, issueId, type: "TEXT", content: "before edit" });

    await handlers.broadcastMessageModified(io, result.message);
    await sleep(100);

    expect(events.developer).toContain("message:modified");
    expect(events.rejected).not.toContain("message:modified");
    expect(await members(`task:${issueId}`)).toEqual([developer.user.id]);
  });

  it("removes a replaced developer from the task room before escrow events are sent", async () => {
    const [developerSocket, rejectedSocket] = await Promise.all([connect(developer), connect(rejected)]);
    expect(await joinTask(rejectedSocket)).toBeUndefined();
    await moveToDeveloper();
    expect(await joinTask(developerSocket)).toBeUndefined();
    const events = { developer: record(developerSocket), rejected: record(rejectedSocket) };

    await bridge.handleNotification(io, "projection_changed", JSON.stringify({ issueId, escrowId: "esc_1", projectionVersion: 2 }));
    await sleep(100);

    expect(events.developer).toContain("escrow:invalidate");
    expect(events.rejected).not.toContain("escrow:invalidate");
    expect(await members(`task:${issueId}`)).toEqual([developer.user.id]);
    expect(await members(`conv:${conversationId}`)).toEqual([developer.user.id]);
  });

  it("disconnects a banned user instead of trusting the handshake identity", async () => {
    const [clientSocket, rejectedSocket] = await Promise.all([connect(client), connect(rejected)]);
    expect(await joinTask(clientSocket)).toBeUndefined();
    expect(await joinTask(rejectedSocket)).toBeUndefined();
    const events = record(rejectedSocket);
    await prisma.user.update({ where: { id: rejected.user.id }, data: { isBanned: true } });

    const result = await saveConversationMessage(prisma, client.user, { conversationId, issueId, type: "TEXT", content: "still there?" });
    await handlers.broadcastConversationMessage(io, result);
    await sleep(100);

    expect(events).not.toContain("message:new");
    expect(rejectedSocket.connected).toBe(false);
    expect(await members(`conv:${conversationId}`)).toEqual([client.user.id]);
  });
});
