import "./check-env";
import { closeSync, openSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { rpc } from "./harness/chain";
import { waitFor } from "./harness/waitFor";

const databaseUrl = process.env.TEST_DATABASE_URL!;
assertTestDatabase(databaseUrl);
console.log("Test database:", new URL(databaseUrl).pathname.slice(1));
const runDir = "tests/e2e/.run";
await mkdir(runDir, { recursive: true });
const children: Array<{ name: string; pidPath: string; child: ReturnType<typeof Bun.spawn>; log: number }> = [];
let stopping: Promise<void> | undefined;
const stop = () => stopping ??= (async () => {
  for (const { pidPath, child, log } of [...children].reverse()) {
    const saved = await readFile(pidPath, "utf8").catch(() => "");
    if (saved.trim() === String(child.pid) && child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([child.exited, Bun.sleep(10_000)]);
      if (child.exitCode === null) { child.kill("SIGKILL"); await child.exited; }
    }
    if (saved.trim() === String(child.pid)) await unlink(pidPath).catch(() => {});
    closeSync(log);
  }
})();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void stop().finally(() => process.exit(1)); });
async function assertPortFree(port: number) {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", () => reject(new Error(`Port ${port} is occupied`)));
    server.listen(port, () => server.close(() => resolve()));
  });
}
function start(name: string, command: string[], env: Record<string, string | undefined>, cwd = process.cwd()) {
  const log = openSync(`${runDir}/${name}.log`, "w"), pidPath = `${runDir}/${name}.pid`;
  const child = Bun.spawn(command, { cwd, env, stdout: log, stderr: log });
  children.push({ name, child, pidPath, log });
  return writeFile(pidPath, String(child.pid)).then(() => child);
}
async function waitHealthy(url: string, child: ReturnType<typeof Bun.spawn>, timeout: number) {
  await waitFor(async () => {
    if (child.exitCode !== null) throw new Error(`Process exited before ${url} became healthy`);
    try { return (await fetch(url)).ok; } catch { return false; }
  }, timeout);
}
async function command(name: string, args: string[], env: Record<string, string | undefined>) {
  const result = Bun.spawnSync(args, { env, stdout: "pipe", stderr: "pipe" });
  await Bun.write(`${runDir}/${name}.log`, new Blob([result.stdout, result.stderr]));
  if (result.exitCode !== 0) throw new Error(`${name} failed; see ${runDir}/${name}.log`);
}
let summary = "Harness did not finish";
try {
  for (const port of [8545, 4011, 4012, 4019]) await assertPortFree(port);
  const env = { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl, TEST_DATABASE_URL: databaseUrl,
    RPC_URL: "http://127.0.0.1:8545", CHAIN_ID: "31337", FINALITY: "latest", AI_BASE_URL: "http://127.0.0.1:4019",
    AI_EXTERNAL_GUARD: "false", NEXT_PUBLIC_APP_URL: "http://localhost:4012", WORKER_PORT: "4011", PORT: "4012", NODE_ENV: "development",
    GITHUB_WEBHOOK_SECRET: "harness-webhook-secret" };
  const hardhat = await start("hardhat", ["sh", "-c", "ulimit -n 65536; exec bun run --cwd apps/contracts node"], env);
  await waitFor(async () => {
    if (hardhat.exitCode !== null) throw new Error("Hardhat exited before becoming ready");
    try { return await rpc<string>("eth_chainId") === "0x7a69"; } catch { return false; }
  });
  await command("compile", ["bun", "run", "contracts:compile"], env);
  await command("deploy", ["bun", "run", "--cwd", "apps/contracts", "deploy:local"], env);
  const manifest = await Bun.file("apps/contracts/deployments/localhost.json").json() as { address: string; deployBlock: number; chainId: string };
  if (manifest.chainId !== "31337" || !/^0x[0-9a-fA-F]{40}$/.test(manifest.address) || !Number.isSafeInteger(manifest.deployBlock)) throw new Error("Invalid local deployment manifest");
  const accounts = await rpc<string[]>("eth_accounts");
  if (!accounts[1]) throw new Error("Missing Hardhat admin account");
  Object.assign(env, { ESCROW_ADDRESS: manifest.address, ESCROW_DEPLOY_BLOCK: String(manifest.deployBlock), ADMIN_WALLETS: accounts[1] });
  assertTestDatabase(env.DATABASE_URL);
  console.log("Resetting test database:", new URL(env.DATABASE_URL).pathname.slice(1));
  await command("reset", ["bun", "run", "--cwd", "packages/database", "prisma", "migrate", "reset", "--force", "--skip-seed"], env);
  await command("seed", ["bun", "run", "tests/e2e/harness/seed.ts"], env);
  await start("ai-mock", ["bun", "run", "tests/e2e/mocks/ai-server.ts"], env);
  const worker = await start("worker", ["bun", "src/index.ts"], env, `${process.cwd()}/apps/worker`);
  await waitHealthy("http://localhost:4011/health", worker, 60_000);
  const web = await start("web", ["bun", "server.ts"], env, `${process.cwd()}/apps/web`);
  await waitHealthy("http://localhost:4012/api/health", web, 300_000);
  const files = [...new Bun.Glob("e[0-9][0-9]-*.test.ts").scanSync("tests/e2e")].sort();
  if (files.length) {
    const result = Bun.spawn(["bun", "test", ...files.map((file) => `tests/e2e/${file}`)], { env: { ...env, NODE_ENV: "test" }, stdout: "inherit", stderr: "inherit" });
    if (await result.exited !== 0) throw new Error("E2E tests failed");
  }
  const required = Array.from({ length: 31 }, (_, i) => i + 1);
  const missing = required.filter((n) => !files.some((file) => file.startsWith(`e${String(n).padStart(2, "0")}-`)));
  if (missing.length) throw new Error(`Missing G1 scenarios: ${missing.map((n) => `E${n}`).join(", ")}`);
  summary = "E2E scenarios passed";
} catch (error) {
  summary = error instanceof Error ? error.message : "Harness failed";
  process.exitCode = 1;
} finally {
  await stop();
  await writeFile(`${runDir}/last-run.txt`, `${summary}\n`);
  console.log(summary);
}
