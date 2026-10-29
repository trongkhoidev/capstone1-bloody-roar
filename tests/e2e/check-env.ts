import { assertTestDatabase } from "@bloody-roar/database/test-guard";

const forbidden = ["AWS_S3_BUCKET", "AI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"] as const;

for (const name of forbidden) {
  if (process.env[name]) throw new Error(`${name} must be empty for local tests`);
}

const aiBaseUrl = process.env.AI_BASE_URL;
if (aiBaseUrl) {
  let url: URL;
  try {
    url = new URL(aiBaseUrl);
  } catch {
    throw new Error("AI_BASE_URL must point to the local mock");
  }
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("AI_BASE_URL must point to the local mock");
  }
}

assertTestDatabase(process.env.TEST_DATABASE_URL);
