// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureWorkConversation, prisma } from "@bloody-roar/database";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { execute, loadSchema } from "./graphql-execute";

const address = () => `0x${randomBytes(20).toString("hex")}`;
const summarize = `mutation($id: ID!) { summarizeConversation(conversationId: $id) { status summary messageCount } }`;

describe.skipIf(!process.env.TEST_DATABASE_URL)("summarizeConversation on PostgreSQL", () => {
  let client: Awaited<ReturnType<typeof prisma.user.create>>, developer: typeof client, outsider: typeof client, admin: typeof client;
  const savedEnv = Object.fromEntries(["GROQ_API_KEY", "OPENAI_API_KEY", "AI_API_KEY", "AI_BASE_URL"].map((key) => [key, process.env[key]]));
  let issueId = "", tokenId = "", workId = "", applicationRoomId = "";
  beforeAll(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL); await loadSchema();
    for (const key of ["GROQ_API_KEY", "OPENAI_API_KEY", "AI_API_KEY"]) delete process.env[key];
    process.env.AI_BASE_URL = "http://127.0.0.1:9";
    client = await prisma.user.create({ data: { walletAddress: address(), role: "CLIENT" } });
    developer = await prisma.user.create({ data: { walletAddress: address(), role: "DEVELOPER" } });
    outsider = await prisma.user.create({ data: { walletAddress: address(), role: "DEVELOPER" } });
    admin = await prisma.user.create({ data: { walletAddress: address(), role: "ADMIN" } });
    tokenId = (await prisma.token.create({ data: { symbol: "SUM", name: "Test token", address: address(), decimals: 6, chainId: 31337 } })).id;
    const issue = await prisma.issue.create({ data: { title: "Catch up", description: "Catch up summary fixture", category: "BUG_FIX", clientId: client.id, developerId: developer.id, status: "IN_PROGRESS", tokenId, bountyAmount: "100" } });
    issueId = issue.id;
    workId = (await ensureWorkConversation(prisma, issue)).id;
    const application = await prisma.application.create({ data: { issueId, developerId: developer.id } });
    applicationRoomId = (await prisma.conversation.create({ data: { kind: "APPLICATION", issueId, applicationId: application.id, participants: { create: [{ userId: client.id, role: "CLIENT" }, { userId: developer.id, role: "APPLICANT" }] } } })).id;
    const readAt = new Date(Date.now() - 60_000);
    await prisma.message.create({ data: { conversationId: workId, issueId, senderId: developer.id, content: "already read", createdAt: new Date(readAt.getTime() - 1000) } });
    await prisma.conversationParticipant.update({ where: { conversationId_userId: { conversationId: workId, userId: client.id } }, data: { lastReadAt: readAt } });
    await prisma.conversationParticipant.update({ where: { conversationId_userId: { conversationId: workId, userId: developer.id } }, data: { lastReadAt: new Date() } });
    await prisma.message.create({ data: { conversationId: workId, issueId, senderId: developer.id, content: "secret unread progress note" } });
  }, 60_000);
  afterAll(async () => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await prisma.aILog.deleteMany({ where: { issueId } });
    await prisma.issue.deleteMany({ where: { id: issueId } });
    if (tokenId) await prisma.token.deleteMany({ where: { id: tokenId } });
    await prisma.user.deleteMany({ where: { id: { in: [client?.id, developer?.id, outsider?.id, admin?.id].filter(Boolean) } } });
    await prisma.$disconnect();
  });

  it("rejects a user outside the room", async () => {
    const result = await execute(summarize, { user: outsider, db: prisma }, { id: workId });
    expect(result.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
  });

  it("rejects an admin who is not a participant", async () => {
    const result = await execute(summarize, { user: admin, db: prisma }, { id: workId });
    expect(result.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
  });

  it("rejects an application room", async () => {
    const result = await execute(summarize, { user: client, db: prisma }, { id: applicationRoomId });
    expect(result.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
  });

  it("returns EMPTY without calling the model when nothing is unread", async () => {
    const result = await execute(summarize, { user: developer, db: prisma }, { id: workId });
    expect(result.errors).toBeUndefined();
    expect(result.data?.summarizeConversation).toEqual({ status: "EMPTY", summary: null, messageCount: 0 });
    expect(await prisma.aILog.count({ where: { issueId, task: "SUMMARY" } })).toBe(0);
  });

  it("reports AI_UNAVAILABLE when the model is unreachable and logs only hashes", async () => {
    const result = await execute(summarize, { user: client, db: prisma }, { id: workId });
    expect(result.errors).toBeUndefined();
    expect(result.data?.summarizeConversation).toEqual({ status: "AI_UNAVAILABLE", summary: null, messageCount: 1 });
    const logs = await prisma.aILog.findMany({ where: { issueId, task: "SUMMARY" } });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.status).toBe("ERROR");
    expect(logs[0]?.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(logs[0])).not.toContain("secret unread");
  });

  it("counts every unread message even when the transcript is capped", async () => {
    await prisma.message.createMany({ data: Array.from({ length: 200 }, (_, i) => ({ conversationId: workId, issueId, senderId: developer.id, content: `bulk ${i}` })) });
    const result = await execute(summarize, { user: client, db: prisma }, { id: workId });
    expect(result.errors).toBeUndefined();
    expect(result.data?.summarizeConversation).toEqual({ status: "AI_UNAVAILABLE", summary: null, messageCount: 201 });
  });

  it("rate limits repeated catch ups", async () => {
    await prisma.message.create({ data: { conversationId: workId, issueId, senderId: client.id, content: "client update" } });
    const codes: unknown[] = [];
    for (let i = 0; i < 11; i++) codes.push((await execute(summarize, { user: developer, db: prisma }, { id: workId })).errors?.[0]?.extensions?.code);
    expect(codes.slice(0, 10)).toEqual(Array(10).fill(undefined));
    expect(codes[10]).toBe("RATE_LIMITED");
  }, 30_000);
});
