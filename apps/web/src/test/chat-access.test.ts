import { describe, expect, it } from "vitest";
import { canReadIssueChat, canWriteIssueChat } from "../lib/chat-access";

const client = { id: "client-1", role: "CLIENT" };
const developer = { id: "dev-1", role: "DEVELOPER" };
const outsider = { id: "other-1", role: "DEVELOPER" };
const admin = { id: "admin-1", role: "ADMIN" };

describe("task chat access", () => {
  it("opens read/write access to the selected client and developer while work is active", () => {
    const issue = { clientId: client.id, developerId: developer.id, status: "IN_PROGRESS" };

    expect(canReadIssueChat(issue, client)).toBe(true);
    expect(canReadIssueChat(issue, developer)).toBe(true);
    expect(canWriteIssueChat(issue, client)).toBe(true);
    expect(canWriteIssueChat(issue, developer)).toBe(true);
    expect(canWriteIssueChat(issue, outsider)).toBe(false);
  });

  it("does not open a room before a developer is assigned", () => {
    const issue = { clientId: client.id, developerId: null, status: "OPEN" };

    expect(canReadIssueChat(issue, client)).toBe(false);
    expect(canWriteIssueChat(issue, client)).toBe(false);
  });

  it("keeps completed and disputed history read-only for participants", () => {
    for (const status of ["COMPLETED", "DISPUTED"]) {
      const issue = { clientId: client.id, developerId: developer.id, status };
      expect(canReadIssueChat(issue, client)).toBe(true);
      expect(canWriteIssueChat(issue, client)).toBe(false);
    }
  });

  it("allows an administrator to inspect disputed evidence only", () => {
    expect(canReadIssueChat({ clientId: client.id, developerId: developer.id, status: "DISPUTED" }, admin)).toBe(true);
    expect(canReadIssueChat({ clientId: client.id, developerId: developer.id, status: "IN_PROGRESS" }, admin)).toBe(false);
    expect(canWriteIssueChat({ clientId: client.id, developerId: developer.id, status: "DISPUTED" }, admin)).toBe(false);
  });
});
