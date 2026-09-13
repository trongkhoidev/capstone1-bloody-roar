import { describe, expect, it } from "vitest";
import { scanAndMask } from "../ai/guard/scanner";
import { guardMessage } from "../ai/guard/service";
import type { AICompletion } from "../ai/model-router";

describe("AI Guard local rules", () => {
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
