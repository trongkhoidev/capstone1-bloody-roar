import type { Subprocess } from "bun";

export async function stopProcess(child: Subprocess, timeoutMs = 10_000) {
  if (process.platform === "win32") {
    Bun.spawnSync(["taskkill", "/PID", String(child.pid), "/T", "/F"], { stdout: "ignore", stderr: "ignore" });
    await child.exited;
    return;
  }
  child.kill("SIGTERM");
  await Promise.race([child.exited, Bun.sleep(timeoutMs)]);
  if (child.exitCode === null) { child.kill("SIGKILL"); await child.exited; }
}
