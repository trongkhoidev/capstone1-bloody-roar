import { createHash } from "node:crypto";
import { AILogStatus, prisma } from "@bloody-roar/database";

export type AIWorkload = "GUARD" | "TESTGEN" | "DEBATE";
export type AIMessage = { role: "system" | "user"; content: string };

export interface AICompletionInput {
  task: AIWorkload;
  messages: AIMessage[];
  issueId?: string;
  disputeId?: string;
  jsonMode?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface AICompletion {
  text: string;
  model: string;
  provider: string;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  status: "SUCCESS" | "FALLBACK";
}

interface AIProvider {
  name: string;
  endpoint: string;
  apiKey?: string;
  model: string;
}

interface AIAuditEvent {
  task: AIWorkload;
  model: string;
  provider: string;
  issueId?: string;
  disputeId?: string;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  inputHash: string;
  outputHash?: string;
  status: "SUCCESS" | "FALLBACK" | "ERROR";
  errorMessage?: string;
}

export interface AIRouterDependencies {
  fetcher?: typeof fetch;
  audit?: (event: AIAuditEvent) => Promise<void>;
}

const GROQ_MODELS: Record<AIWorkload, string> = {
  GUARD: "openai/gpt-oss-20b",
  TESTGEN: "openai/gpt-oss-120b",
  DEBATE: "openai/gpt-oss-120b",
};

const OPENAI_MODELS: Record<AIWorkload, string> = {
  GUARD: "gpt-4.1-mini",
  TESTGEN: "gpt-4.1-mini",
  DEBATE: "gpt-4.1-mini",
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function modelOverride(provider: "AI" | "GROQ" | "OPENAI", task: AIWorkload) {
  return process.env[`${provider}_MODEL_${task}`];
}

function buildProviders(task: AIWorkload): AIProvider[] {
  const providers: AIProvider[] = [];
  const customBaseUrl = process.env.AI_BASE_URL?.trim().replace(/\/+$/, "");
  if (customBaseUrl) {
    providers.push({
      name: "custom",
      endpoint: customBaseUrl.endsWith("/chat/completions") ? customBaseUrl : `${customBaseUrl}/chat/completions`,
      ...(process.env.AI_API_KEY ? { apiKey: process.env.AI_API_KEY } : {}),
      model: modelOverride("AI", task) || "openai/gpt-oss-20b",
    });
  }

  if (process.env.GROQ_API_KEY) {
    providers.push({
      name: "groq",
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: process.env.GROQ_API_KEY,
      model: modelOverride("GROQ", task) || GROQ_MODELS[task],
    });
  }

  if (process.env.OPENAI_API_KEY) {
    providers.push({
      name: "openai",
      endpoint: "https://api.openai.com/v1/chat/completions",
      apiKey: process.env.OPENAI_API_KEY,
      model: modelOverride("OPENAI", task) || OPENAI_MODELS[task],
    });
  }

  return providers;
}

export function isAIConfigured(task: AIWorkload) {
  return buildProviders(task).length > 0;
}

async function persistAudit(event: AIAuditEvent) {
  await prisma.aILog.create({
    data: {
      task: event.task,
      provider: event.provider,
      model: event.model,
      ...(event.issueId ? { issueId: event.issueId } : {}),
      ...(event.disputeId ? { disputeId: event.disputeId } : {}),
      latencyMs: event.latencyMs,
      ...(event.promptTokens !== null ? { promptTokens: event.promptTokens } : {}),
      ...(event.completionTokens !== null ? { completionTokens: event.completionTokens } : {}),
      inputHash: event.inputHash,
      ...(event.outputHash ? { outputHash: event.outputHash } : {}),
      status: event.status === "SUCCESS" ? AILogStatus.SUCCESS : event.status === "FALLBACK" ? AILogStatus.FALLBACK : AILogStatus.ERROR,
      ...(event.errorMessage ? { errorMessage: event.errorMessage.slice(0, 250) } : {}),
    },
  });
}

function timeoutFor(task: AIWorkload) {
  if (task === "GUARD") return 2500;
  const configured = Number.parseInt(process.env.AI_TIMEOUT_MS || "12000", 10);
  return Number.isFinite(configured) ? Math.min(Math.max(configured, 1000), 60000) : 12000;
}

/**
 * Calls an OpenAI-compatible hosted or self-hosted model and writes hashes and
 * usage metadata to AILog. Prompt and response text are never persisted.
 */
export async function completeAI(input: AICompletionInput, dependencies: AIRouterDependencies = {}): Promise<AICompletion> {
  const providers = buildProviders(input.task);
  if (!providers.length) throw new Error("No AI provider is configured. Set GROQ_API_KEY, OPENAI_API_KEY, or AI_BASE_URL.");

  const fetcher = dependencies.fetcher ?? fetch;
  const audit = dependencies.audit ?? persistAudit;
  const inputHash = sha256(input.messages.map((message) => `${message.role}:${message.content}`).join("\n"));
  const errors: string[] = [];

  for (const [index, provider] of providers.entries()) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? timeoutFor(input.task));
    try {
      const response = await fetcher(provider.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: provider.model,
          messages: input.messages,
          max_tokens: input.maxTokens ?? (input.task === "GUARD" ? 300 : 1800),
          ...(input.jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json() as {
        model?: string;
        choices?: Array<{ message?: { content?: string | null } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = body.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error("The provider returned an empty completion");

      const latencyMs = Date.now() - startedAt;
      const status = index === 0 ? "SUCCESS" : "FALLBACK";
      const result: AICompletion = {
        text,
        model: body.model || provider.model,
        provider: provider.name,
        latencyMs,
        promptTokens: Number.isInteger(body.usage?.prompt_tokens) ? body.usage!.prompt_tokens! : null,
        completionTokens: Number.isInteger(body.usage?.completion_tokens) ? body.usage!.completion_tokens! : null,
        status,
      };

      await audit({
        task: input.task,
        model: result.model,
        provider: result.provider,
        ...(input.issueId ? { issueId: input.issueId } : {}),
        ...(input.disputeId ? { disputeId: input.disputeId } : {}),
        latencyMs,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        inputHash,
        outputHash: sha256(text),
        status,
      }).catch(() => undefined);

      return result;
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const message = error instanceof Error && error.name === "AbortError" ? "request timed out" : error instanceof Error ? error.message : "request failed";
      errors.push(`${provider.name}: ${message}`);
      await audit({
        task: input.task,
        model: provider.model,
        provider: provider.name,
        ...(input.issueId ? { issueId: input.issueId } : {}),
        ...(input.disputeId ? { disputeId: input.disputeId } : {}),
        latencyMs,
        promptTokens: null,
        completionTokens: null,
        inputHash,
        status: "ERROR",
        errorMessage: message,
      }).catch(() => undefined);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`AI providers could not complete this request (${errors.join("; ")}).`);
}
