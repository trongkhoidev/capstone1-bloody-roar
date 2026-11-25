const key = process.env.DEEPSEEK_API_KEY;
if (!key) throw new Error("Set DEEPSEEK_API_KEY");
const model = process.env.DEEPSEEK_MODEL_TESTGEN ?? "deepseek-flash";

const prefix = Array.from({ length: 400 }, (_, i) => `export function f${i}(a: number): number { return a * ${i} + ${i % 7}; }`).join("\n");
const messages = (tail: string) => [
  { role: "system", content: "You write vitest tests. Reply in json like {\"code\":\"...\"}." },
  { role: "user", content: `<repo_source trust="untrusted">\n${prefix}\n</repo_source>` },
  { role: "user", content: tail },
];

async function call(label: string, tail: string, extra: Record<string, unknown>, maxTokens: number) {
  const started = Date.now();
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: messages(tail), max_tokens: maxTokens, response_format: { type: "json_object" }, ...extra }),
  });
  const body = await res.json() as any;
  const u = body.usage ?? {};
  console.log(label.padEnd(26), res.status, `${Date.now() - started}ms`,
    `hit=${u.prompt_cache_hit_tokens} miss=${u.prompt_cache_miss_tokens} out=${u.completion_tokens}`,
    `reasoning=${u.completion_tokens_details?.reasoning_tokens ?? "?"}`,
    `blank=${!body.choices?.[0]?.message?.content?.trim()}`, res.ok ? "" : JSON.stringify(body).slice(0, 300));
}

const off = { thinking: { type: "disabled" } };
await call("1 no-think (cold)", "Write a json test for f3(2).", off, 800);
await new Promise((r) => setTimeout(r, 5000)); // cache entries take seconds to build
await call("2 no-think (same prefix)", "Write a json test for f5(1).", off, 800);
await call("3 think low", "Write a json test for f9(4).", { thinking: { type: "enabled" }, reasoning_effort: "low" }, 2000);
await call("4 think default, 300 max", "Write a json test for f11(3).", {}, 300);
export {};
