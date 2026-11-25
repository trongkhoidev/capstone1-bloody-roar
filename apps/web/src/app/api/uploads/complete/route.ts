import { isUtf8 } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { NextResponse } from "next/server";
import { DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@bloody-roar/database";
import { CHAT_FILE_TYPES, CHAT_MAX_FILE_SIZE_BYTES } from "@bloody-roar/shared";
import { scanAndMask } from "@/ai/guard/scanner";
import { clearAuthCache, tokenFromRequest, verifyJWT } from "@/lib/auth";
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

const SIGNATURES: Record<string, (head: string) => boolean> = {
  "image/jpeg": (head) => head.startsWith("\xff\xd8\xff"),
  "image/png": (head) => head.startsWith("\x89PNG\r\n\x1a\n"),
  "image/gif": (head) => /^GIF8[79]a/.test(head),
  "image/webp": (head) => head.startsWith("RIFF") && head.slice(8, 12) === "WEBP",
  "application/pdf": (head) => head.startsWith("%PDF-"),
};
const NOT_SECRET = new Set(["email", "vietnamese-phone", "us-phone"]);

function chatRejection(mime: string, bytes: Uint8Array, fileName: string) {
  if (!CHAT_FILE_TYPES.includes(mime as never)) return { error: "This file type can't be sent in chat", code: "FILE_TYPE_NOT_ALLOWED" };
  if (bytes.byteLength > CHAT_MAX_FILE_SIZE_BYTES) return { error: "Chat files must be 10 MB or smaller", code: "FILE_TOO_LARGE" };
  const signature = SIGNATURES[mime];
  const matchesType = signature ? signature(Buffer.from(bytes.subarray(0, 12)).toString("latin1")) : isUtf8(bytes) && !bytes.includes(0);
  if (!matchesType) return { error: "The file content doesn't match its type", code: "FILE_CONTENT_MISMATCH" };
  const secret = [signature ? "" : new TextDecoder().decode(bytes), fileName]
    .map((text) => scanAndMask(text).matches.find((match) => !NOT_SECRET.has(match)))
    .find(Boolean);
  return secret ? { error: `This file contains a secret (${secret}) and can't be sent in chat`, code: "FILE_CONTAINS_SECRET" } : null;
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

  const rejection = attachment.purpose === "CHAT" ? chatRejection(attachment.fileMime, bytes, attachment.fileName) : null;
  const alreadyComplete = NextResponse.json({ error: "Upload is already complete" }, { status: 409 });
  if (rejection) {
    const { count } = await prisma.attachment.updateMany({ where: { id: attachment.id, status: "PENDING" }, data: { status: "REJECTED" } });
    if (!count) return alreadyComplete;
    const s3 = getS3Storage();
    const localPath = localUploadPath(key);
    if (s3) await s3.client.send(new DeleteObjectCommand({ Bucket: s3.bucket, Key: key })).catch(console.error);
    else if (localPath) await unlink(localPath.destination).catch(() => undefined);
    return NextResponse.json(rejection, { status: 422 });
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const count = await prisma.$transaction(async (tx) => {
    const { count } = await tx.attachment.updateMany({ where: { id: attachment.id, status: "PENDING" }, data: { sha256, status: "ATTACHED" } });
    if (count && attachment.purpose === "AVATAR") await tx.user.update({ where: { id: user.id }, data: { avatar: attachment.fileUrl } });
    return count;
  });
  if (!count) return alreadyComplete;
  if (attachment.purpose === "AVATAR") clearAuthCache();
  return NextResponse.json({ attachmentId: attachment.id, sha256 });
}
