import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { stopProcess } from "./process";

const alive = (pid: number) => {
  try { process.kill(pid, 0); return true; } catch { return false; }
};

test.skipIf(process.platform !== "win32")("stopProcess stops a bun started through PATH, as run-local does", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "br-stop-"));
  const script = path.join(dir, "keep-alive.ts");
  await Bun.write(script, "console.log(process.pid);\nsetInterval(() => {}, 1000);\n");
  const child = Bun.spawn(["bun", script], { stdout: "pipe" });
  const { value } = await child.stdout.getReader().read();
  const worker = Number(new TextDecoder().decode(value).trim());
  expect(alive(worker)).toBe(true);

  await stopProcess(child);

  const stillAlive = alive(worker);
  if (stillAlive) process.kill(worker, "SIGKILL");
  await rm(dir, { recursive: true, force: true });
  expect(stillAlive).toBe(false);
}, 30_000);
