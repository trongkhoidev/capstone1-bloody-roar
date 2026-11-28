import { execFile } from "node:child_process";
import { lstat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { sanitizeSourceContext } from "@bloody-roar/shared/source-privacy";
import { localUploadPath } from "./storage";

const CONTEXT_LIMIT = 80_000, FOCUS_FILE_LIMIT = 20 * 1024;

/** Returns the snapshot archive when it is a regular file inside the snapshot directory. */
export async function snapshotArchivePath(storagePath: string): Promise<{ path: string; size: number } | null> {
  const repoRoot = path.resolve(localUploadPath("snapshot-root")!.root, "../../..");
  const root = path.resolve(repoRoot, process.env.SNAPSHOT_DIR || ".data/snapshots");
  const file = path.resolve(storagePath);
  if (!file.startsWith(`${root}${path.sep}`)) return null;
  const stat = await lstat(file).catch(() => null);
  return stat?.isFile() ? { path: file, size: stat.size } : null;
}

/** Reads one member; the worker packs snapshots with arcname '.', so members are "./<path>". */
export async function readArchiveFile(archive: string, file: string): Promise<string> {
  const { stdout } = await promisify(execFile)("tar", ["-xzOf", archive, "--", `./${file}`], { timeout: 10_000, maxBuffer: 4 * 1024 * 1024, encoding: "utf8" });
  return stdout;
}

type SourceFile = { path: string; content: string };

export function buildTestgenContext({ focus, manifest, base }: { focus: SourceFile[]; manifest?: SourceFile | undefined; base: string }): string {
  // Each part is sanitized on its own: the sanitizer treats text before the first "--- " as the path listing.
  const section = ({ path: file, content }: SourceFile) => content.includes("\0") ? "" : sanitizeSourceContext(`\n\n--- ${file} ---\n${content.slice(0, FOCUS_FILE_LIMIT)}`).trim();
  const parts = [...focus.map(section), manifest ? section(manifest) : "", sanitizeSourceContext(base)].filter(Boolean);
  return parts.join("\n\n").slice(0, CONTEXT_LIMIT);
}

/** Context for testgen with the chosen files first; unreadable files are skipped. */
export async function focusedSourceContext(source: { storagePath: string | null; context: string | null; fileTree: unknown }, focusFiles: string[]): Promise<string> {
  const archive = source.storagePath ? await snapshotArchivePath(source.storagePath) : null;
  const read = async (file: string) => archive ? { path: file, content: await readArchiveFile(archive.path, file).catch(() => "") } : null;
  const tree = new Set(((source.fileTree ?? []) as Array<{ path: string }>).map((file) => file.path));
  const manifestPath = ["package.json", "pyproject.toml"].find((file) => tree.has(file) && !focusFiles.includes(file));
  const focus = (await Promise.all(focusFiles.map(read))).filter((file): file is SourceFile => !!file?.content);
  const manifest = manifestPath ? await read(manifestPath) : null;
  return buildTestgenContext({ focus, manifest: manifest?.content ? manifest : undefined, base: source.context ?? "" });
}
