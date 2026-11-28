import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TestRunPanel } from "../components/issues/test-run-panel";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../lib/graphql-client", async (original) => ({ ...await original<object>(), graphqlRequest: request }));

type Run = { id: string; kind: string; status: string; results: string | null; log: string | null; createdAt: string };
let runs: Run[];
const run = (status: string, results: Array<{ testCaseId: string; status: string; message?: string }> = []): Run => ({
  id: "run", kind: "SUBMISSION", status, results: results.length ? JSON.stringify(results) : null, log: null, createdAt: "2026-11-28T00:00:00Z",
});
const runQueries = () => request.mock.calls.filter(([query]) => String(query).includes("query Runs")).length;

async function show() {
  await act(async () => { render(<TestRunPanel issueId="issue" submissionId="draft" canRun />); });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  request.mockReset();
  request.mockImplementation(async (query: string) => {
    if (query.includes("query Runs")) return { testRuns: runs };
    if (query.includes("TestCaseTitles")) return { testCases: [{ id: "case-1", title: "Withdraw blocks re-entry" }, { id: "case-2", title: "Normal withdraw empties the balance" }] };
    throw new Error(`Unexpected query: ${query}`);
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("TestRunPanel (US-39)", () => {
  it("names each criterion by its title and states the result in plain words", async () => {
    runs = [run("FAILED", [{ testCaseId: "case-1", status: "passed" }, { testCaseId: "case-2", status: "failed", message: "expected 0" }])];
    await show();
    expect(await screen.findByText("Withdraw blocks re-entry")).toBeInTheDocument();
    expect(screen.getByText("Normal withdraw empties the balance")).toBeInTheDocument();
    expect(screen.getByText("Some checks failed")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 checks passed")).toBeInTheDocument();
    expect(screen.queryByText(/case-1/)).toBeNull();
    expect(screen.queryByText(/SUBMISSION/)).toBeNull();
  });

  it("stops polling once the latest run has finished", async () => {
    runs = [run("PASSED", [{ testCaseId: "case-1", status: "passed" }])];
    await show();
    await screen.findByText("All checks passed");
    const before = runQueries();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(runQueries()).toBe(before);
  });

  it("keeps polling while a run is queued or running, then stops", async () => {
    runs = [run("QUEUED")];
    await show();
    await screen.findByText("Waiting to start");
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    runs = [run("RUNNING")];
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(await screen.findByText("Running checks")).toBeInTheDocument();
    runs = [run("ERROR")];
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(await screen.findByText("The checks could not run")).toBeInTheDocument();
    const after = runQueries();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(runQueries()).toBe(after);
  });
});
