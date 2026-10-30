import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE_BYTES } from "@bloody-roar/shared";
import { tokenFromRequest, verifyJWT } from "@/lib/auth";
import { prisma, type AttachmentPurpose } from "@bloody-roar/database";
import { canReadIssueChat } from "@/lib/chat-access";
import { getS3Storage, localUploadPath } from "@/lib/storage";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILE_NAME_LIMIT = 160;
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
// CHAT is deliberately absent: chat attachments travel through the socket message flow.
const UPLOAD_PURPOSES = ["ISSUE_IMAGE", "DELIVERY", "EVIDENCE", "AVATAR"] as const;
type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

const ISSUE_SELECT = { id: true, clientId: true, developerId: true, status: true, hiddenAt: true } as const;

function safeFileName(value: string) {
  const base = path
    .basename(value)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, FILE_NAME_LIMIT);
  return base || "upload.bin";
}

export async function POST(request: Request) {
  const token = tokenFromRequest(request);
  const user = token ? await verifyJWT(token) : null;
  if (!user || user.isBanned)
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const limit = rateLimit(`upload:${user.id}`, { limit: 20, windowMs: 60_000 });
  if (!limit.ok) return tooManyRequests(limit.retryAfterMs);

  const body = (await request.json().catch(() => null)) as {
    fileName?: string;
    fileType?: string;
    fileSize?: number;
    purpose?: string;
    issueId?: string;
  } | null;
  const fileName = typeof body?.fileName === "string" ? safeFileName(body.fileName) : "";
  const fileType = body?.fileType;
  const fileSize = body?.fileSize;
  if (
    !fileName ||
    typeof fileType !== "string" ||
    !ALLOWED_FILE_TYPES.includes(fileType as never)
  ) {
    return NextResponse.json({ error: "File type is not supported" }, { status: 400 });
  }
  if (!Number.isInteger(fileSize) || !fileSize || fileSize <= 0 || fileSize > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "File must be smaller than 50 MB" }, { status: 400 });
  }
  const purpose = body?.purpose;
  if (typeof purpose !== "string" || !UPLOAD_PURPOSES.includes(purpose as UploadPurpose)) {
    return NextResponse.json({ error: "Upload purpose is not supported" }, { status: 400 });
  }
  if (purpose === "AVATAR" && (!fileType.startsWith("image/") || fileSize > AVATAR_MAX_BYTES)) {
    return NextResponse.json({ error: "Avatars must be images up to 5 MB" }, { status: 400 });
  }

  // Delivery and evidence belong to one task; only its client or developer may attach them.
  let issueId: string | null = null;
  if (purpose === "DELIVERY" || purpose === "EVIDENCE") {
    if (typeof body?.issueId !== "string" || !body.issueId)
      return NextResponse.json({ error: "issueId is required for this upload" }, { status: 400 });
    const issue = await prisma.issue.findUnique({
      where: { id: body.issueId },
      select: { clientId: true, developerId: true },
    });
    if (!issue || (issue.clientId !== user.id && issue.developerId !== user.id))
      return NextResponse.json({ error: "You cannot upload to this task" }, { status: 403 });
    issueId = body.issueId;
  }

  const key = `${user.id}/${randomUUID()}-${fileName}`;
  const s3 = getS3Storage();
  if (!s3 && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "S3 storage is not configured" }, { status: 503 });
  }

  const origin = new URL(request.url).origin;
  const fileUrl = `${origin}/api/uploads?key=${encodeURIComponent(key)}`;
  const attachment = await prisma.attachment.create({
    data: {
      issueId,
      uploaderId: user.id,
      fileName,
      fileUrl,
      fileSize,
      fileMime: fileType,
      purpose: purpose as AttachmentPurpose,
      status: "PENDING",
    },
  });

  if (s3) {
    const command = new PutObjectCommand({
      Bucket: s3.bucket,
      Key: key,
      ContentType: fileType,
      ContentLength: fileSize,
      Metadata: { uploader: user.id },
    });
    const uploadUrl = await getSignedUrl(s3.client, command, {
      expiresIn: 300,
    });
    return NextResponse.json({ attachmentId: attachment.id, uploadUrl, fileUrl, key, expiresIn: 300 });
  }

  // Local development fallback keeps the app usable without cloud credentials.
  return NextResponse.json({ attachmentId: attachment.id, uploadUrl: fileUrl, fileUrl, key, expiresIn: 300 });
}

export async function PUT(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  const token = tokenFromRequest(request);
  const user = token ? await verifyJWT(token) : null;
  if (!user || user.isBanned)
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (
    !key ||
    !key.startsWith(`${user.id}/`) ||
    key.includes("..") ||
    key.includes("\\") ||
    key.split("/").length !== 2
  ) {
    return NextResponse.json({ error: "Invalid upload key" }, { status: 403 });
  }
  if (process.env.NODE_ENV === "production" || getS3Storage()) {
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
  const localPath = localUploadPath(key);
  if (!localPath) return NextResponse.json({ error: "Invalid upload path" }, { status: 400 });
  const { destination } = localPath;
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes, { flag: "wx" });
  return NextResponse.json({ uploaded: true });
}

// Who may download an attachment, by purpose (P1-30b). Guests can only see avatars and public issue images.
async function canDownload(
  attachment: { purpose: AttachmentPurpose | null; issueId: string | null; uploaderId: string },
  issue: { id: string; clientId: string; developerId: string | null; status: string; hiddenAt: Date | null } | null,
  user: { id: string; role: string } | null,
): Promise<boolean> {
  switch (attachment.purpose) {
    case "AVATAR":
      return true;
    case "ISSUE_IMAGE":
      if (!attachment.issueId) return Boolean(user && user.id === attachment.uploaderId);
      if (!issue) return false;
      // A hidden task keeps its images for the people who can still open the task.
      if (!issue.hiddenAt) return true;
      return Boolean(user && (user.role === "ADMIN" || issue.clientId === user.id || issue.developerId === user.id));
    case "DELIVERY":
      return Boolean(user && issue && (issue.clientId === user.id || issue.developerId === user.id));
    case "EVIDENCE": {
      if (!user || !issue) return false;
      if (issue.clientId === user.id || issue.developerId === user.id) return true;
      if (user.role !== "ADMIN") return false;
      return Boolean(await prisma.dispute.findUnique({ where: { issueId: issue.id }, select: { id: true } }));
    }
    default:
      return Boolean(user && issue && canReadIssueChat(issue, user as never));
  }
}

export async function GET(request: Request) {
  const token = tokenFromRequest(request);
  const user = token ? await verifyJWT(token) : null;
  const key = new URL(request.url).searchParams.get("key");
  if (!key || key.includes("..") || key.includes("\\") || key.split("/").length !== 2) {
    return NextResponse.json({ error: "Invalid file key" }, { status: 400 });
  }
  const storedPath = `/api/uploads?key=${encodeURIComponent(key)}`;
  const attachment = await prisma.attachment.findFirst({
    where: { fileUrl: { endsWith: storedPath } },
    include: {
      issue: { select: ISSUE_SELECT },
      message: { select: { issue: { select: ISSUE_SELECT } } },
    },
  });
  if (!attachment || !key.startsWith(`${attachment.uploaderId}/`)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const issue = attachment.message?.issue ?? attachment.issue;
  if (!(await canDownload(attachment, issue, user))) {
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    return NextResponse.json({ error: "You cannot access this attachment" }, { status: 403 });
  }

  const auditEvidenceView = async () => {
    if (attachment.purpose === "EVIDENCE" && user?.role === "ADMIN" && issue)
      await prisma.adminLog.create({ data: { adminId: user.id, action: "view_evidence", target: "issue", targetId: issue.id, details: { attachmentId: attachment.id } } });
  };
  const s3 = getS3Storage();
  const safeName = safeFileName(attachment.fileName).replace(/["\\]/g, "_");
  if (s3) {
    const downloadUrl = await getSignedUrl(
      s3.client,
      new GetObjectCommand({
        Bucket: s3.bucket,
        Key: key,
        ResponseContentType: "application/octet-stream",
        ResponseContentDisposition: `attachment; filename="${safeName}"`,
        ResponseCacheControl: "private, no-store",
      }),
      { expiresIn: 120 },
    );
    await auditEvidenceView();
    return NextResponse.redirect(downloadUrl, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  if (process.env.NODE_ENV === "production")
    return NextResponse.json({ error: "S3 storage is not configured" }, { status: 503 });
  const localPath = localUploadPath(key);
  if (!localPath) return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  const { destination } = localPath;
  try {
    const bytes = await readFile(destination);
    await auditEvidenceView();
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
