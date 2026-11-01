import type { S3Client } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getS3Storage } from "../lib/storage";

const CREDENTIALS = { AWS_S3_BUCKET: "attachments", AWS_ACCESS_KEY_ID: "key-id", AWS_SECRET_ACCESS_KEY: "secret" };

function stubEnv(values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
}

// The SDK resolves a configured endpoint lazily; reading it does not touch the network.
async function endpointHost(client: S3Client) {
  const resolve = client.config.endpoint as unknown as () => Promise<{ hostname: string }>;
  return (await resolve()).hostname;
}

describe("getS3Storage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stays off until bucket and credentials are all set", () => {
    stubEnv({ AWS_S3_BUCKET: "", AWS_ACCESS_KEY_ID: "", AWS_SECRET_ACCESS_KEY: "" });
    expect(getS3Storage()).toBeNull();
  });

  it("uses S3_ENDPOINT with path-style URLs by default", async () => {
    stubEnv({ ...CREDENTIALS, S3_ENDPOINT: "https://proj.supabase.co/storage/v1/s3" });

    const storage = getS3Storage();

    expect(storage?.bucket).toBe("attachments");
    expect(storage?.client.config.forcePathStyle).toBe(true);
    expect(await endpointHost(storage!.client)).toBe("proj.supabase.co");
  });

  it("turns path-style off only when S3_FORCE_PATH_STYLE is false", () => {
    stubEnv({ ...CREDENTIALS, S3_ENDPOINT: "https://proj.supabase.co/storage/v1/s3", S3_FORCE_PATH_STYLE: "false" });
    expect(getS3Storage()?.client.config.forcePathStyle).toBe(false);
  });

  it("keeps the AWS default endpoint when S3_ENDPOINT is unset", () => {
    stubEnv({ ...CREDENTIALS, S3_ENDPOINT: "" });
    expect(getS3Storage()?.client.config.endpoint).toBeUndefined();
  });
});
