import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "../graphql/schema";

const sender = { id: "client-1", role: "CLIENT", walletAddress: "0xclient" };
const outsider = { id: "other-1", role: "DEVELOPER", walletAddress: "0xother" };
const openIssue = { clientId: "client-1", developerId: "dev-1", status: "IN_PROGRESS" };

// Calls a root field resolver directly; the GraphQL engine instance differs between test and schema modules.
function callField(kind: "Query" | "Mutation", name: string, args: Record<string, unknown>, user: unknown, db: unknown) {
  const root = kind === "Query" ? schema.getQueryType() : schema.getMutationType();
  const field = root?.getFields()[name];
  if (!field?.resolve) throw new Error(`no resolver for ${name}`);
  return field.resolve({} as never, args, { db, user } as never, {} as never);
}

function fakeDb({ issue = openIssue, text = "hello" }: { issue?: Record<string, unknown>; text?: string } = {}) {
  const message = {
    id: "m-1",
    issueId: "issue-1",
    senderId: "client-1",
    content: text,
    type: "TEXT",
    wasModified: false,
    originalHash: null,
    isDeleted: false,
    createdAt: new Date(),
    sender: { id: "client-1", name: "Client", avatar: null },
    attachments: [],
    issue,
  };
  return {
    message: {
      findUnique: vi.fn((_args: unknown) => Promise.resolve(message)),
      update: vi.fn((args: { where: { id: string }; data: Record<string, unknown> }) =>
        Promise.resolve({ ...message, ...args.data, id: args.where.id }),
      ),
      count: vi.fn((_args: unknown) => Promise.resolve(3)),
    },
    issue: { findUnique: vi.fn((_args: unknown) => Promise.resolve(issue)) },
  };
}

beforeEach(() => {
  vi.stubEnv("AI_EXTERNAL_GUARD", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("editMessage (BE-59c)", () => {
  it("lets the sender edit a message and marks it edited", async () => {
    const db = fakeDb();

    const result = await callField("Mutation", "editMessage", { id: "m-1", content: "hello again" }, sender, db);

    expect(result).toMatchObject({ content: "hello again", wasModified: false });
    expect(db.message.update.mock.calls[0]?.[0].data).toMatchObject({ content: "hello again", originalHash: null });
    expect(db.message.update.mock.calls[0]?.[0].data.editedAt).toBeInstanceOf(Date);
  });

  it("masks an email in the edited text and keeps a hash of the original", async () => {
    const db = fakeDb();

    await callField("Mutation", "editMessage", { id: "m-1", content: "mail dev@example.com" }, sender, db);

    const data = db.message.update.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({ content: "mail [REDACTED]", wasModified: true });
    expect(data?.originalHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("refuses edits from anyone but the sender", async () => {
    const db = fakeDb();

    await expect(callField("Mutation", "editMessage", { id: "m-1", content: "hello again" }, outsider, db)).rejects.toThrow(
      "Only the sender can change this message",
    );
    expect(db.message.update).not.toHaveBeenCalled();
  });

  it("locks edits once a dispute is open", async () => {
    const db = fakeDb({ issue: { ...openIssue, status: "DISPUTED" } });

    await expect(callField("Mutation", "editMessage", { id: "m-1", content: "hello again" }, sender, db)).rejects.toThrow(
      "Messages are locked during a dispute",
    );
    expect(db.message.update).not.toHaveBeenCalled();
  });
});

describe("deleteMessage (BE-59c)", () => {
  it("soft-deletes the sender's message and clears its text", async () => {
    const db = fakeDb();

    await expect(callField("Mutation", "deleteMessage", { id: "m-1" }, sender, db)).resolves.toBe(true);

    expect(db.message.update.mock.calls[0]?.[0].data).toMatchObject({ isDeleted: true, content: "" });
    expect(db.message.update.mock.calls[0]?.[0].data.deletedAt).toBeInstanceOf(Date);
  });
});

describe("unreadMessageCount (BE-59d)", () => {
  it("counts unread messages from the other party in the room", async () => {
    const db = fakeDb();

    await expect(callField("Query", "unreadMessageCount", { issueId: "issue-1" }, sender, db)).resolves.toBe(3);
    expect(db.message.count.mock.calls[0]?.[0]).toMatchObject({
      where: { issueId: "issue-1", isDeleted: false, readAt: null, senderId: { not: "client-1" } },
    });
  });

  it("refuses the count to someone outside the task", async () => {
    const db = fakeDb();

    await expect(callField("Query", "unreadMessageCount", { issueId: "issue-1" }, outsider, db)).rejects.toThrow("Forbidden");
    expect(db.message.count).not.toHaveBeenCalled();
  });
});
