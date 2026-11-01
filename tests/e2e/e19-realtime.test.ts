import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { fixture } from "./harness/fixture";
import { fund, walletOf } from "./harness/funding";
import { gql, gqlAs } from "./harness/gql";
import { ack, connectSocket, nextEvent, type Socket } from "./harness/socket";
import { login } from "./harness/wallet";
import { waitFor } from "./harness/waitFor";
import { submitWork } from "./harness/work";

beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));

const socketFor = async (wallet: string, label: string) => {
  const { response, cookie } = await login(wallet);
  if (!cookie) throw new Error(`${label} login ${response.status}: ${await response.text()}`);
  return connectSocket(cookie).catch((error: Error) => { throw new Error(`${label} socket: ${error.message}`); });
};

test("E19: task rooms get escrow updates, user rooms get notifications, banned users are disconnected and logged-out sessions cannot send", async () => {
  const f = await fixture();
  const client = await socketFor(walletOf(f, f.client), "client");
  const developer = await socketFor(walletOf(f, f.developer), "developer");
  const sockets: Socket[] = [client, developer];
  try {
    // Rooms are only readable once a developer is assigned, so join after funding.
    await fund(f);
    expect(await ack(client, "task:join", f.issueId)).toBeUndefined();
    expect(await ack(developer, "task:join", f.issueId)).toBeUndefined();

    const invalidated = nextEvent<{ escrowId: string }>(client, "escrow:invalidate");
    await submitWork(f, "Work that changes the projection");
    expect(await invalidated).toBeDefined();

    const notified = nextEvent<{ id: string }>(developer, "notification:new");
    expect(await ack(client, "message:send", { issueId: f.issueId, content: "Notify the developer please", type: "TEXT" })).toBeUndefined();
    expect(await notified).toMatchObject({ id: expect.any(String) });

    // accounts[8] stays banned from e01, so this scenario uses a fresh account. The row must exist before login.
    const bannedWallet = f.accounts[10]!;
    const bannedUser = await f.prisma.user.upsert({ where: { walletAddress: bannedWallet.toLowerCase() }, create: { walletAddress: bannedWallet.toLowerCase(), role: "DEVELOPER" }, update: {} });
    const banned = await socketFor(bannedWallet, "banned");
    sockets.push(banned);
    const disconnected = nextEvent<string>(banned, "disconnect", 15_000);
    // The ban runs on the web server over HTTP: only that process holds the socket server that disconnects sessions.
    const adminCookie = (await login(walletOf(f, f.admin))).cookie;
    try {
      const ban = await gql(`mutation($input: BanUserInput!) { banUser(input: $input) { id } }`, { input: { userId: bannedUser.id, reason: "Harness check of socket disconnect" } }, adminCookie);
      expect(ban.errors).toBeUndefined();
      expect(await disconnected).toBeDefined();
    } finally {
      await gql(`mutation($userId: ID!) { unbanUser(userId: $userId) { id } }`, { userId: bannedUser.id }, adminCookie);
    }

    const fresh = await login(walletOf(f, f.client));
    const loggedOut = await connectSocket(fresh.cookie);
    sockets.push(loggedOut);
    expect(await ack(loggedOut, "task:join", f.issueId)).toBeUndefined();
    await fetch("http://localhost:4012/api/auth/logout", { method: "POST", headers: { cookie: fresh.cookie } });
    // Logout disconnects the user's sockets on the server, so the session's socket is already down.
    await waitFor(async () => !loggedOut.connected);
    expect(loggedOut.connected).toBe(false);
  } finally {
    sockets.forEach((socket) => socket.close());
  }
}, 240_000);
