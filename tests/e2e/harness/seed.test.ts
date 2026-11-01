import { afterEach, expect, mock, test } from "bun:test";
import { seedTestToken } from "./seed";
const previous = process.env.TEST_DATABASE_URL;
afterEach(() => { process.env.TEST_DATABASE_URL = previous; });
test("seed uses only the local deployment token and never creates users", async () => {
  process.env.TEST_DATABASE_URL = "postgresql://localhost:5433/bloody_codex_test";
  const upsert = mock(async (args: unknown) => args);
  const db = { token: { upsert } };
  await seedTestToken(db as never, { chainId: "31337", token: `0x${"Ab".repeat(20)}` });
  expect(upsert).toHaveBeenCalledTimes(1);
  const args = upsert.mock.calls[0]![0] as { create: { symbol: string; address: string; decimals: number; chainId: number; isActive: boolean } };
  expect(args.create).toEqual({ symbol: "USDC", name: "MockUSDC", address: `0x${"ab".repeat(20)}`, decimals: 6, chainId: 31337, isActive: true });
  await expect(seedTestToken(db as never, { chainId: "1", token: `0x${"ab".repeat(20)}` })).rejects.toThrow();
  process.env.TEST_DATABASE_URL = "postgresql://localhost/bloody_codex_local";
  await expect(seedTestToken(db as never, { chainId: "31337", token: `0x${"ab".repeat(20)}` })).rejects.toThrow();
});
