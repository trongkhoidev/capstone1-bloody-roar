import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface S3Storage {
  bucket: string;
  client: S3Client;
}

export function getS3Storage(): S3Storage | null {
  const bucket = process.env.AWS_S3_BUCKET;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey) return null;

  return {
    bucket,
    client: new S3Client({
      region: process.env.AWS_REGION || "ap-southeast-1",
      credentials: { accessKeyId, secretAccessKey },
      // Supabase Storage (S3 protocol): https://<project>.supabase.co/storage/v1/s3, path-style URLs
      ...(process.env.S3_ENDPOINT && {
        endpoint: process.env.S3_ENDPOINT,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
      }),
    }),
  };
}

/** Resolve an upload inside the web app's ignored local storage directory. */
export function localUploadPath(key: string): { root: string; destination: string } | null {
  const cwd = process.cwd();
  const appRoot =
    path.basename(cwd) === "web" && path.basename(path.dirname(cwd)) === "apps"
      ? cwd
      : path.resolve(cwd, "apps/web");
  const root = path.resolve(appRoot, ".uploads");
  const destination = path.resolve(root, key);
  if (!destination.startsWith(`${root}${path.sep}`)) return null;
  return { root, destination };
}

/** Store a server-generated object using the same backend as uploads. */
export async function putObject(key: string, bytes: Uint8Array, mime: string): Promise<void> {
  const storage = getS3Storage();
  if (storage) {
    await storage.client.send(new PutObjectCommand({ Bucket: storage.bucket, Key: key, Body: bytes, ContentType: mime }));
    return;
  }
  if (process.env.NODE_ENV === "production") throw new Error("S3 storage is not configured");
  const local = localUploadPath(key);
  if (!local) throw new Error("Invalid storage key");
  await mkdir(path.dirname(local.destination), { recursive: true });
  await writeFile(local.destination, bytes);
}

export async function getDownloadUrl(key: string, ttlSeconds: number): Promise<string> {
  const storage = getS3Storage();
  if (storage) return getSignedUrl(storage.client, new GetObjectCommand({ Bucket: storage.bucket, Key: key }), { expiresIn: ttlSeconds });
  return `/api/uploads?key=${encodeURIComponent(key)}`;
}
