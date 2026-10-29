export function startAiMock() {
  let calls = 0;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 4019,
    async fetch(request) {
      if (request.method !== "POST" || new URL(request.url).pathname !== "/chat/completions") {
        return new Response("Not found", { status: 404 });
      }
      const body = await request.json() as { messages?: Array<{ role: string; content: string }> };
      const system = body.messages?.find((message) => message.role === "system")?.content ?? "";
      const user = body.messages?.find((message) => message.role === "user")?.content ?? "";
      let result: object;
      if (system.includes("sensitiveValues")) {
        result = { sensitiveValues: [] };
      } else if (system.includes("testCases")) {
        result = { testCases: ["success", "validation", "edge case"].map((name) => ({
          title: `Verify ${name}`, description: `Verify the ${name} behavior of the task.`,
          given: "the task is ready", when: `the user exercises ${name}`,
          then: "the expected result is returned", priority: "NORMAL", isEdgeCase: name === "edge case",
        })) };
      } else if (system.includes("suggestedClientRatio")) {
        let evidence: { task?: { id?: string } };
        try { evidence = JSON.parse(user); } catch { return new Response("Invalid evidence", { status: 400 }); }
        if (!evidence.task?.id) return new Response("Missing task id", { status: 400 });
        result = {
          summary: "The available task evidence was reviewed for this dispute.",
          suggestedClientRatio: 50, confidenceScore: 0.5,
          findings: [{ evidenceType: "TASK", evidenceId: evidence.task.id, side: "NEUTRAL", finding: "The task description states the requested work." }],
          missingEvidence: [], reasoning: "The available evidence supports an advisory assessment and requires a human decision.",
        };
      } else {
        return new Response("Unknown AI request", { status: 400 });
      }
      calls++;
      return Response.json({ model: "local-mock", choices: [{ message: { content: JSON.stringify(result) } }], usage: { prompt_tokens: 0, completion_tokens: 0 } });
    },
  });
  return { server, get calls() { return calls; } };
}

if (import.meta.main) startAiMock();
