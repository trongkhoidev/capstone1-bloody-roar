// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  user: { id: "admin", role: "ADMIN", isBanned: false },
  attachment: { id: "file", uploaderId: "client", purpose: "EVIDENCE", fileName: "evidence.png", fileMime: "image/png", messageId: null,
    issue: { id: "issue", clientId: "client", developerId: "developer", status: "DISPUTED", isDraft: false }, message: null },
  findDispute: vi.fn(), log: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ tokenFromRequest: () => "test", verifyJWT: async () => mocks.user }));
vi.mock("@bloody-roar/database", () => ({ prisma: { attachment: { findFirst: async () => mocks.attachment }, dispute: { findUnique: mocks.findDispute }, adminLog: { create: mocks.log } } }));
vi.mock("@/lib/storage", () => ({ getS3Storage: () => null, localUploadPath: () => ({ destination: "/test/file" }) }));
vi.mock("node:fs/promises", () => ({ mkdir: vi.fn(), writeFile: vi.fn(), readFile: async () => Buffer.from("evidence") }));
import { GET } from "../app/api/uploads/route";

describe("admin evidence download", () => {
  beforeEach(() => { mocks.findDispute.mockReset(); mocks.log.mockReset(); mocks.log.mockResolvedValue({}); });
  it("requires an actual dispute and audits an admin download", async () => {
    mocks.findDispute.mockResolvedValue({ id: "dispute" });
    const response = await GET(new Request("http://localhost/api/uploads?key=client%2Ffile.png"));
    expect(response.status).toBe(200);
    expect(mocks.log).toHaveBeenCalledWith({ data: { adminId: "admin", action: "view_evidence", target: "issue", targetId: "issue", details: { attachmentId: "file" } } });
  });
  it("does not make evidence images public or allow admin without a dispute", async () => {
    mocks.findDispute.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/uploads?key=client%2Ffile.png"));
    expect(response.status).toBe(403);
    expect(mocks.log).not.toHaveBeenCalled();
  });
});
