import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GraphQLRequestError } from "../lib/graphql-client";
import { TestCasePanel } from "../components/issues/test-case-panel";
import { Toaster } from "../components/ui/toaster";
import { useToastStore } from "../lib/toast";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../lib/graphql-client", async (importOriginal) => ({ ...(await importOriginal<object>()), graphqlRequest: request }));

beforeEach(() => { useToastStore.setState({ items: [] }); request.mockReset(); });

describe("manual acceptance criteria", () => {
  it("offers manual entry when AI is unavailable and creates, approves and deletes a criterion", async () => {
    const item = { id: "tc1", title: "Login works", description: "Successful login", given: "valid user", when: "user signs in", bddThen: "session opens", isEdgeCase: false, priority: "NORMAL", source: "MANUAL", isApproved: false };
    request.mockImplementation(async (query: string) => {
      if (query.includes("TaskTestCases")) return { testCases: [] };
      if (query.includes("GenerateTestCases")) throw new GraphQLRequestError({ message: "offline", extensions: { code: "AI_UNAVAILABLE" } });
      if (query.includes("CreateTestCase")) return { createTestCase: item };
      if (query.includes("UpdateTestCase")) return { updateTestCase: { ...item, isApproved: true } };
      if (query.includes("DeleteTestCase")) return { deleteTestCase: true };
      throw new Error(`Unexpected query: ${query}`);
    });
    render(<><TestCasePanel issueId="issue1" owner issueStatus="OPEN" /><Toaster /></>);
    fireEvent.click(await screen.findByText("Generate with AI"));
    expect(await screen.findByText("AI is not enabled. Add criteria manually.")).toBeInTheDocument();
    for (const [label, value] of Object.entries({ title: item.title, description: item.description, given: item.given, when: item.when, then: item.bddThen })) {
      fireEvent.change(screen.getByLabelText(`New criterion ${label}`), { target: { value } });
    }
    fireEvent.click(screen.getByText("Add criterion"));
    expect(await screen.findByText(item.title)).toBeInTheDocument();
    expect(screen.getByText(item.bddThen)).toBeInTheDocument();
    for (const [query] of request.mock.calls) {
      expect(query).toContain("bddThen: then");
    }
    expect(request).toHaveBeenCalledWith(expect.stringContaining("CreateTestCase"), { input: { issueId: "issue1", title: item.title, description: item.description, given: item.given, when: item.when, then: item.bddThen, priority: "NORMAL", isEdgeCase: false } });
    fireEvent.click(screen.getByText("Approve"));
    expect(await screen.findByText("Approved")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Delete"));
    await waitFor(() => expect(screen.queryByText(item.title)).not.toBeInTheDocument());
  });
});

it("shows a load error instead of claiming criteria are empty", async () => {
  request.mockRejectedValueOnce(new Error("Unexpected error."));
  render(<><TestCasePanel issueId="issue1" owner issueStatus="OPEN" /><Toaster /></>);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load acceptance criteria");
  expect(screen.queryByText("No acceptance criteria have been added yet.")).not.toBeInTheDocument();
});

it("does not report empty checks before criteria load successfully", async () => {
  let finish!: (value: { testCases: unknown[] }) => void;
  request.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const changed = vi.fn();
  render(<TestCasePanel issueId="loading-checks" owner issueStatus="OPEN" onExecutableChange={changed} />);
  expect(changed).not.toHaveBeenCalled();
  await act(async () => finish({ testCases: [] }));
  await waitFor(() => expect(changed).toHaveBeenCalledWith(false));
});

it("does not change check availability when loading criteria fails", async () => {
  request.mockRejectedValueOnce(new Error("offline"));
  const changed = vi.fn();
  render(<><TestCasePanel issueId="failed-checks" owner issueStatus="OPEN" onExecutableChange={changed} /><Toaster /></>);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load acceptance criteria");
  expect(changed).not.toHaveBeenCalled();
});

it("lets only the owner of an open issue check scope and shows the result", async () => {
  request.mockResolvedValue({ testCases: [] });
  const { rerender } = render(<TestCasePanel issueId="scope" owner={false} issueStatus="OPEN" />);
  expect(screen.queryByRole("button", { name: "Check my scope" })).toBeNull();
  rerender(<TestCasePanel issueId="scope" owner issueStatus="IN_PROGRESS" />);
  expect(screen.queryByRole("button", { name: "Check my scope" })).toBeNull();
  rerender(<TestCasePanel issueId="scope" owner issueStatus="OPEN" />);
  request.mockResolvedValueOnce({ checkIssueScope: { status: "OK", ambiguities: ["Clarify delivery"], openQuestions: ["Which chain?"], difficulty: "HARD" } });
  fireEvent.click(await screen.findByRole("button", { name: "Check my scope" }));
  expect(await screen.findByText("Clarify delivery")).toBeInTheDocument();
  expect(screen.getByText("Which chain?")).toBeInTheDocument();
  expect(screen.getByText("Difficulty: HARD")).toBeInTheDocument();
  expect(request).toHaveBeenCalledWith(expect.stringContaining("checkIssueScope"), { issueId: "scope" });
  request.mockResolvedValueOnce({ checkIssueScope: { status: "AI_UNAVAILABLE" } });
  fireEvent.click(screen.getByRole("button", { name: "Check my scope" }));
  expect(await screen.findByText("AI is unavailable, try again later")).toBeInTheDocument();
});
