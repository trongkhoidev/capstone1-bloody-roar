import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GraphQLRequestError } from "../lib/graphql-client";
import { TestCasePanel } from "../components/issues/test-case-panel";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../lib/graphql-client", async (importOriginal) => ({ ...(await importOriginal<object>()), graphqlRequest: request }));

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
    render(<TestCasePanel issueId="issue1" owner issueStatus="OPEN" />);
    fireEvent.click(await screen.findByText("Generate with AI"));
    expect(await screen.findByText("AI service is unavailable. Please add criteria manually.")).toBeInTheDocument();
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
  render(<TestCasePanel issueId="issue1" owner issueStatus="OPEN" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load acceptance criteria");
  expect(screen.queryByText("No acceptance criteria have been added yet.")).not.toBeInTheDocument();
});
