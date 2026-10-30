import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { rpc } from "./harness/chain";

beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));

// The worker must stop before it indexes anything when the chain config is wrong.
async function startWorkerWith(overrides: Record<string, string>) {
  const child = Bun.spawn(["bun", "src/index.ts"], {
    cwd: `${process.cwd()}/apps/worker`,
    env: { ...process.env, WORKER_PORT: "4013", ...overrides },
    stdout: "pipe",
    stderr: "pipe",
  });
  const exit = await Promise.race([child.exited, Bun.sleep(20_000).then(() => "timeout" as const)]);
  if (exit === "timeout") child.kill();
  // The logger writes to stdout; errors can appear on either stream.
  const output = (await new Response(child.stdout).text()) + (await new Response(child.stderr).text());
  return { exit, stderr: output };
}

test("E29: the worker exits when ESCROW_ADDRESS is an account with no contract code", async () => {
  const [, , , , , , , , , eoa] = await rpc<string[]>("eth_accounts");
  const { exit, stderr } = await startWorkerWith({ ESCROW_ADDRESS: eoa! });
  expect(exit).toBe(1);
  expect(stderr).toContain("No contract code at ESCROW_ADDRESS");
}, 60_000);

test("E29: the worker exits when CHAIN_ID does not match the node", async () => {
  const escrow = process.env.ESCROW_ADDRESS!;
  const { exit, stderr } = await startWorkerWith({ CHAIN_ID: "1", ESCROW_ADDRESS: escrow });
  expect(exit).toBe(1);
  expect(stderr).toContain("CHAIN_ID mismatch");
}, 60_000);
