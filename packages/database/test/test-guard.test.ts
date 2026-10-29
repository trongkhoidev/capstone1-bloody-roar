import { expect, test } from "bun:test";
import { assertTestDatabase } from "../src/test-guard";

test("only accepts PostgreSQL test databases", () => {
  expect(() => assertTestDatabase("postgresql://localhost/bloody_codex_test")).not.toThrow();
  for (const url of [undefined, "postgresql://localhost/bloody_roar_local", "postgresql://localhost/bloody_codex_local", "postgresql://localhost/other", "not-a-url", "http://localhost/name_test"]) {
    expect(() => assertTestDatabase(url)).toThrow();
  }
});
