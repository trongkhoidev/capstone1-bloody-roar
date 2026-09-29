import path from "node:path";
import { S3Client } from "@aws-sdk/client-s3";

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
