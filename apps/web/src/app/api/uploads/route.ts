import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE_BYTES } from "@bloody-roar/shared";
import { tokenFromRequest, verifyJWT } from "@/lib/auth";
import { prisma } from "@bloody-roar/database";
import { canAccessIssue } from "@/lib/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILE_NAME_LIMIT = 160;

function safeFileName(value: string) {
  const base = path.basename(value).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, FILE_NAME_LIMIT);
  return base || "upload.bin";
}

function configuredS3() {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) return null;
  return {
    bucket,
    client: new S3Client({
      region: process.env.AWS_REGION || "ap-southeast-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    }),
  };
}

export async function POST(request: Request) {
  const token = tokenFromRequest(request);
  const user = token ? await verifyJWT(token) : null;
  if (!user || user.isBanned) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const body = await request.json().catch(() => null) as { fileName?: string; fileType?: string; fileSize?: number } | null;
  const fileName = typeof body?.fileName === "string" ? safeFileName(body.fileName) : "";
  const fileType = body?.fileType;
  const fileSize = body?.fileSize;
  if (!fileName || typeof fileType !== "string" || !ALLOWED_FILE_TYPES.includes(fileType as never)) {
    return NextResponse.json({ error: "File type is not supported" }, { status: 400 });
  }
  if (!Number.isInteger(fileSize) || !fileSize || fileSize <= 0 || fileSize > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "File must be smaller than 50 MB" }, { status: 400 });
  }

  const key = `${user.id}/${randomUUID()}-${fileName}`;
  const s3 = configuredS3();
  if (s3) {
    const command = new PutObjectCommand({
      Bucket: s3.bucket,
      Key: key,
      ContentType: fileType,
      ContentLength: fileSize,
      Metadata: { uploader: user.id },
    });
    const uploadUrl = await getSignedUrl(s3.client, command, { expiresIn: 300 });
    return NextResponse.json({ uploadUrl, fileUrl: `${new URL(request.url).origin}/api/uploads?key=${encodeURIComponent(key)}`, key, expiresIn: 300 });
  }

  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "S3 storage is not configured" }, { status: 503 });
  }

  // Local development fallback keeps the app usable without cloud credentials.
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    uploadUrl: `${origin}/api/uploads?key=${encodeURIComponent(key)}`,
    fileUrl: `${origin}/api/uploads?key=${encodeURIComponent(key)}`,
    key,
    expiresIn: 300,
  });
}

export async function PUT(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const token = tokenFromRequest(request);
  const user = token ? await verifyJWT(token) : null;
  if (!user || user.isBanned) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!key || !key.startsWith(`${user.id}/`) || key.includes("..") || key.includes("\\") || key.split("/").length !== 2) {
    return NextResponse.json({ error: "Invalid upload key" }, { status: 403 });
  }
  if (process.env.NODE_ENV === "production" || configuredS3()) {
    return NextResponse.json({ error: "Local upload endpoint is disabled" }, { status: 404 });
  }
  const fileType = request.headers.get("content-type") || "application/octet-stream";
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (!ALLOWED_FILE_TYPES.includes(fileType as never) || contentLength > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "File type or size is not supported" }, { status: 400 });
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "File must be smaller than 50 MB" }, { status: 400 });
  }
  const destination = path.resolve(process.cwd(), "apps/web/.uploads", key);
  const root = path.resolve(process.cwd(), "apps/web/.uploads") + path.sep;
  if (!destination.startsWith(root)) return NextResponse.json({ error: "Invalid upload path" }, { status: 400 });
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes, { flag: "wx" });
  return NextResponse.json({ uploaded: true });
}

export async function GET(request: Request) {
  const token = tokenFromRequest(request);
  const user = token ? await verifyJWT(token) : null;
  if (!user || user.isBanned) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const key = new URL(request.url).searchParams.get("key");
  if (!key || key.includes("..") || key.includes("\\") || key.split("/").length !== 2) {
    return NextResponse.json({ error: "Invalid file key" }, { status: 400 });
  }
  const storedPath = `/api/uploads?key=${encodeURIComponent(key)}`;
  const attachment = await prisma.attachment.findFirst({
    where: { fileUrl: { endsWith: storedPath } },
    include: { message: { select: { issueId: true } } },
  });
  if (!attachment || !key.startsWith(`${attachment.uploaderId}/`)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  const issueId = attachment.issueId ?? attachment.message?.issueId;
  if (!issueId || !(await canAccessIssue(prisma, issueId, user.id, user.role === "ADMIN"))) {
    return NextResponse.json({ error: "You cannot access this attachment" }, { status: 403 });
  }

  const s3 = configuredS3();
  const safeName = safeFileName(attachment.fileName).replace(/["\\]/g, "_");
  if (s3) {
    const downloadUrl = await getSignedUrl(s3.client, new GetObjectCommand({
      Bucket: s3.bucket,
      Key: key,
      ResponseContentType: "application/octet-stream",
      ResponseContentDisposition: `attachment; filename="${safeName}"`,
      ResponseCacheControl: "private, no-store",
    }), { expiresIn: 120 });
    return NextResponse.redirect(downloadUrl, { headers: { "Cache-Control": "private, no-store" } });
  }

  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "S3 storage is not configured" }, { status: 503 });
  const destination = path.resolve(process.cwd(), "apps/web/.uploads", key);
  const root = path.resolve(process.cwd(), "apps/web/.uploads") + path.sep;
  if (!destination.startsWith(root)) return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  try {
    const bytes = await readFile(destination);
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
