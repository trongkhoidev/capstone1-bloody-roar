// @vitest-environment node
import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createMany: vi.fn(),
  submissionFindFirst: vi.fn(),
  submissionUpdate: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("@bloody-roar/database", () => ({
  PRState: { OPEN: "OPEN", MERGED: "MERGED", CLOSED: "CLOSED" },
  createNotificationIdempotent: mocks.notify,
  prisma: {
    githubWebhookDelivery: { createMany: mocks.createMany },
    submission: { findFirst: mocks.submissionFindFirst, update: mocks.submissionUpdate },
  },
}));

import { POST } from "../app/api/webhooks/github/route";

const secret = "test-webhook-secret";
const payload = JSON.stringify({
  action: "closed",
  repository: { html_url: "https://github.com/acme/app" },
  pull_request: { html_url: "https://github.com/acme/app/pull/12", number: 12, merged: true, merged_at: "2030-03-04T10:00:00Z", head: { sha: "abc123" } },
});

function signed(deliveryId: string | null, body = payload) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-github-event": "pull_request",
    "x-hub-signature-256": `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`,
  };
  if (deliveryId) headers["x-github-delivery"] = deliveryId;
  return new Request("http://localhost/api/webhooks/github", { method: "POST", headers, body });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GITHUB_WEBHOOK_SECRET", secret);
  mocks.submissionFindFirst.mockResolvedValue({
    id: "sub-1",
    issue: { id: "issue-1", title: "Export report", clientId: "client-1", githubRepo: "https://github.com/acme/app" },
  });
  mocks.submissionUpdate.mockResolvedValue({});
  mocks.notify.mockResolvedValue({ id: "n1" });
});

describe("GitHub webhook deliveries", () => {
  it("processes a delivery once and sends the client exactly one PR_MERGED notification", async () => {
    mocks.createMany.mockResolvedValueOnce({ count: 1 });
    const response = await POST(signed("delivery-1"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ matched: true, prState: "MERGED" });
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "client-1", type: "PR_MERGED", dedupeKey: "pr-merged:issue-1:12", data: { issueId: "issue-1", prUrl: "https://github.com/acme/app/pull/12" } }),
    );
  });

  it("treats a redelivered delivery id as a duplicate and does nothing further", async () => {
    mocks.createMany.mockResolvedValueOnce({ count: 0 });
    const response = await POST(signed("delivery-1"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ duplicate: true });
    expect(mocks.submissionFindFirst).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("refuses a delivery without a delivery id", async () => {
    const response = await POST(signed(null));
    expect(response.status).toBe(400);
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it("refuses an unsigned or wrongly signed payload before recording the delivery", async () => {
    const request = new Request("http://localhost/api/webhooks/github", {
      method: "POST",
      headers: { "x-github-event": "pull_request", "x-github-delivery": "delivery-2", "x-hub-signature-256": "sha256=00" },
      body: payload,
    });
    expect((await POST(request)).status).toBe(401);
    expect(mocks.createMany).not.toHaveBeenCalled();
  });
});
