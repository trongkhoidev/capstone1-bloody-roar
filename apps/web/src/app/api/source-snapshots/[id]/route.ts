import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { snapshotArchivePath } from "@/lib/source-archive";
import { prisma } from "@bloody-roar/database";
import { tokenFromRequest, verifyJWT } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = tokenFromRequest(request), user = token ? await verifyJWT(token) : null;
  if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
  const source = await prisma.sourceSnapshot.findUnique({ where: { id: params.id }, include: { issue: true } });
  if (!source || source.status !== "READY" || !source.storagePath) return Response.json({ error: "Snapshot not found" }, { status: 404 });
  if (source.issue.clientId !== user.id && source.issue.developerId !== user.id && !(user.role === "ADMIN" && source.issue.status === "DISPUTED")) return Response.json({ error: "Source is private to task participants" }, { status: 403 });
  const archive = await snapshotArchivePath(source.storagePath);
  if (!archive) return Response.json({ error: "Snapshot is unavailable" }, { status: 404 });
  return new Response(Readable.toWeb(createReadStream(archive.path)) as ReadableStream<Uint8Array>, { headers: { "content-type": "application/gzip", "content-disposition": `attachment; filename="source-${source.id}.tar.gz"`, "cache-control": "private, no-store", "content-length": String(archive.size) } });
}
