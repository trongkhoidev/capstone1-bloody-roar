"use client";
import { useEffect, useState } from "react";
import { graphqlRequest } from "@/lib/graphql-client";
import { uploadFile } from "@/lib/upload";
import { useAuthStore, useAuthStoreApi } from "@/lib/store/use-auth-store";
import { Button } from "@/components/ui/button";

type Source = { downloadUrl?: string | null; status: string; framework: string | null; repoUrl: string | null; ref: string | null; commitSha: string | null; error: string | null };
const QUERY = `query Source($id: ID!) { issueSource(issueId: $id) { status framework repoUrl ref commitSha error downloadUrl } }`;
export function SourcePanel({ issueId, repository, editable }: { issueId: string; repository?: string | null; editable: boolean }) {
  const authStore = useAuthStoreApi();
  const actorId = useAuthStore((s) => s.user?.id) ?? "guest";
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [cachedSource, setSource] = useState<Source | null>(null), [url, setUrl] = useState<string | null>(null), [ref, setRef] = useState("HEAD"), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [repoError, setRepoError] = useState(false);
  const source = loadedFor === actorId ? cachedSource : null;
  useEffect(() => {
    let active = true;
    const load = () => { void graphqlRequest<{ issueSource: Source | null }>(QUERY, { id: issueId }).then((r) => { if (active && (authStore.getState().user?.id ?? "guest") === actorId) { setSource(r.issueSource); setLoadedFor(actorId); } }).catch((e) => { if (active) setError(e.message); }); };
    load(); const timer = source?.status === "PENDING" ? setInterval(load, 5000) : null; return () => { active = false; if (timer) clearInterval(timer); };
  }, [authStore, issueId, actorId, source?.status]);
  const save = async (file?: File) => {
    const repo = (url ?? repository ?? "").trim();
    if (!file && (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || repo.endsWith(".git"))) { setRepoError(true); return; }
    setRepoError(false); setBusy(true); setError(null);
    try {
      const attachment = file ? await uploadFile(new File([file], file.name, { type: "application/zip" }), "SOURCE", issueId) : null;
      const result = await graphqlRequest<{ setIssueSource: Source }>(`mutation SetSource($id: ID!, $repo: String, $ref: String, $file: ID) { setIssueSource(issueId: $id, repoUrl: $repo, ref: $ref, attachmentId: $file) { status framework repoUrl ref commitSha error downloadUrl } }`, { id: issueId, repo: attachment ? null : repo, ref: attachment ? null : ref, file: attachment?.attachmentId ?? null });
      if ((authStore.getState().user?.id ?? "guest") === actorId) { setSource(result.setIssueSource); setLoadedFor(actorId); }
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save source"); }
    finally { setBusy(false); }
  };
  if (!editable && !source) return null;
  return <section className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-5">
    <h3 className="text-sm font-semibold">Source code for testing</h3>
    <p className="mt-1 text-sm text-[var(--ink-3)]">Choose a public GitHub repository or upload a ZIP to prepare the source for testing.</p>
    {source && <p className="mt-3 text-sm text-[var(--ink-2)]">Status: {source.status}{source.framework && ` · ${source.framework}`}{source.commitSha && ` · ${source.commitSha.slice(0, 12)}`}{source.repoUrl && ` · ${source.repoUrl}`}</p>}
    {editable && source && <p className="mt-2 text-xs text-[var(--ink-3)]">Preparing a new source resets approval of automated test cases.</p>}
    {source?.downloadUrl && <a href={source.downloadUrl} className="mt-2 inline-block text-sm text-[var(--link)] underline">Download source snapshot</a>}
    {source?.error && <p role="alert" className="mt-2 text-sm text-[var(--bad)]">{source.error}</p>}
    {error && loadedFor === actorId && <p role="alert" className="mt-2 text-sm text-[var(--bad)]">{error}</p>}
    {editable && <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-4">
        <h4 className="text-sm font-semibold">Use GitHub repository</h4>
        {repository && <p className="mt-1 text-xs text-[var(--ink-3)]">Prefilled from the repository on this bounty.</p>}
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,0.4fr)]">
          <label className="block text-xs font-medium">Repository URL<input className="mt-1 block h-10 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 text-sm" type="url" placeholder="https://github.com/owner/repo" value={url ?? repository ?? ""} aria-invalid={repoError} aria-describedby="source-repo-hint" onChange={(e) => { setUrl(e.target.value); setRepoError(false); }} /></label>
          <label className="block text-xs font-medium">Branch or tag<input className="mt-1 block h-10 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 text-sm" value={ref} onChange={(e) => setRef(e.target.value)} /></label>
        </div>
        <p id="source-repo-hint" role={repoError ? "alert" : undefined} className={`mt-2 text-xs ${repoError ? "text-[var(--bad)]" : "text-[var(--ink-3)]"}`}>Enter a full repository URL, such as https://github.com/owner/repo (without .git).</p>
        <Button className="mt-3" type="button" isLoading={busy} disabled={!(url ?? repository ?? "").trim()} onClick={() => void save()}>Prepare from GitHub</Button>
      </div>
      <div className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-4">
        <h4 className="text-sm font-semibold">Or upload a ZIP</h4>
        <p className="mt-1 text-xs text-[var(--ink-3)]">Select a ZIP file containing the source code.</p>
        <label className={`mt-3 inline-flex h-10 cursor-pointer items-center justify-center rounded-md border border-[var(--line-2)] bg-[var(--surface)] px-4 text-sm font-medium focus-within:outline focus-within:outline-2 focus-within:outline-[var(--link)] ${busy ? "pointer-events-none opacity-50" : "hover:bg-[var(--sunk)]"}`}>
          {busy ? "Preparing source…" : "Choose and upload ZIP"}
          <input className="sr-only" aria-label="Choose and upload ZIP" type="file" accept=".zip,application/zip" disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; if (file) void save(file); e.target.value = ""; }} />
        </label>
      </div>
    </div>}
  </section>;
}
