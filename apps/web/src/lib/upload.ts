export type UploadPurpose = "ISSUE_IMAGE" | "DELIVERY" | "EVIDENCE" | "AVATAR";

// Two-step upload: announce the file, send the bytes to the returned target, then confirm. Throws the server's message.
export async function uploadFile(file: File, purpose: UploadPurpose, issueId?: string): Promise<{ attachmentId: string; sha256: string }> {
  const start = await fetch("/api/uploads", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fileName: file.name, fileType: file.type, fileSize: file.size, purpose, ...(issueId ? { issueId } : {}) }),
  });
  const announced = (await start.json().catch(() => ({}))) as { attachmentId?: string; uploadUrl?: string; error?: string };
  if (!start.ok || !announced.attachmentId || !announced.uploadUrl) throw new Error(announced.error ?? "Could not start the upload.");

  const sent = await fetch(announced.uploadUrl, {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!sent.ok) throw new Error((await sent.json().catch(() => ({})) as { error?: string }).error ?? "Could not send the file.");

  const done = await fetch("/api/uploads/complete", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ attachmentId: announced.attachmentId }),
  });
  const confirmed = (await done.json().catch(() => ({}))) as { sha256?: string; error?: string };
  if (!done.ok || !confirmed.sha256) throw new Error(confirmed.error ?? "Could not confirm the upload.");
  return { attachmentId: announced.attachmentId, sha256: confirmed.sha256 };
}
