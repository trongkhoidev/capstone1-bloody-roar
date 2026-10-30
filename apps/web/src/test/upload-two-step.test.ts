// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "client-1", role: "CLIENT", isBanned: false } as { id: string; role: string; isBanned: boolean } | null,
  attachment: null as null | Record<string, unknown>,
  issue: { clientId: "client-1", developerId: "dev-1" } as { clientId: string; developerId: string } | null,
  stored: null as Uint8Array | null,
  db: {
    attachmentCreate: null as null | ReturnType<typeof import("vitest").vi.fn>,
    attachmentUpdate: null as null | ReturnType<typeof import("vitest").vi.fn>,
    userUpdate: null as null | ReturnType<typeof import("vitest").vi.fn>,
  },
}));

vi.mock("@/lib/auth", () => ({ tokenFromRequest: () => (state.user ? "token" : null), verifyJWT: async () => state.user }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => ({ ok: true, retryAfterMs: 0 }), tooManyRequests: () => new Response(null, { status: 429 }) }));
vi.mock("@/lib/storage", () => ({
  getS3Storage: () => null,
  localUploadPath: (key: string) => ({ root: "/test", destination: `/test/${key}` }),
}));
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  readFile: async () => Buffer.from(state.stored ?? new Uint8Array()),
}));
vi.mock("@bloody-roar/database", async () => {
  const { vi } = await import("vitest");
  const attachmentCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "att-1", ...data }));
  const attachmentUpdate = vi.fn(async () => ({}));
  const userUpdate = vi.fn(async () => ({}));
  state.db = { attachmentCreate, attachmentUpdate, userUpdate } as never;
  return {
    prisma: {
      issue: { findUnique: async () => state.issue },
      attachment: {
        create: attachmentCreate,
        findUnique: async () => state.attachment,
        update: attachmentUpdate,
      },
      user: { update: userUpdate },
      $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    },
  };
});

import { POST as startUpload } from "../app/api/uploads/route";
import { POST as completeUpload } from "../app/api/uploads/complete/route";

const json = (body: unknown) => new Request("http://localhost/api/uploads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const bytes = new TextEncoder().encode("hello delivery");
const sha256 = createHash("sha256").update(bytes).digest("hex");
const pending = (overrides: Record<string, unknown> = {}) => ({
  id: "att-1",
  uploaderId: "client-1",
  status: "PENDING",
  purpose: "ISSUE_IMAGE",
  fileName: "file.png",
  fileUrl: "http://localhost/api/uploads?key=client-1%2Fabc-file.png",
  fileSize: bytes.byteLength,
  fileMime: "image/png",
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  state.user = { id: "client-1", role: "CLIENT", isBanned: false };
  state.issue = { clientId: "client-1", developerId: "dev-1" };
  state.attachment = pending();
  state.stored = bytes;
  vi.unstubAllEnvs();
});
afterEach(() => vi.unstubAllEnvs());

describe("two-step upload", () => {
  it("creates a PENDING attachment and returns its id with the upload target", async () => {
    const response = await startUpload(json({ fileName: "file.png", fileType: "image/png", fileSize: 14, purpose: "ISSUE_IMAGE" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.attachmentId).toBe("att-1");
    expect(state.db.attachmentCreate?.mock.calls[0]?.[0].data).toMatchObject({ purpose: "ISSUE_IMAGE", status: "PENDING", issueId: null, uploaderId: "client-1" });
  });

  it("stores delivery attachments against the task and refuses outsiders with 403", async () => {
    const ok = await startUpload(json({ fileName: "out.zip", fileType: "application/zip", fileSize: 10, purpose: "DELIVERY", issueId: "issue-1" }));
    expect(ok.status).toBe(200);
    expect(state.db.attachmentCreate?.mock.calls[0]?.[0].data).toMatchObject({ issueId: "issue-1", purpose: "DELIVERY" });

    state.user = { id: "outsider-1", role: "DEVELOPER", isBanned: false };
    const refused = await startUpload(json({ fileName: "out.zip", fileType: "application/zip", fileSize: 10, purpose: "DELIVERY", issueId: "issue-1" }));
    expect(refused.status).toBe(403);
  });

  it("refuses chat purposes, which travel through the socket, and oversized avatars", async () => {
    expect((await startUpload(json({ fileName: "a.png", fileType: "image/png", fileSize: 10, purpose: "CHAT" }))).status).toBe(400);
    expect((await startUpload(json({ fileName: "a.png", fileType: "image/png", fileSize: 6 * 1024 * 1024, purpose: "AVATAR" }))).status).toBe(400);
  });

  it("completes an upload whose bytes match, records the SHA-256 and marks it ATTACHED", async () => {
    const response = await completeUpload(json({ attachmentId: "att-1" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ attachmentId: "att-1", sha256 });
    expect(state.db.attachmentUpdate?.mock.calls[0]?.[0]).toMatchObject({ where: { id: "att-1" }, data: { sha256, status: "ATTACHED" } });
  });

  it("keeps the attachment PENDING when the stored size does not match", async () => {
    state.stored = new TextEncoder().encode("short");
    const response = await completeUpload(json({ attachmentId: "att-1" }));
    expect(response.status).toBe(400);
    expect(state.db.attachmentUpdate).not.toHaveBeenCalled();
  });

  it("refuses to complete someone else's upload with 403", async () => {
    state.user = { id: "dev-1", role: "DEVELOPER", isBanned: false };
    const response = await completeUpload(json({ attachmentId: "att-1" }));
    expect(response.status).toBe(403);
    expect(state.db.attachmentUpdate).not.toHaveBeenCalled();
  });

  it("sets the avatar on the user when an avatar upload completes", async () => {
    state.attachment = pending({ purpose: "AVATAR", fileMime: "image/png" });
    const response = await completeUpload(json({ attachmentId: "att-1" }));
    expect(response.status).toBe(200);
    expect(state.db.userUpdate?.mock.calls[0]?.[0]).toMatchObject({ where: { id: "client-1" }, data: { avatar: "http://localhost/api/uploads?key=client-1%2Fabc-file.png" } });
  });

  it("returns 503 in production when S3 is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await startUpload(json({ fileName: "a.png", fileType: "image/png", fileSize: 10, purpose: "ISSUE_IMAGE" }))).status).toBe(503);
    expect((await completeUpload(json({ attachmentId: "att-1" }))).status).toBe(503);
  });
});
