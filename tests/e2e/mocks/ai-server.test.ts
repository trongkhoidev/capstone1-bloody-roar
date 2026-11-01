import { afterAll, expect, test } from "bun:test";
import { startAiMock } from "./ai-server";

const mock = startAiMock();
afterAll(() => mock.server.stop(true));

async function complete(system: string, user = "") {
  const response = await fetch("http://127.0.0.1:4019/chat/completions", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  expect(response.status).toBe(200);
  const body = await response.json() as { choices: Array<{ message: { content: string } }> };
  return JSON.parse(body.choices[0]!.message.content);
}

test("mock responds to each supported AI workload and counts requests", async () => {
  expect((await complete("sensitiveValues")).sensitiveValues).toEqual([]);
  expect((await complete("testCases")).testCases).toHaveLength(3);
  const report = await complete("suggestedClientBps", JSON.stringify({ task: { id: "issue-1" } }));
  expect(report.findings[0].evidenceId).toBe("issue-1");
  expect(mock.calls).toBe(3);
});

test("model router uses the mock without contacting other providers", async () => {
  process.env.AI_BASE_URL = "http://127.0.0.1:4019";
  process.env.AI_API_KEY = "";
  process.env.GROQ_API_KEY = "";
  process.env.OPENAI_API_KEY = "";
  const { completeAI } = await import("../../../apps/web/src/ai/model-router");
  const result = await completeAI({
    task: "GUARD", jsonMode: true,
    messages: [{ role: "system", content: "sensitiveValues" }, { role: "user", content: "test" }],
  }, { audit: async () => undefined });
  expect(JSON.parse(result.text)).toEqual({ sensitiveValues: [] });
  expect(result.provider).toBe("custom");
  expect(mock.calls).toBe(4);
});
