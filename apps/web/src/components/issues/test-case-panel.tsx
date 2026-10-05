"use client";

import { useEffect, useState } from "react";
import { Check, Pencil, Sparkles, X } from "lucide-react";
import { graphqlRequest } from "@/lib/graphql-client";
import { Button } from "@/components/ui/button";

type TestCase = {
  id: string;
  title: string;
  description: string;
  given: string;
  when: string;
  then: string;
  isEdgeCase: boolean;
  priority: "CRITICAL" | "NORMAL" | "LOW";
  source?: "AI" | "MANUAL" | null;
  isApproved: boolean;
  clientNotes?: string | null;
};

type TestCaseDraft = Pick<TestCase, "title" | "description" | "given" | "when" | "then" | "isEdgeCase" | "priority">;

const TEST_CASES_QUERY = `query TaskTestCases($issueId: String!) { testCases(issueId: $issueId) { id title description given when then isEdgeCase priority source isApproved clientNotes } }`;
const GENERATE_TEST_CASES = `mutation GenerateTestCases($issueId: String!) { generateTestCases(issueId: $issueId) { id title description given when then isEdgeCase priority source isApproved clientNotes } }`;
const UPDATE_TEST_CASE = `mutation UpdateTestCase($input: UpdateTestCaseInput!) { updateTestCase(input: $input) { id title description given when then isEdgeCase priority source isApproved clientNotes } }`;
const fieldClass = "w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-2.5 py-2 text-xs leading-5 outline-none focus:border-[hsl(var(--primary)/0.5)]";

export function TestCasePanel({ issueId, owner, issueStatus }: { issueId: string; owner: boolean; issueStatus: string }) {
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TestCaseDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void graphqlRequest<{ testCases: TestCase[] }>(TEST_CASES_QUERY, { issueId })
      .then((result) => { if (active) setTestCases(result.testCases); })
      .catch((reason) => { if (active && owner) setError(reason instanceof Error ? reason.message : "Could not load acceptance criteria."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [issueId, owner]);

  const generate = async () => {
    setGenerating(true); setError(null);
    try {
      const result = await graphqlRequest<{ generateTestCases: TestCase[] }>(GENERATE_TEST_CASES, { issueId });
      setTestCases(result.generateTestCases);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not generate acceptance criteria.");
    } finally { setGenerating(false); }
  };

  const approve = async (testCase: TestCase) => {
    setSavingId(testCase.id); setError(null);
    try {
      const result = await graphqlRequest<{ updateTestCase: TestCase }>(UPDATE_TEST_CASE, { input: { id: testCase.id, isApproved: true } });
      setTestCases((current) => current.map((item) => item.id === testCase.id ? result.updateTestCase : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not approve this criterion.");
    } finally { setSavingId(null); }
  };

  const save = async (testCaseId: string) => {
    if (!draft) return;
    setSavingId(testCaseId); setError(null);
    try {
      const result = await graphqlRequest<{ updateTestCase: TestCase }>(UPDATE_TEST_CASE, { input: { id: testCaseId, ...draft } });
      setTestCases((current) => current.map((item) => item.id === testCaseId ? result.updateTestCase : item));
      setEditingId(null); setDraft(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save this criterion.");
    } finally { setSavingId(null); }
  };

  if (loading) return <section className="h-24 animate-pulse rounded-xl bg-[hsl(var(--muted))]" aria-label="Loading acceptance criteria" />;
  if (!owner && testCases.length === 0) return null;

  return (
    <section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 sm:p-6" aria-labelledby="test-case-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 id="test-case-heading" className="font-semibold">Acceptance criteria</h2><p className="mt-1 text-xs leading-5 text-[hsl(var(--foreground-muted))]">Specific checks help both sides agree on what counts as complete.</p></div>
        {owner && issueStatus === "OPEN" && <Button size="sm" variant="outline" disabled={generating} onClick={() => void generate()}><Sparkles className="mr-2 h-4 w-4" />{generating ? "Generating…" : testCases.length ? "Regenerate drafts" : "Generate with AI"}</Button>}
      </div>

      {error && <p role="alert" className="mt-3 rounded-md bg-[hsl(var(--destructive)/0.08)] p-2.5 text-xs text-[hsl(var(--destructive))]">{error}</p>}
      {testCases.length === 0 ? <p className="mt-4 rounded-lg bg-[hsl(var(--background-secondary))] p-4 text-sm text-[hsl(var(--foreground-muted))]">No acceptance criteria have been added yet.</p> : <div className="mt-4 divide-y divide-[hsl(var(--border))]">
        {testCases.map((testCase) => {
          const editing = editingId === testCase.id && draft;
          return <article key={testCase.id} className="py-4 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{testCase.title}</h3><span className="rounded-full bg-[hsl(var(--background-secondary))] px-2 py-0.5 text-[10px] text-[hsl(var(--foreground-muted))]">{testCase.priority.toLowerCase()}{testCase.isEdgeCase ? " · edge case" : ""}</span><span className={`rounded-full px-2 py-0.5 text-[10px] ${testCase.isApproved ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{testCase.isApproved ? "Approved" : "Draft"}</span></div>
                {!editing && <p className="mt-1 text-xs leading-5 text-[hsl(var(--foreground-muted))]">{testCase.description}</p>}
              </div>
              {owner && issueStatus === "OPEN" && !editing && <div className="flex shrink-0 gap-1"><Button type="button" size="sm" variant="ghost" aria-label={`Edit ${testCase.title}`} onClick={() => { setEditingId(testCase.id); setDraft({ title: testCase.title, description: testCase.description, given: testCase.given, when: testCase.when, then: testCase.then, isEdgeCase: testCase.isEdgeCase, priority: testCase.priority }); }}><Pencil className="h-3.5 w-3.5" /></Button>{!testCase.isApproved && <Button type="button" size="sm" variant="outline" disabled={savingId === testCase.id} onClick={() => void approve(testCase)}><Check className="mr-1 h-3.5 w-3.5" />Approve</Button>}</div>}
            </div>

            {editing ? <div className="mt-3 space-y-2">
              <input className={fieldClass} aria-label="Criterion title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
              <textarea className={fieldClass} aria-label="Criterion description" rows={2} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
              <div className="grid gap-2 sm:grid-cols-3"><textarea className={fieldClass} aria-label="Given" placeholder="Given" rows={3} value={draft.given} onChange={(event) => setDraft({ ...draft, given: event.target.value })} /><textarea className={fieldClass} aria-label="When" placeholder="When" rows={3} value={draft.when} onChange={(event) => setDraft({ ...draft, when: event.target.value })} /><textarea className={fieldClass} aria-label="Then" placeholder="Then" rows={3} value={draft.then} onChange={(event) => setDraft({ ...draft, then: event.target.value })} /></div>
              <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.isEdgeCase} onChange={(event) => setDraft({ ...draft, isEdgeCase: event.target.checked })} />Edge case</label><div className="flex gap-2"><select className={fieldClass} aria-label="Priority" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as TestCaseDraft["priority"] })}><option value="CRITICAL">Critical</option><option value="NORMAL">Normal</option><option value="LOW">Low</option></select><Button type="button" size="sm" variant="ghost" onClick={() => { setEditingId(null); setDraft(null); }}><X className="mr-1 h-3.5 w-3.5" />Cancel</Button><Button type="button" size="sm" disabled={savingId === testCase.id} onClick={() => void save(testCase.id)}>Save review</Button></div></div>
            </div> : <dl className="mt-3 grid gap-2 sm:grid-cols-3"><Criterion label="Given" value={testCase.given} /><Criterion label="When" value={testCase.when} /><Criterion label="Then" value={testCase.then} /></dl>}
          </article>;
        })}
      </div>}
      {owner && testCases.some((item) => item.source === "AI") && <p className="mt-4 border-t border-[hsl(var(--border))] pt-3 text-[10px] leading-4 text-[hsl(var(--foreground-subtle))]">AI-generated drafts are suggestions, not verified tests. Review and approve them before sharing as agreed scope.</p>}
    </section>
  );
}

function Criterion({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-[hsl(var(--background-secondary))] p-2.5"><dt className="text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--foreground-subtle))]">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-[hsl(var(--foreground-muted))]">{value}</dd></div>;
}
