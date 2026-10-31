// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as null | { id: string; role: string; isBanned: boolean },
  attachment: null as unknown,
  dispute: null as unknown,
  log: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ tokenFromRequest: () => (state.user ? "token" : null), verifyJWT: async () => state.user }));
vi.mock("@bloody-roar/database", () => ({
  prisma: {
    attachment: { findFirst: async () => state.attachment },
    dispute: { findUnique: async () => state.dispute },
    adminLog: { create: state.log },
  },
}));
vi.mock("@/lib/storage", () => ({ getS3Storage: () => null, localUploadPath: () => ({ destination: "/test/file" }) }));
vi.mock("node:fs/promises", () => ({ mkdir: vi.fn(), writeFile: vi.fn(), readFile: async () => Buffer.from("bytes") }));
import { GET } from "../app/api/uploads/route";

const people = {
  guest: null,
  outsider: { id: "outsider-1", role: "DEVELOPER", isBanned: false },
  client: { id: "client-1", role: "CLIENT", isBanned: false },
  developer: { id: "dev-1", role: "DEVELOPER", isBanned: false },
  admin: { id: "admin-1", role: "ADMIN", isBanned: false },
};
type Who = keyof typeof people;

const issue = (hiddenAt: Date | null = null) => ({ id: "issue-1", clientId: "client-1", developerId: "dev-1", status: "IN_PROGRESS", hiddenAt });
const attachment = (purpose: string | null, linked: { issue?: unknown; message?: unknown; issueId?: string | null; messageId?: string | null }) => ({
  id: "att-1",
  purpose,
  uploaderId: "client-1",
  fileName: "file.png",
  fileMime: "image/png",
  fileUrl: "http://localhost/api/uploads?key=client-1%2Ffile.png",
  issueId: linked.issueId ?? null,
  messageId: linked.messageId ?? null,
  issue: linked.issue ?? null,
  message: linked.message ?? null,
});

async function download(who: Who) {
  state.user = people[who];
  const response = await GET(new Request("http://localhost/api/uploads?key=client-1%2Ffile.png"));
  return response.status;
}

beforeEach(() => {
  state.log.mockReset();
  state.log.mockResolvedValue({});
  state.dispute = null;
});

describe("attachment download rules by purpose", () => {
  it("lets everyone, guests included, download avatars", async () => {
    state.attachment = attachment("AVATAR", {});
    for (const who of Object.keys(people) as Who[]) expect(await download(who)).toBe(200);
  });

  it("shows issue images to everyone while the task is visible, and to participants and admins once hidden", async () => {
    state.attachment = attachment("ISSUE_IMAGE", { issueId: "issue-1", issue: issue() });
    for (const who of Object.keys(people) as Who[]) expect(await download(who)).toBe(200);

    state.attachment = attachment("ISSUE_IMAGE", { issueId: "issue-1", issue: issue(new Date()) });
    expect(await download("guest")).toBe(401);
    expect(await download("outsider")).toBe(403);
    expect(await download("client")).toBe(200);
    expect(await download("developer")).toBe(200);
    expect(await download("admin")).toBe(200);
  });

  it("keeps delivery files to the client and developer of the task", async () => {
    state.attachment = attachment("DELIVERY", { issueId: "issue-1", issue: issue() });
    expect(await download("guest")).toBe(401);
    expect(await download("outsider")).toBe(403);
    expect(await download("client")).toBe(200);
    expect(await download("developer")).toBe(200);
    expect(await download("admin")).toBe(403);
  });

  it("opens evidence to participants and to admins only when a dispute exists, and audits the admin view", async () => {
    state.attachment = attachment("EVIDENCE", { issueId: "issue-1", issue: issue() });
    expect(await download("guest")).toBe(401);
    expect(await download("outsider")).toBe(403);
    expect(await download("client")).toBe(200);
    expect(await download("developer")).toBe(200);

    expect(await download("admin")).toBe(403);
    state.dispute = { id: "dispute-1" };
    expect(await download("admin")).toBe(200);
    expect(state.log).toHaveBeenCalledWith({
      data: { adminId: "admin-1", action: "view_evidence", target: "issue", targetId: "issue-1", details: { attachmentId: "att-1" } },
    });
  });

  it("applies the chat rules to chat attachments: participants read while the task is open, admins only during a dispute", async () => {
    const chatIssue = issue();
    state.attachment = attachment(null, { messageId: "msg-1", message: { issue: chatIssue } });
    expect(await download("guest")).toBe(401);
    expect(await download("outsider")).toBe(403);
    expect(await download("client")).toBe(200);
    expect(await download("developer")).toBe(200);
    expect(await download("admin")).toBe(403);

    state.attachment = attachment(null, { messageId: "msg-1", message: { issue: { ...chatIssue, status: "DISPUTED" } } });
    expect(await download("admin")).toBe(200);
  });

  it("hides a pending avatar upload from guests and other users", async () => {
    state.attachment = { ...attachment("AVATAR", {}), status: "PENDING" };
    expect(await download("guest")).toBe(404);
    expect(await download("outsider")).toBe(404);
  });

  it("lets the uploader see their own pending upload", async () => {
    state.attachment = { ...attachment("AVATAR", {}), status: "PENDING" };
    expect(await download("client")).toBe(200);
  });
});
