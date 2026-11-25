// @vitest-environment node
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@bloody-roar/database";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import type * as AuthModule from "../lib/auth";
import { localUploadPath } from "../lib/storage";

const auth = vi.hoisted(() => ({ user: null as unknown }));
vi.mock("../lib/auth", async (original) => ({ ...(await original<typeof AuthModule>()), verifyJWT: async () => auth.user }));
import { POST as presign } from "../app/api/uploads/route";
import { POST as complete } from "../app/api/uploads/complete/route";

const address = () => `0x${randomBytes(20).toString("hex")}`;
const post = (url: string, body: unknown) => new Request(url, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer test" }, body: JSON.stringify(body) });
const MB = 1024 * 1024;

describe.skipIf(!process.env.TEST_DATABASE_URL)("chat upload type and size limits (real database)", () => {
  let client: Awaited<ReturnType<typeof prisma.user.create>>, developer: typeof client;
  let issueId = "", tokenId = "", conversationId = "";

  beforeAll(async () => {
    assertTestDatabase(process.env.TEST_DATABASE_URL);
    vi.stubEnv("AWS_S3_BUCKET", "");
    client = await prisma.user.create({ data: { walletAddress: address(), role: "CLIENT" } });
    developer = await prisma.user.create({ data: { walletAddress: address(), role: "DEVELOPER" } });
    tokenId = (await prisma.token.create({ data: { symbol: "CUL", name: "Chat upload", address: address(), decimals: 6, chainId: 31337 } })).id;
    issueId = (await prisma.issue.create({ data: { title: "Chat upload limits", description: "Chat upload limits fixture", category: "BUG_FIX", clientId: client.id, developerId: developer.id, status: "IN_PROGRESS", tokenId, bountyAmount: "100" } })).id;
    conversationId = (await prisma.conversation.create({ data: { issueId, kind: "ISSUE_WORK", participants: { create: [{ userId: client.id, role: "CLIENT" }, { userId: developer.id, role: "DEVELOPER" }] } } })).id;
    auth.user = client;
  }, 60_000);

  afterAll(async () => {
    vi.unstubAllEnvs();
    await prisma.attachment.deleteMany({ where: { uploaderId: { in: [client?.id, developer?.id].filter(Boolean) } } });
    await prisma.issue.deleteMany({ where: { id: issueId } });
    if (tokenId) await prisma.token.deleteMany({ where: { id: tokenId } });
    await prisma.user.deleteMany({ where: { id: { in: [client?.id, developer?.id].filter(Boolean) } } });
    await prisma.$disconnect();
  });

  const start = (fileType: string, fileSize: number, purpose = "CHAT") =>
    presign(post("http://localhost/api/uploads", { fileName: "file.bin", fileType, fileSize, purpose, conversationId }));

  const stored = async (fileMime: string, bytes: Uint8Array, fileName = "file.bin") => {
    const key = `${client.id}/${randomBytes(8).toString("hex")}-file.bin`;
    const destination = localUploadPath(key)!.destination;
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
    const attachment = await prisma.attachment.create({
      data: { issueId, conversationId, uploaderId: client.id, fileName, fileUrl: `http://localhost/api/uploads?key=${encodeURIComponent(key)}`, fileSize: bytes.byteLength, fileMime, purpose: "CHAT", status: "PENDING" },
    });
    return { id: attachment.id, destination };
  };

  it("refuses chat presigns for SVG and zip with FILE_TYPE_NOT_ALLOWED", async () => {
    for (const type of ["image/svg+xml", "application/zip", "text/html"]) {
      const response = await start(type, 100);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: "FILE_TYPE_NOT_ALLOWED" });
    }
  });

  it("refuses chat presigns over 10 MB with FILE_TOO_LARGE", async () => {
    const response = await start("image/png", 10 * MB + 1);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "FILE_TOO_LARGE" });
  });

  it("still presigns an allowed chat file and leaves other purposes unchanged", async () => {
    expect((await start("image/png", 10 * MB)).status).toBe(200);
    expect((await start("image/svg+xml", 100, "ISSUE_IMAGE")).status).toBe(200);
  });

  it("rejects a disallowed chat type at complete, marks it REJECTED and deletes the file", async () => {
    const { id, destination } = await stored("image/svg+xml", new TextEncoder().encode("<svg/>"));
    const response = await complete(post("http://localhost/api/uploads/complete", { attachmentId: id }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "FILE_TYPE_NOT_ALLOWED" });
    expect((await prisma.attachment.findUniqueOrThrow({ where: { id } })).status).toBe("REJECTED");
    expect(existsSync(destination)).toBe(false);
  });

  it("rejects an oversized chat file at complete with FILE_TOO_LARGE", async () => {
    const { id, destination } = await stored("text/plain", new Uint8Array(10 * MB + 1).fill(97));
    const response = await complete(post("http://localhost/api/uploads/complete", { attachmentId: id }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "FILE_TOO_LARGE" });
    expect((await prisma.attachment.findUniqueOrThrow({ where: { id } })).status).toBe("REJECTED");
    expect(existsSync(destination)).toBe(false);
  });

  it("rejects chat files whose bytes don't match the declared type with FILE_CONTENT_MISMATCH", async () => {
    const cases: [string, Uint8Array][] = [
      ["image/png", new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00])],
      ["image/png", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])],
      ["application/pdf", new TextEncoder().encode("not a pdf")],
      ["image/webp", new TextEncoder().encode("RIFF\0\0\0\0WAVEfmt ")],
      ["text/plain", new Uint8Array([0x68, 0x69, 0x00, 0x68, 0x69])],
      ["application/json", new Uint8Array([0x7b, 0xff, 0xfe, 0x7d])],
    ];
    for (const [mime, bytes] of cases) {
      const { id, destination } = await stored(mime, bytes);
      const response = await complete(post("http://localhost/api/uploads/complete", { attachmentId: id }));
      expect(response.status, mime).toBe(422);
      expect(await response.json()).toMatchObject({ code: "FILE_CONTENT_MISMATCH" });
      expect((await prisma.attachment.findUniqueOrThrow({ where: { id } })).status).toBe("REJECTED");
      expect(existsSync(destination)).toBe(false);
    }
  });

  it("attaches chat files whose bytes match the declared type", async () => {
    const cases: [string, Uint8Array][] = [
      ["image/png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])],
      ["image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])],
      ["image/gif", new TextEncoder().encode("GIF89a\x01\0\x01\0")],
      ["image/webp", new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")],
      ["application/pdf", new TextEncoder().encode("%PDF-1.7\n")],
      ["text/markdown", new TextEncoder().encode("# Héllo ✓")],
      ["application/json", new TextEncoder().encode('{"ok":true}')],
    ];
    for (const [mime, bytes] of cases) {
      const { id } = await stored(mime, bytes);
      const response = await complete(post("http://localhost/api/uploads/complete", { attachmentId: id }));
      expect(response.status, mime).toBe(200);
      expect((await prisma.attachment.findUniqueOrThrow({ where: { id } })).status).toBe("ATTACHED");
    }
  });

  it("rejects chat text files and file names holding a secret with FILE_CONTAINS_SECRET without echoing it", async () => {
    const key = `0x${randomBytes(32).toString("hex")}`;
    const cases: [string, string, string, string][] = [
      ["text/plain", `deployer key ${key}`, "notes.txt", "evm-private-key"],
      ["text/markdown", "DATABASE_URL=postgresql://admin:hunter2pass@db.example.com:5432/prod", "setup.md", "database-url"],
      ["image/png", "\x89PNG\r\n\x1a\n", `${key}.png`, "evm-private-key"],
    ];
    for (const [mime, content, fileName, kind] of cases) {
      const { id, destination } = await stored(mime, new Uint8Array(Buffer.from(content, "latin1")), fileName);
      const response = await complete(post("http://localhost/api/uploads/complete", { attachmentId: id }));
      const body = await response.json();
      expect(response.status, fileName).toBe(422);
      expect(body).toMatchObject({ code: "FILE_CONTAINS_SECRET" });
      expect(body.error).toContain(kind);
      expect(JSON.stringify(body)).not.toContain(key);
      expect(JSON.stringify(body)).not.toContain("hunter2pass");
      expect((await prisma.attachment.findUniqueOrThrow({ where: { id } })).status).toBe("REJECTED");
      expect(existsSync(destination)).toBe(false);
    }
  });

  it("attaches chat text files that only mention an email or phone number", async () => {
    const { id } = await stored("text/plain", new TextEncoder().encode("reach me at dev@example.com or 0912345678"), "contact.txt");
    const response = await complete(post("http://localhost/api/uploads/complete", { attachmentId: id }));
    expect(response.status).toBe(200);
    expect((await prisma.attachment.findUniqueOrThrow({ where: { id } })).status).toBe("ATTACHED");
  });

  it("scans a 10 MB chat text file in under a second, even when it is all seed-phrase words", async () => {
    const cases: [string, number][] = [
      ["const total = items.reduce((sum, item) => sum + item.price, 0);\n", 200],
      ["abandon ability able about above absent absorb abstract absurd abuse access accident\n", 422],
    ];
    for (const [text, status] of cases) {
      const line = new TextEncoder().encode(text);
      const bytes = new Uint8Array(10 * MB);
      for (let offset = 0; offset + line.length <= bytes.length; offset += line.length) bytes.set(line, offset);
      bytes.fill(10, bytes.length - (bytes.length % line.length));
      const { id } = await stored("text/plain", bytes);
      const startedAt = performance.now();
      const response = await complete(post("http://localhost/api/uploads/complete", { attachmentId: id }));
      expect(response.status, text).toBe(status);
      expect(performance.now() - startedAt, text).toBeLessThan(1000);
    }
  });

  it("still rejects a seed phrase hidden after many invalid BIP-39 windows", async () => {
    const text = `${"abandon ".repeat(1_100)}.\n${"abandon ".repeat(11)}about`;
    const { id } = await stored("text/plain", new TextEncoder().encode(text));
    const response = await complete(post("http://localhost/api/uploads/complete", { attachmentId: id }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "FILE_CONTAINS_SECRET" });
  });

  it("completes a pending upload only once when two completes race", async () => {
    const { id } = await stored("text/plain", new TextEncoder().encode("race"));
    const statuses = (await Promise.all([1, 2].map(() => complete(post("http://localhost/api/uploads/complete", { attachmentId: id }))))).map((response) => response.status);
    expect(statuses.sort()).toEqual([200, 409]);
  });

  it("attaches a valid chat file at complete", async () => {
    const { id, destination } = await stored("text/plain", new TextEncoder().encode("hello chat"));
    const response = await complete(post("http://localhost/api/uploads/complete", { attachmentId: id }));
    expect(response.status).toBe(200);
    expect((await prisma.attachment.findUniqueOrThrow({ where: { id } })).status).toBe("ATTACHED");
    expect(existsSync(destination)).toBe(true);
  });
});
