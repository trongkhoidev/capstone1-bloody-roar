import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { fixture } from "./harness/fixture";
import { gqlAs } from "./harness/gql";

beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));
const prepareClaim = `mutation($recipient: String!) { prepareClaim(recipient: $recipient) { intentId } }`;

test("E11: a claim is only prepared for the caller's own wallet with a positive balance", async () => {
  const f = await fixture();
  const foreign = await gqlAs(f.outsider, prepareClaim, { recipient: f.developer.walletAddress });
  expect(foreign.errors?.[0]?.extensions?.code).toBe("FORBIDDEN");
  const empty = await gqlAs(f.outsider, prepareClaim, { recipient: f.outsider.walletAddress });
  expect(empty.errors?.[0]?.extensions?.code).toBe("NOTHING_TO_CLAIM");
}, 60_000);
