import { afterEach, describe, expect, it, vi } from "vitest";
import { completeAI } from "../ai/model-router";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("hosted model router", () => {
  it("uses the preferred provider, records hashes only, and returns usage metadata", async () => {
    vi.stubEnv("AI_BASE_URL", "");
    vi.stubEnv("GROQ_API_KEY", "groq-test-key");
    vi.stubEnv("OPENAI_API_KEY", "openai-test-key");
    const auditEvents: Array<{ status: string; inputHash: string; outputHash?: string }> = [];
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: "openai/gpt-oss-20b",
      choices: [{ message: { content: "{\"sensitiveValues\":[]}" } }],
      usage: { prompt_tokens: 14, completion_tokens: 3 },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await completeAI({
      task: "GUARD",
      messages: [{ role: "user", content: "Please review this chat text." }],
      jsonMode: true,
    }, {
      fetcher: fetcher as typeof fetch,
      audit: async (event) => { auditEvents.push(event); },
    });

    expect(result.provider).toBe("groq");
    expect(result.model).toBe("openai/gpt-oss-20b");
    expect(result.promptTokens).toBe(14);
    expect(result.completionTokens).toBe(3);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(auditEvents[0]?.status).toBe("SUCCESS");
    expect(auditEvents[0]?.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(auditEvents[0]?.outputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(auditEvents)).not.toContain("Please review this chat text.");
  });

  it("falls back to OpenAI when Groq is unavailable", async () => {
    vi.stubEnv("AI_BASE_URL", "");
    vi.stubEnv("GROQ_API_KEY", "groq-test-key");
    vi.stubEnv("OPENAI_API_KEY", "openai-test-key");
    const auditEvents: Array<{ status: string; provider: string }> = [];
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: "ok" } }],
        usage: { prompt_tokens: 4, completion_tokens: 1 },
      }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await completeAI({ task: "TESTGEN", messages: [{ role: "user", content: "Generate checks" }] }, {
      fetcher: fetcher as typeof fetch,
      audit: async (event) => { auditEvents.push(event); },
    });

    expect(result.provider).toBe("openai");
    expect(result.status).toBe("FALLBACK");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(auditEvents.map((event) => `${event.provider}:${event.status}`)).toEqual(["groq:ERROR", "openai:FALLBACK"]);
  });

  it("supports a self-hosted OpenAI-compatible endpoint without an API key", async () => {
    vi.stubEnv("AI_BASE_URL", "http://127.0.0.1:11434/v1/");
    vi.stubEnv("AI_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("AI_MODEL_GUARD", "local-guard");
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "local" } }] }), { status: 200 }));

    const result = await completeAI({ task: "GUARD", messages: [{ role: "user", content: "check" }] }, {
      fetcher: fetcher as typeof fetch,
      audit: async () => undefined,
    });

    expect(fetcher.mock.calls[0]?.[0]).toBe("http://127.0.0.1:11434/v1/chat/completions");
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).model).toBe("local-guard");
    expect(result.provider).toBe("custom");
  });

  it("fails clearly when no provider is configured", async () => {
    vi.stubEnv("AI_BASE_URL", "");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");

    await expect(completeAI({ task: "GUARD", messages: [] }, { audit: async () => undefined }))
      .rejects.toThrow("No AI provider is configured");
  });
});
