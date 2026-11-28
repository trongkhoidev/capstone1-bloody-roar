"use client";
import { useCallback, useEffect, useState } from "react";
import { graphqlRequest } from "@/lib/graphql-client";
import { Button } from "@/components/ui/button";

type Run = { id: string; kind: string; status: string; results: string | null; log: string | null; createdAt: string };
type CaseResult = { testCaseId: string; status: string; message?: string };

const RUN_STATUS: Record<string, { label: string; badge: string }> = {
  QUEUED: { label: "Waiting to start", badge: "b-mut" },
  RUNNING: { label: "Running checks", badge: "b-prog" },
  PASSED: { label: "All checks passed", badge: "b-open" },
  FAILED: { label: "Some checks failed", badge: "b-bad" },
  ERROR: { label: "The checks could not run", badge: "b-bad" },
};
const ACTIVE = ["QUEUED", "RUNNING"];
const POLL_MS = 5000;

export function TestRunPanel({ issueId, submissionId, canRun = false, onPassed }: { issueId: string; submissionId?: string; canRun?: boolean; onPassed?: (passed: boolean) => void }) {
  const [runs, setRuns] = useState<Run[]>([]), [titles, setTitles] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false), [poll, setPoll] = useState(0);

  const load = useCallback(async () => {
    const data = await graphqlRequest<{ testRuns: Run[] }>(`query Runs($issue: ID!, $submission: ID) { testRuns(issueId: $issue, submissionId: $submission) { id kind status results log createdAt } }`, { issue: issueId, submission: submissionId ?? null })
      .catch((e: unknown) => { setError(e instanceof Error ? e.message : "Could not load the checks."); return null; });
    if (!data) return null;
    setRuns(data.testRuns); onPassed?.(data.testRuns[0]?.status === "PASSED");
    return data.testRuns[0]?.status ?? null;
  }, [issueId, submissionId, onPassed]);

  useEffect(() => {
    let active = true, timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const status = await load();
      if (active && status && ACTIVE.includes(status)) timer = setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => { active = false; clearTimeout(timer); };
  }, [load, poll]);

  useEffect(() => {
    void graphqlRequest<{ testCases: Array<{ id: string; title: string }> }>(`query TestCaseTitles($issueId: String!) { testCases(issueId: $issueId) { id title } }`, { issueId })
      .then((data) => setTitles(Object.fromEntries(data.testCases.map((item) => [item.id, item.title]))))
      .catch(() => undefined);
  }, [issueId]);

  const run = async () => {
    setBusy(true); setError(null); onPassed?.(false);
    await graphqlRequest(`mutation RunTests($id: ID!) { runSubmissionTests(submissionId: $id) { id } }`, { id: submissionId })
      .then(() => setPoll((value) => value + 1))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not start the checks."));
    setBusy(false);
  };

  const latest = runs[0], status = latest ? RUN_STATUS[latest.status] ?? { label: latest.status.toLowerCase(), badge: "b-mut" } : null;
  const results: CaseResult[] = latest?.results ? JSON.parse(latest.results) : [];
  const passed = results.filter((result) => result.status === "passed").length;

  return <section className="my-3 rounded-lg border border-[var(--line)] p-3 text-sm" aria-label="Automated checks">
    <div className="flex flex-wrap items-center gap-2">
      {status ? <span className={`badge ${status.badge}`}>{status.label}</span> : <span className="text-[var(--ink-3)]">No checks have run on this draft yet.</span>}
      {results.length > 0 && <span className="mono text-xs text-[var(--ink-2)]">{passed} of {results.length} checks passed</span>}
      {canRun && submissionId && <Button type="button" variant="outline" size="sm" className="ml-auto" disabled={busy || ACTIVE.includes(latest?.status ?? "")} onClick={() => void run()}>Run tests</Button>}
    </div>
    {error && <p role="alert" className="mt-2 text-[var(--bad)]">{error}</p>}
    {results.length > 0 && <ul className="mt-2 flex flex-col gap-1.5">
      {results.map((result) => <li key={result.testCaseId} className="flex flex-col gap-1">
        <span className="flex items-center gap-2">
          <span className={`badge ${result.status === "passed" ? "b-open" : "b-bad"}`}>{result.status === "passed" ? "Passed" : "Failed"}</span>
          <span>{titles[result.testCaseId] ?? "Unnamed check"}</span>
        </span>
        {result.message && <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-[var(--surface-2)] p-2 text-xs">{result.message}</pre>}
      </li>)}
    </ul>}
    {latest && <details className="mt-2"><summary className="cursor-pointer text-xs text-[var(--ink-2)]">View test log</summary><pre className="max-h-60 overflow-auto whitespace-pre-wrap text-xs">{latest.log || "No log yet."}</pre></details>}
  </section>;
}
