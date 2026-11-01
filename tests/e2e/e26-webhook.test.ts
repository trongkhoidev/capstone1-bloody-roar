import { beforeAll, expect, test } from "bun:test";
import { createHmac, randomUUID } from "node:crypto";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { fixture } from "./harness/fixture";
import { fund } from "./harness/funding";
import { waitFor } from "./harness/waitFor";

beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));

const secret = process.env.GITHUB_WEBHOOK_SECRET!;
const repo = "https://github.com/acme/harness-app";

function signedDelivery(deliveryId: string, body: string) {
  return fetch("http://localhost:4012/api/webhooks/github", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-github-event": "pull_request",
      "x-github-delivery": deliveryId,
      "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
    },
    body,
  });
}

test("E26: a signed merged-PR webhook notifies the client once, and a redelivery does nothing", async () => {
  const f = await fixture();
  await fund(f);
  const prNumber = 4_200 + Math.floor(Math.random() * 500);
  const prUrl = `${repo}/pull/${prNumber}`;
  await f.prisma.issue.update({ where: { id: f.issueId }, data: { githubRepo: repo } });
  await f.prisma.submission.create({ data: { issueId: f.issueId, developerId: f.developer.id, description: "PR delivery", pullRequestUrl: prUrl, status: "SUBMITTED" } });

  const payload = JSON.stringify({
    action: "closed",
    repository: { html_url: repo },
    pull_request: { html_url: prUrl, number: prNumber, merged: true, merged_at: new Date().toISOString(), head: { sha: "f00dcafe" } },
  });
  const deliveryId = randomUUID();

  const first = await signedDelivery(deliveryId, payload);
  expect(first.status).toBe(200);
  expect(await first.json()).toMatchObject({ matched: true, prState: "MERGED" });
  await waitFor(async () => (await f.prisma.notification.count({ where: { userId: f.client.id, type: "PR_MERGED", data: { path: ["issueId"], equals: f.issueId } } })) === 1);

  const again = await signedDelivery(deliveryId, payload);
  expect(await again.json()).toEqual({ duplicate: true });
  expect(await f.prisma.notification.count({ where: { userId: f.client.id, type: "PR_MERGED", data: { path: ["issueId"], equals: f.issueId } } })).toBe(1);
}, 120_000);
