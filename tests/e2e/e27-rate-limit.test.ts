import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";

beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));

// Every harness request gets a random IP; this scenario pins one so its per-IP limits are counted in isolation.
const PINNED_IP = "203.0.113.27";
const nonce = (address: string) => fetch(`http://localhost:4012/api/auth/nonce?address=${encodeURIComponent(address)}`, { headers: { "x-forwarded-for": PINNED_IP } });

test("E27: the eleventh nonce request for one address gets 429 with Retry-After", async () => {
  const address = "0x00000000000000000000000000000000000000a5";
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 11; attempt += 1) statuses.push((await nonce(address)).status);
  expect(statuses.slice(0, 10).every((status) => status === 200)).toBe(true);
  expect(statuses[10]).toBe(429);

  const refused = await nonce(address);
  expect(refused.status).toBe(429);
  expect(Number(refused.headers.get("Retry-After"))).toBeGreaterThan(0);
}, 120_000);

test("E27: a burst of GraphQL operations exceeds the point budget and returns 429", async () => {
  const query = JSON.stringify({ query: "query { issues(first: 100) { edges { node { id title } } } }" });
  let refused = 0;
  for (let attempt = 0; attempt < 800 && refused === 0; attempt += 1) {
    const response = await fetch("http://localhost:4012/api/graphql", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": PINNED_IP }, body: query });
    if (response.status === 429) refused += 1;
  }
  expect(refused).toBe(1);
}, 240_000);
