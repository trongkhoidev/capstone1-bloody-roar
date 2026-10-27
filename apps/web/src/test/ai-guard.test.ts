import { afterEach, describe, expect, it, vi } from "vitest";
import { scanAndMask } from "../ai/guard/scanner";
import { guardMessage } from "../ai/guard/service";
import type { AICompletion } from "../ai/model-router";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("AI Guard local rules", () => {
  it("keeps tx and bytes32 hashes but still masks a bare private key", () => {
    const hash = `0x${"a1".repeat(32)}`;
    const key = `0x${"b2".repeat(32)}`;
    const text = `Settled in tx ${hash}, termsHash: ${hash}, decisionHash="${hash}"`;

    expect(scanAndMask(text).content).toBe(text);
    expect(scanAndMask(`my wallet key ${key}`).content).toBe("my wallet key [REDACTED]");
  });

  it("does not call the hosted guard model unless AI_EXTERNAL_GUARD is true", async () => {
    vi.stubEnv("GROQ_API_KEY", "groq-test-key");
    vi.stubEnv("AI_EXTERNAL_GUARD", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await guardMessage("Email dev@example.com for access.");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.content).toBe("Email [REDACTED] for access.");
  });

  it("masks credential strings and records only the rule names", () => {
    const result = scanAndMask("Email dev@example.com and key=sk-proj-123456789012345678901234");

    expect(result.wasModified).toBe(true);
    expect(result.content).not.toContain("dev@example.com");
    expect(result.content).not.toContain("sk-proj-");
    expect(result.content.match(/\[REDACTED\]/g)).toHaveLength(2);
    expect(result.matches).toContain("email");
    expect(result.matches).toContain("openai-key");
  });

  it("leaves ordinary chat text unchanged", () => {
    const text = "I will send the pull request for review this afternoon.";
    expect(scanAndMask(text)).toEqual({ content: text, wasModified: false, matches: [] });
  });

  it("adds exact model redactions without rewriting the rest of a message", async () => {
    const secretPhrase = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu";
    const completion: AICompletion = {
      text: JSON.stringify({ sensitiveValues: [secretPhrase] }),
      model: "test-model",
      provider: "test",
      latencyMs: 1,
      promptTokens: 10,
      completionTokens: 4,
      status: "SUCCESS",
    };

    const result = await guardMessage(`Please never share this recovery phrase: ${secretPhrase}`, {
      completion: async () => completion,
    });

    expect(result.content).toBe("Please never share this recovery phrase: [REDACTED]");
    expect(result.wasModified).toBe(true);
    expect(result.matches).toContain("model-detected-sensitive-value");
  });

  it("keeps deterministic masking available when the model fails", async () => {
    const result = await guardMessage("Email dev@example.com for access.", {
      completion: async () => { throw new Error("provider unavailable"); },
    });

    expect(result.content).toBe("Email [REDACTED] for access.");
    expect(result.wasModified).toBe(true);
  });
});
