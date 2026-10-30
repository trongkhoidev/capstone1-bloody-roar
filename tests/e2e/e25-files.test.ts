import { beforeAll, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { createEvidence, raiseDispute, waitForPhase } from "./harness/dispute";
import { fixture } from "./harness/fixture";
import { fund, walletOf } from "./harness/funding";
import { login } from "./harness/wallet";

beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));

const BASE = "http://localhost:4012";
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

// Two-step upload over HTTP: announce, send the bytes, then confirm. Returns the attachment and its download URL.
async function upload(cookie: string, purpose: "DELIVERY" | "EVIDENCE", issueId: string, content: Uint8Array) {
  const start = await fetch(`${BASE}/api/uploads`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ fileName: `${randomUUID()}.txt`, fileType: "text/plain", fileSize: content.byteLength, purpose, issueId }),
  });
  expect(start.status).toBe(200);
  const { attachmentId, uploadUrl, fileUrl } = (await start.json()) as { attachmentId: string; uploadUrl: string; fileUrl: string };

  const sent = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": "text/plain", cookie }, body: content });
  expect(sent.status).toBe(200);

  const done = await fetch(`${BASE}/api/uploads/complete`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ attachmentId }),
  });
  expect(done.status).toBe(200);
  return { attachmentId, fileUrl, sha256: ((await done.json()) as { sha256: string }).sha256 };
}

const download = (cookie: string | undefined, fileUrl: string) => fetch(fileUrl, { headers: cookie ? { cookie } : {} });

test("E25: delivery files reach only the task's parties, evidence reaches an admin during a dispute, and hashes match", async () => {
  const f = await fixture();
  await fund(f);
  const developerCookie = (await login(walletOf(f, f.developer))).cookie;
  const clientCookie = (await login(walletOf(f, f.client))).cookie;
  const outsiderCookie = (await login(walletOf(f, f.outsider))).cookie;
  const adminCookie = (await login(walletOf(f, f.admin))).cookie;

  const content = new TextEncoder().encode(`delivery bytes ${randomUUID()}`);
  const delivered = await upload(developerCookie, "DELIVERY", f.issueId, content);
  expect(delivered.sha256).toBe(sha256(content));

  expect((await download(clientCookie, delivered.fileUrl)).status).toBe(200);
  expect(new Uint8Array(await (await download(developerCookie, delivered.fileUrl)).arrayBuffer())).toEqual(content);
  expect((await download(outsiderCookie, delivered.fileUrl)).status).toBe(403);
  expect((await download(undefined, delivered.fileUrl)).status).toBe(401);

  const statement = "The delivered file is incomplete against the acceptance criterion.";
  const evidenceBytes = new TextEncoder().encode(`evidence ${randomUUID()}`);
  const evidenceFile = await upload(clientCookie, "EVIDENCE", f.issueId, evidenceBytes);
  const manifest = await createEvidence(f, f.client, statement, [evidenceFile.attachmentId]);
  await raiseDispute(f, f.client, manifest.id);
  await waitForPhase(f, "DISPUTED");

  const adminView = await download(adminCookie, evidenceFile.fileUrl);
  expect(adminView.status).toBe(200);
  expect(new Uint8Array(await adminView.arrayBuffer())).toEqual(evidenceBytes);
  expect(await f.prisma.adminLog.count({ where: { adminId: f.admin.id, action: "view_evidence", targetId: f.issueId } })).toBe(1);
  expect((await download(outsiderCookie, evidenceFile.fileUrl)).status).toBe(403);
}, 180_000);
