import { z } from "zod";
import { completeAI, isAIConfigured, type AICompletion } from "../model-router";
import { scanAndMask, type GuardResult } from "./scanner";

const GuardResponseSchema = z.object({
  sensitiveValues: z.array(z.string().min(1).max(1000)).max(25),
});

function parseModelJson(text: string) {
  const unfenced = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("The guard model returned invalid JSON");
  return JSON.parse(unfenced.slice(start, end + 1));
}

export interface GuardMessageOptions {
  issueId?: string;
  completion?: (input: Parameters<typeof completeAI>[0]) => Promise<AICompletion>;
}

/** Regex masking always runs first; the optional model may only add exact redactions. */
export async function guardMessage(content: string, options: GuardMessageOptions = {}): Promise<GuardResult> {
  const local = scanAndMask(content);
  const completion = options.completion ?? completeAI;
  if (!options.completion && !isAIConfigured("GUARD")) return local;

  try {
    const result = await completion({
      task: "GUARD",
      ...(options.issueId ? { issueId: options.issueId } : {}),
      jsonMode: true,
      maxTokens: 300,
      timeoutMs: 2500,
      messages: [
        {
          role: "system",
          content: "You are a security classifier. Return JSON {\"sensitiveValues\":[...]} containing only exact sensitive substrings such as credentials, private keys, seed phrases, personal email addresses, or phone numbers. Do not include explanations, do not rewrite or return the full message, and return an empty array when nothing is sensitive.",
        },
        { role: "user", content: local.content },
      ],
    });
    const parsed = GuardResponseSchema.safeParse(parseModelJson(result.text));
    if (!parsed.success) return local;

    let masked = local.content;
    const modelMatches: string[] = [];
    for (const value of parsed.data.sensitiveValues) {
      if (!masked.includes(value)) continue;
      masked = masked.split(value).join("[REDACTED]");
      modelMatches.push("model-detected-sensitive-value");
    }

    const finalScan = scanAndMask(masked);
    return {
      content: finalScan.content,
      wasModified: local.wasModified || finalScan.wasModified || masked !== local.content,
      matches: [...new Set([...local.matches, ...modelMatches, ...finalScan.matches])],
    };
  } catch {
    return local;
  }
}
