"use client";

import { useToastState } from "@/lib/toast";
import { useEffect, useState } from "react";
import { Check, Pencil, Sparkles, X } from "lucide-react";
import { graphqlRequest, GraphQLRequestError } from "@/lib/graphql-client";
import { Button } from "@/components/ui/button";

type ScopeCheck = { status: "OK" | "AI_UNAVAILABLE"; ambiguities: string[]; openQuestions: string[]; difficulty: string | null };
const CHECK_SCOPE = `mutation CheckIssueScope($issueId: String!) {
  checkIssueScope(issueId: $issueId) { status ambiguities openQuestions difficulty }
}`;

type TestCase = {
  testCode?: string | null;
  testFilePath?: string | null;
  expectBaseFail?: boolean;
  baseStatus?: string | null;
  id: string;
  title: string;
  description: string;
  given: string;
  when: string;
  bddThen: string;
  isEdgeCase: boolean;
  priority: "CRITICAL" | "NORMAL" | "LOW";
  source?: "AI" | "MANUAL" | null;
  isApproved: boolean;
  clientNotes?: string | null;
};

type TestCaseDraft = Pick<TestCase, "title" | "description" | "given" | "when" | "isEdgeCase" | "priority"> & { then: string };

const TEST_CASES_QUERY = `query TaskTestCases($issueId: String!) { testCases(issueId: $issueId) { id title description given when bddThen: then isEdgeCase priority source isApproved clientNotes testCode testFilePath expectBaseFail baseStatus } }`;
const GENERATE_TEST_CASES = `mutation GenerateTestCases($issueId: String!) { generateTestCases(issueId: $issueId) { id title description given when bddThen: then isEdgeCase priority source isApproved clientNotes testCode testFilePath expectBaseFail baseStatus } }`;
const UPDATE_TEST_CASE = `mutation UpdateTestCase($input: UpdateTestCaseInput!) { updateTestCase(input: $input) { id title description given when bddThen: then isEdgeCase priority source isApproved clientNotes testCode testFilePath expectBaseFail baseStatus } }`;
const CREATE_TEST_CASE = `mutation CreateTestCase($input: CreateTestCaseInput!) { createTestCase(input: $input) { id title description given when bddThen: then isEdgeCase priority source isApproved clientNotes testCode testFilePath expectBaseFail baseStatus } }`;
const DELETE_TEST_CASE = `mutation DeleteTestCase($id: ID!) { deleteTestCase(id: $id) }`;
const emptyDraft: TestCaseDraft = { title: "", description: "", given: "", when: "", then: "", priority: "NORMAL", isEdgeCase: false };
const fieldClass = "w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-2.5 py-2 text-xs leading-5 outline-none focus:border-[hsl(var(--primary)/0.5)]";

export function TestCasePanel({ issueId, owner, issueStatus, onExecutableChange }: { onExecutableChange?: (value: boolean) => void; issueId: string; owner: boolean; issueStatus: string }) {
  const [codeDrafts, setCodeDrafts] = useState<Record<string, { code: string; path: string; expectBaseFail: boolean }>>({});
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<ScopeCheck | null>(null);
  const [checkingScope, setCheckingScope] = useState(false);
  const canCheckScope = owner && issueStatus === "OPEN";
  const [generating, setGenerating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TestCaseDraft | null>(null);
  const [manual, setManual] = useState<TestCaseDraft>(emptyDraft);
  const [creating, setCreating] = useState(false);
  const [, setError] = useToastState("error");
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true); setLoadFailed(false);
    void graphqlRequest<{ testCases: TestCase[] }>(TEST_CASES_QUERY, { issueId })
      .then((result) => { if (active) setTestCases(result.testCases); })
      .catch(() => { if (active) { setLoadFailed(true); setError("Could not load acceptance criteria. Please refresh and try again."); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [issueId, owner, setError]);

  useEffect(() => {
    if (!loading && !loadFailed) onExecutableChange?.(testCases.some((c) => c.isApproved && Boolean(c.testCode)));
  }, [testCases, onExecutableChange, loading, loadFailed]);
  useEffect(() => {
    if (!testCases.some((c) => c.testCode && !c.baseStatus)) return;
    const timer = setInterval(() => { void graphqlRequest<{ testCases: TestCase[] }>(TEST_CASES_QUERY, { issueId }).then((r) => setTestCases(r.testCases)).catch(() => undefined); }, 5000);
    return () => clearInterval(timer);
  }, [issueId, testCases]);
  const rerun = async () => {
    try { await graphqlRequest(`mutation BaseCheck($id: ID!) { rerunBaseCheck(issueId: $id) { id } }`, { id: issueId }); setTestCases((cases) => cases.map((c) => c.testCode ? { ...c, baseStatus: null } : c)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not queue base check"); }
  };
  const saveCode = async (testCase: TestCase) => {
    const draft = codeDrafts[testCase.id]; if (!draft) return;
    setSavingId(testCase.id);
    try { const result = await graphqlRequest<{ updateTestCase: TestCase }>(UPDATE_TEST_CASE, { input: { id: testCase.id, testCode: draft.code, testFilePath: draft.path, expectBaseFail: draft.expectBaseFail } }); setTestCases((cases) => cases.map((c) => c.id === testCase.id ? result.updateTestCase : c)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save test code"); }
    finally { setSavingId(null); }
  };

  const checkScope = async () => {
    setCheckingScope(true); setError(null); setScope(null);
    try {
      const result = await graphqlRequest<{ checkIssueScope: ScopeCheck }>(CHECK_SCOPE, { issueId });
      setScope(result.checkIssueScope);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not check scope");
    } finally {
      setCheckingScope(false);
    }
  };

  const generate = async () => {
    setGenerating(true); setError(null);
    try {
      const result = await graphqlRequest<{ generateTestCases: TestCase[] }>(GENERATE_TEST_CASES, { issueId });
      setTestCases(result.generateTestCases);
    } catch (reason) {
      setError(reason instanceof GraphQLRequestError && reason.code === "AI_UNAVAILABLE" ? "AI is not enabled. Add criteria manually." : reason instanceof Error ? reason.message : "Could not generate acceptance criteria.");
    } finally { setGenerating(false); }
  };

  const create = async () => {
    setCreating(true); setError(null);
    try {
      const result = await graphqlRequest<{ createTestCase: TestCase }>(CREATE_TEST_CASE, { input: { issueId, ...manual } });
      setTestCases((current) => [...current, result.createTestCase]); setManual(emptyDraft);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create criterion."); }
    finally { setCreating(false); }
  };

  const remove = async (id: string) => {
    setSavingId(id); setError(null);
    try {
      await graphqlRequest(DELETE_TEST_CASE, { id });
      setTestCases((current) => current.filter((item) => item.id !== id));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete criterion."); }
    finally { setSavingId(null); }
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
  if (!owner && testCases.length === 0 && !loadFailed) return null;

  return (
    <section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 sm:p-6" aria-labelledby="test-case-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 id="test-case-heading" className="font-semibold">Acceptance criteria</h2><p className="mt-1 text-xs leading-5 text-[hsl(var(--foreground-muted))]">Specific checks help both sides agree on what counts as complete.</p></div>
        <div className="flex flex-wrap gap-2">
          {canCheckScope && <Button size="sm" variant="outline" disabled={checkingScope} onClick={() => void checkScope()}>{checkingScope ? "Checking…" : "Check my scope"}</Button>}
          {canCheckScope && <Button size="sm" variant="outline" disabled={generating} onClick={() => void generate()}><Sparkles className="mr-2 h-4 w-4" />{generating ? "Generating…" : testCases.length ? "Regenerate drafts" : "Generate with AI"}</Button>}
        </div>
      </div>
      {canCheckScope && scope && <div className="space-y-1 p-4 text-xs" aria-live="polite">
        {scope.status === "AI_UNAVAILABLE" ? <p>AI is unavailable, try again later</p> : <>
          {scope.difficulty && <p>Difficulty: {scope.difficulty}</p>}
          <p className="font-medium">Ambiguities</p>
          <ul className="list-disc pl-5">{scope.ambiguities.map((item, index) => <li key={index}>{item}</li>)}</ul>
          <p className="font-medium">Open questions</p>
          <ul className="list-disc pl-5">{scope.openQuestions.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </>}
      </div>}

      {owner && issueStatus === "OPEN" && <details className="group mt-4 rounded-lg border border-[hsl(var(--border))]" open={testCases.length === 0}>
        <summary className="cursor-pointer select-none px-3.5 py-2.5 text-sm font-medium">+ Add a criterion</summary>
        <form className="space-y-3 border-t border-[hsl(var(--border))] p-3.5" onSubmit={(event) => { event.preventDefault(); void create(); }}>
          <label className="block text-xs font-medium">Title<input className={`${fieldClass} mt-1`} aria-label="New criterion title" placeholder="e.g. Wallet connects on mobile" required minLength={4} maxLength={160} value={manual.title} onChange={(event) => setManual({ ...manual, title: event.target.value })} /></label>
          <label className="block text-xs font-medium">What should be true?<textarea rows={2} className={`${fieldClass} mt-1`} aria-label="New criterion description" placeholder="One or two sentences" required minLength={8} maxLength={1000} value={manual.description} onChange={(event) => setManual({ ...manual, description: event.target.value })} /></label>
          <div className="grid gap-3 sm:grid-cols-3">{(["given", "when", "then"] as const).map((field) => <label key={field} className="block text-xs font-medium capitalize">{field}<textarea rows={3} className={`${fieldClass} mt-1 font-normal normal-case`} aria-label={`New criterion ${field}`} placeholder={field === "given" ? "Starting state" : field === "when" ? "Action taken" : "Expected result"} required minLength={4} maxLength={1000} value={manual[field]} onChange={(event) => setManual({ ...manual, [field]: event.target.value })} /></label>)}</div>
          <div className="flex items-center justify-between gap-3"><label className="flex items-center gap-2 text-xs font-medium">Priority<select className={`${fieldClass} w-auto`} aria-label="New criterion priority" value={manual.priority} onChange={(event) => setManual({ ...manual, priority: event.target.value as TestCaseDraft["priority"] })}><option value="CRITICAL">Critical</option><option value="NORMAL">Normal</option><option value="LOW">Low</option></select></label><Button type="submit" size="sm" disabled={creating}>Add criterion</Button></div>
        </form>
      </details>}
      {owner && issueStatus === "OPEN" && testCases.some((c) => c.testCode) && <Button type="button" variant="outline" className="mt-3" onClick={() => void rerun()}>Run base check again</Button>}
      {testCases.length === 0 && !loadFailed ? <p className="mt-4 rounded-lg bg-[hsl(var(--background-secondary))] p-4 text-sm text-[hsl(var(--foreground-muted))]">No acceptance criteria have been added yet.</p> : testCases.length > 0 ? <div className="mt-4 divide-y divide-[hsl(var(--border))]">
        {testCases.map((testCase) => {
          const editing = editingId === testCase.id && draft;
          return <article key={testCase.id} className="py-4 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{testCase.title}</h3><span className="rounded-full bg-[hsl(var(--background-secondary))] px-2 py-0.5 text-[10px] text-[hsl(var(--foreground-muted))]">{testCase.priority.toLowerCase()}{testCase.isEdgeCase ? " · edge case" : ""}</span><span className={`rounded-full px-2 py-0.5 text-[10px] ${testCase.isApproved ? "bg-[var(--ok-bg)] text-[var(--ok)]" : "bg-[var(--warn-bg)] text-[var(--warn)]"}`}>{testCase.isApproved ? "Approved" : "Draft"}</span></div>
                {!editing && <p className="mt-1 text-xs leading-5 text-[hsl(var(--foreground-muted))]">{testCase.description}</p>}
              </div>
              {owner && issueStatus === "OPEN" && !editing && <div className="flex shrink-0 gap-1"><Button type="button" size="sm" variant="ghost" aria-label={`Edit ${testCase.title}`} onClick={() => { setEditingId(testCase.id); setDraft({ title: testCase.title, description: testCase.description, given: testCase.given, when: testCase.when, then: testCase.bddThen, isEdgeCase: testCase.isEdgeCase, priority: testCase.priority }); }}><Pencil className="h-3.5 w-3.5" /></Button><Button type="button" size="sm" variant="ghost" disabled={savingId === testCase.id} onClick={() => void remove(testCase.id)}>Delete</Button>{!testCase.isApproved && <Button type="button" size="sm" variant="outline" disabled={savingId === testCase.id || Boolean(testCase.testCode && testCase.baseStatus !== (testCase.expectBaseFail ? "failed" : "passed"))} title={testCase.testCode && testCase.baseStatus !== (testCase.expectBaseFail ? "failed" : "passed") ? "Base verification required before approval" : undefined} onClick={() => void approve(testCase)}><Check className="mr-1 h-3.5 w-3.5" />Approve</Button>}</div>}
            </div>

            {testCase.testCode && <details className="my-3 rounded border border-[var(--line)] p-3"><summary>Executable test · base: {testCase.baseStatus ?? "not verified"} · expected: {testCase.expectBaseFail ? "failed" : "passed"}</summary>
              {owner && issueStatus === "OPEN" ? <div className="mt-2 space-y-2">
                <input aria-label={`Test path ${testCase.title}`} className={fieldClass} value={codeDrafts[testCase.id]?.path ?? testCase.testFilePath ?? ""} onChange={(e) => setCodeDrafts((d) => ({ ...d, [testCase.id]: { code: d[testCase.id]?.code ?? testCase.testCode!, path: e.target.value, expectBaseFail: d[testCase.id]?.expectBaseFail ?? testCase.expectBaseFail ?? true } }))} />
                <textarea aria-label={`Test code ${testCase.title}`} rows={12} className={`${fieldClass} font-mono`} value={codeDrafts[testCase.id]?.code ?? testCase.testCode} onChange={(e) => setCodeDrafts((d) => ({ ...d, [testCase.id]: { code: e.target.value, path: d[testCase.id]?.path ?? testCase.testFilePath!, expectBaseFail: d[testCase.id]?.expectBaseFail ?? testCase.expectBaseFail ?? true } }))} />
                <Button type="button" disabled={savingId === testCase.id || !codeDrafts[testCase.id]} onClick={() => void saveCode(testCase)}>Save test code</Button>
              </div> : <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap text-xs">{testCase.testCode}</pre>}
            </details>}
            {editing ? <div className="mt-3 space-y-2">
              <input className={fieldClass} aria-label="Criterion title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
              <textarea className={fieldClass} aria-label="Criterion description" rows={2} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
              <div className="grid gap-2 sm:grid-cols-3"><textarea className={fieldClass} aria-label="Given" placeholder="Given" rows={3} value={draft.given} onChange={(event) => setDraft({ ...draft, given: event.target.value })} /><textarea className={fieldClass} aria-label="When" placeholder="When" rows={3} value={draft.when} onChange={(event) => setDraft({ ...draft, when: event.target.value })} /><textarea className={fieldClass} aria-label="Then" placeholder="Then" rows={3} value={draft.then} onChange={(event) => setDraft({ ...draft, then: event.target.value })} /></div>
              <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.isEdgeCase} onChange={(event) => setDraft({ ...draft, isEdgeCase: event.target.checked })} />Edge case</label><div className="flex gap-2"><select className={fieldClass} aria-label="Priority" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as TestCaseDraft["priority"] })}><option value="CRITICAL">Critical</option><option value="NORMAL">Normal</option><option value="LOW">Low</option></select><Button type="button" size="sm" variant="ghost" onClick={() => { setEditingId(null); setDraft(null); }}><X className="mr-1 h-3.5 w-3.5" />Cancel</Button><Button type="button" size="sm" disabled={savingId === testCase.id} onClick={() => void save(testCase.id)}>Save review</Button></div></div>
            </div> : <dl className="mt-3 grid gap-2 sm:grid-cols-3"><Criterion label="Given" value={testCase.given} /><Criterion label="When" value={testCase.when} /><Criterion label="Then" value={testCase.bddThen} /></dl>}
          </article>;
        })}
      </div> : null}
      {owner && testCases.some((item) => item.source === "AI") && <p className="mt-4 border-t border-[hsl(var(--border))] pt-3 text-[10px] leading-4 text-[hsl(var(--foreground-subtle))]">AI-generated drafts are suggestions, not verified tests. Review and approve them before sharing as agreed scope.</p>}
    </section>
  );
}

function Criterion({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-[hsl(var(--background-secondary))] p-2.5"><dt className="text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--foreground-subtle))]">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-[hsl(var(--foreground-muted))]">{value}</dd></div>;
}
