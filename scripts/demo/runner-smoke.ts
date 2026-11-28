// Demo machine check (US-83): a ZIP source becomes a READY snapshot, a base check runs in Docker to PASSED,
// and the snapshot download link works for the owner and is refused without a session.
//   BASE_URL=http://localhost:4000 bun run scripts/demo/runner-smoke.ts
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ethers } from "./lib/ethers";
import { gqlRequest } from "./lib/gql";
import { loginWallet } from "./lib/session";
import { HARDHAT_MNEMONIC } from "./wallets";

const baseUrl = process.env.BASE_URL ?? "http://localhost:4000";
const clientKey = ethers.Wallet.fromMnemonic(HARDHAT_MNEMONIC, "m/44'/60'/0'/0/2").privateKey;
const session = await loginWallet("client", clientKey, baseUrl);
const headers = { cookie: session.cookie, "x-forwarded-for": session.ip };
const gql = <T>(query: string, variables: Record<string, unknown> = {}) => gqlRequest<T>(query, variables, { ...session, baseUrl }) as Promise<T>;
const until = async <T>(label: string, read: () => Promise<T | null>, seconds: number) => {
  for (let waited = 0; waited < seconds; waited += 2) {
    const value = await read();
    if (value) return value;
    await sleep(2000);
  }
  throw new Error(`Timed out waiting for ${label}`);
};

const dir = await mkdtemp(path.join(tmpdir(), "br-runner-smoke-"));
await mkdir(path.join(dir, "src/src"), { recursive: true });
await writeFile(path.join(dir, "src/package.json"), JSON.stringify({ name: "runner-smoke", type: "module", devDependencies: { vitest: "2.1.9" } }));
await writeFile(path.join(dir, "src/src/sum.js"), "export const sum = (a, b) => a + b;\n");
const zip = path.join(dir, "source.zip");
const zipped = spawnSync("python3", ["-c", "import os,sys,zipfile; r=sys.argv[1]; z=zipfile.ZipFile(sys.argv[2],'w'); [z.write(os.path.join(d,f),os.path.relpath(os.path.join(d,f),r)) for d,_,fs in os.walk(r) for f in fs]; z.close()", path.join(dir, "src"), zip], { encoding: "utf8" });
if (zipped.status !== 0) throw new Error(`zip failed: ${zipped.stderr}`);
const bytes = await readFile(zip);
await rm(dir, { recursive: true, force: true });

const { tokens } = await gql<{ tokens: Array<{ id: string }> }>(`{ tokens { id } }`);
if (!tokens[0]) throw new Error("No active token; run bun run db:seed:local");
const { createIssue } = await gql<{ createIssue: { id: string } }>(`mutation($input: CreateIssueInput!) { createIssue(input: $input) { id } }`,
  { input: { title: "Runner smoke: sum helper", description: "Demo machine check that the Docker test runner reaches PASSED.", category: "BUG_FIX", bountyAmount: "100", tokenId: tokens[0].id } });
const issueId = createIssue.id;

const init = await fetch(`${baseUrl}/api/uploads`, { method: "POST", headers: { ...headers, "content-type": "application/json" },
  body: JSON.stringify({ fileName: "source.zip", fileType: "application/zip", fileSize: bytes.length, purpose: "SOURCE", issueId }) });
if (!init.ok) throw new Error(`upload init ${init.status}: ${await init.text()}`);
const { attachmentId, uploadUrl } = await init.json() as { attachmentId: string; uploadUrl: string };
const put = await fetch(new URL(uploadUrl, baseUrl), { method: "PUT", headers: { ...headers, "content-type": "application/zip" }, body: bytes });
if (!put.ok) throw new Error(`upload put ${put.status}`);
const done = await fetch(`${baseUrl}/api/uploads/complete`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ attachmentId }) });
if (!done.ok) throw new Error(`upload complete ${done.status}: ${await done.text()}`);
await gql(`mutation($issue: ID!, $attachment: ID!) { setIssueSource(issueId: $issue, attachmentId: $attachment) { id } }`, { issue: issueId, attachment: attachmentId });

const source = await until("snapshot READY", async () => {
  const { issueSource } = await gql<{ issueSource: { status: string; error: string | null; downloadUrl: string | null } | null }>(
    `query($issue: ID!) { issueSource(issueId: $issue) { status error downloadUrl } }`, { issue: issueId });
  if (issueSource?.status === "FAILED") throw new Error(`Snapshot failed: ${issueSource.error}`);
  return issueSource?.status === "READY" ? issueSource : null;
}, 300);
console.log("snapshot READY");

const { createTestCase } = await gql<{ createTestCase: { id: string } }>(`mutation($input: CreateTestCaseInput!) { createTestCase(input: $input) { id } }`,
  { input: { issueId, title: "Adds two numbers", description: "sum returns the total", given: "two numbers", when: "sum is called", then: "it returns their total" } });
const testCode = `import { expect, test } from "vitest";\nimport { sum } from "../src/sum.js";\ntest("[TC:${createTestCase.id}] adds two numbers", () => expect(sum(2, 3)).toBe(5));\n`;
await gql(`mutation($input: UpdateTestCaseInput!) { updateTestCase(input: $input) { id } }`,
  { input: { id: createTestCase.id, testCode, testFilePath: "__bloodyroar__/sum.test.js", expectBaseFail: false } });

const run = await until("base check", async () => {
  const { testRuns } = await gql<{ testRuns: Array<{ kind: string; status: string; log: string | null }> }>(`query($issue: ID!) { testRuns(issueId: $issue) { kind status log } }`, { issue: issueId });
  const base = testRuns.find((r) => r.kind === "BASE_CHECK");
  return base && base.status !== "QUEUED" && base.status !== "RUNNING" ? base : null;
}, 900);
console.log(`test run ${run.status}`);

const download = await fetch(new URL(source.downloadUrl!, baseUrl), { headers });
const archive = new Uint8Array(await download.arrayBuffer());
const anonymous = await fetch(new URL(source.downloadUrl!, baseUrl));
console.log(`snapshot download ${download.status} (${archive.length} bytes), without session ${anonymous.status}`);

const ok = run.status === "PASSED" && download.ok && archive[0] === 0x1f && archive[1] === 0x8b && anonymous.status === 401;
if (!ok) {
  if (run.log) console.error(run.log.slice(-2000));
  process.exit(1);
}
console.log(`OK issue ${issueId}`);
