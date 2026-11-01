import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { rpc } from "./harness/chain";
import { gql } from "./harness/gql";
import { login } from "./harness/wallet";
let accounts: string[];
beforeAll(async () => { assertTestDatabase(process.env.TEST_DATABASE_URL); accounts = await rpc<string[]>("eth_accounts"); });
test("E1: SIWE login, admin role, logout and banned account", async () => {
  const admin = await login(accounts[1]!);
  expect(admin.response.status).toBe(200);
  expect(admin.payload.chain_id).toBe("31337");
  const adminBody = await admin.response.json() as { user: { role: string } };
  expect(adminBody.user.role).toBe("ADMIN");
  const client = await login(accounts[2]!);
  expect(client.response.status).toBe(200);
  const me = await gql("query { me { walletAddress } }", {}, client.cookie);
  expect((me.data?.me as { walletAddress: string }).walletAddress.toLowerCase()).toBe(accounts[2]!.toLowerCase());
  expect((await fetch("http://localhost:4012/api/auth/logout", { method: "POST", headers: { cookie: client.cookie } })).status).toBe(200);
  expect((await gql("query { me { walletAddress } }", {}, client.cookie)).data?.me).toBeNull();
  const { prisma } = await import("@bloody-roar/database");
  try {
    await prisma.user.upsert({ where: { walletAddress: accounts[8]!.toLowerCase() }, create: { walletAddress: accounts[8]!.toLowerCase(), isBanned: true }, update: { isBanned: true } });
    expect((await login(accounts[8]!)).response.status).toBe(403);
  } finally { await prisma.$disconnect(); }
}, 120_000);
