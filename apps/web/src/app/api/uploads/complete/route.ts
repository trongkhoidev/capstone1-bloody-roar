import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@bloody-roar/database";
import { tokenFromRequest, verifyJWT } from "@/lib/auth";
import { getS3Storage, localUploadPath } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reads the stored bytes for a key: from S3 when configured, otherwise from the local upload folder.
async function readStoredBytes(key: string): Promise<Uint8Array | null> {
  const s3 = getS3Storage();
  if (s3) {
    const object = await s3.client.send(new GetObjectCommand({ Bucket: s3.bucket, Key: key }));
    const body = object.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
    return body?.transformToByteArray ? body.transformToByteArray() : null;
  }
  const localPath = localUploadPath(key);
  if (!localPath) return null;
  return readFile(localPath.destination).then((bytes) => new Uint8Array(bytes)).catch(() => null);
}

// Step two of an upload: confirm the bytes arrived at the declared size, then record their SHA-256.
export async function POST(request: Request) {
  const token = tokenFromRequest(request);
  const user = token ? await verifyJWT(token) : null;
  if (!user || user.isBanned)
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { attachmentId?: unknown } | null;
  const attachmentId = typeof body?.attachmentId === "string" ? body.attachmentId : "";
  if (!attachmentId) return NextResponse.json({ error: "attachmentId is required" }, { status: 400 });

  const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!attachment) return NextResponse.json({ error: "Upload not found" }, { status: 404 });
  if (attachment.uploaderId !== user.id)
    return NextResponse.json({ error: "Only the uploader can complete this upload" }, { status: 403 });
  if (attachment.status !== "PENDING")
    return NextResponse.json({ error: "Upload is already complete" }, { status: 409 });

  const key = new URL(attachment.fileUrl, "http://localhost").searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Upload has no stored key" }, { status: 400 });
  if (!getS3Storage() && process.env.NODE_ENV === "production")
    return NextResponse.json({ error: "S3 storage is not configured" }, { status: 503 });

  const bytes = await readStoredBytes(key);
  if (!bytes) return NextResponse.json({ error: "Stored file not found" }, { status: 404 });
  // A short or oversized file keeps the attachment PENDING so the client can upload it again.
  if (bytes.byteLength !== attachment.fileSize)
    return NextResponse.json({ error: "Stored file size does not match the declared size" }, { status: 400 });

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await prisma.$transaction([
    prisma.attachment.update({ where: { id: attachment.id }, data: { sha256, status: "ATTACHED" } }),
    ...(attachment.purpose === "AVATAR"
      ? [prisma.user.update({ where: { id: user.id }, data: { avatar: attachment.fileUrl } })]
      : []),
  ]);
  return NextResponse.json({ attachmentId: attachment.id, sha256 });
}
