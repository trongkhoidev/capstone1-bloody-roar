import { describe, expect, test } from "bun:test";

const safeEnv = {
  ...process.env,
  AWS_S3_BUCKET: "",
  AI_API_KEY: "",
  GOOGLE_GENERATIVE_AI_API_KEY: "",
  AI_BASE_URL: "",
  TEST_DATABASE_URL: "postgresql://localhost/bloody_codex_test",
};

function check(overrides: Record<string, string>) {
  return Bun.spawnSync(["bun", "run", import.meta.dir + "/check-env.ts"], {
    env: { ...safeEnv, ...overrides },
    stdout: "pipe",
    stderr: "pipe",
  });
}

describe("local environment guard", () => {
  test("accepts an empty AI URL or an HTTP local mock", () => {
    for (const AI_BASE_URL of ["", "http://127.0.0.1:4019", "http://localhost:4019"]) {
      expect(check({ AI_BASE_URL }).exitCode).toBe(0);
    }
  });

  for (const name of ["AWS_S3_BUCKET", "AI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"]) {
    test(`rejects ${name}`, () => {
      const result = check({ [name]: "configured" });
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.toString()).toContain(name);
    });
  }

  for (const AI_BASE_URL of ["https://localhost:4019", "http://localhost.example.com", "invalid"]) {
    test(`rejects AI_BASE_URL ${AI_BASE_URL}`, () => {
      const result = check({ AI_BASE_URL });
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.toString()).toContain("AI_BASE_URL");
    });
  }

  for (const TEST_DATABASE_URL of ["", "postgresql://localhost/bloody_codex_local", "invalid"]) {
    test(`rejects TEST_DATABASE_URL ${TEST_DATABASE_URL}`, () => {
      const result = check({ TEST_DATABASE_URL });
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.toString()).toContain("TEST_DATABASE_URL");
    });
  }
});
