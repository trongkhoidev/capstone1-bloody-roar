import { describe, expect, it } from "vitest";
import { parseEnv } from "../lib/config/env";

describe("parseEnv", () => {
  it("does not require production variables outside production", () => {
    expect(() => parseEnv({ NODE_ENV: "development" })).not.toThrow();
  });

  it("names the missing variable in production", () => {
    expect(() => parseEnv({ NODE_ENV: "production", AI_HASH_KEY: "key" })).toThrow(
      "Invalid environment: DATABASE_URL: required in production",
    );
  });

  it("treats an empty variable as missing", () => {
    expect(() =>
      parseEnv({ NODE_ENV: "production", DATABASE_URL: "postgres://db", AI_HASH_KEY: "" }),
    ).toThrow(/AI_HASH_KEY/);
  });

  it("returns the values when production variables are set", () => {
    const env = parseEnv({ NODE_ENV: "production", DATABASE_URL: "postgres://db", AI_HASH_KEY: "key" });
    expect(env.AI_HASH_KEY).toBe("key");
  });
});
