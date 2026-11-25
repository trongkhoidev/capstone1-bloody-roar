// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@bloody-roar/database";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { saveConversationMessage } from "../lib/chat-messages";

const address = () => `0x${randomBytes(20).toString("hex")}`;

describe.skipIf(!process.env.TEST_DATABASE_URL)("chat FILE messages only use attached chat uploads (real database)", () => {
  let client: Awaited<ReturnType<typeof prisma.user.create>>, developer: typeof client;
  let issueId = "", tokenId = "", conversationId = "";

  beforeAll(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    vi.stubEnv("AI_EXTERNAL_GUARD", "");
    client = await prisma.user.create({ data: { walletAddress: address(), role: "CLIENT" } });
    developer = await prisma.user.create({ data: { walletAddress: address(), role: "DEVELOPER" } });
    tokenId = (await prisma.token.create({ data: { symbol: "CFM", name: "Chat file message", address: address(), decimals: 6, chainId: 31337 } })).id;
    issueId = (await prisma.issue.create({ data: { title: "Chat file message", description: "Chat file message fixture", category: "BUG_FIX", clientId: client.id, developerId: developer.id, status: "IN_PROGRESS", tokenId, bountyAmount: "100" } })).id;
    conversationId = (await prisma.conversation.create({ data: { issueId, kind: "ISSUE_WORK", participants: { create: [{ userId: client.id, role: "CLIENT" }, { userId: developer.id, role: "DEVELOPER" }] } } })).id;
  }, 60_000);

  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.attachment.deleteMany({ where: { uploaderId: { in: [client?.id, developer?.id].filter(Boolean) } } });
    await prisma.issue.deleteMany({ where: { id: issueId } });
    if (tokenId) await prisma.token.deleteMany({ where: { id: tokenId } });
    await prisma.user.deleteMany({ where: { id: { in: [client?.id, developer?.id].filter(Boolean) } } });
    await prisma.$disconnect();
  });

  it("refuses a FILE message that points at a REJECTED chat upload or an ATTACHED delivery file", async () => {
    const cases = [
      { purpose: "CHAT" as const, status: "REJECTED" as const, conversationId },
      { purpose: "DELIVERY" as const, status: "ATTACHED" as const, conversationId: null },
    ];
    for (const { purpose, status, conversationId: attachmentConversationId } of cases) {
      const fileUrl = `http://localhost/api/uploads?key=${randomBytes(8).toString("hex")}`;
      await prisma.attachment.create({ data: { issueId, conversationId: attachmentConversationId, uploaderId: client.id, fileName: "file.txt", fileUrl, fileSize: 4, fileMime: "text/plain", purpose, status } });
      await expect(saveConversationMessage(prisma, client, { conversationId, issueId, type: "FILE", content: "file", fileUrl }), purpose).rejects.toMatchObject({ extensions: { code: "INVALID_ATTACHMENT" } });
    }
  });
});
