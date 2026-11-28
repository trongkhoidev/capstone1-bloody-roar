import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionStatus } from "../components/escrow/transaction-status";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../lib/graphql-client", async (original) => ({ ...await original<object>(), graphqlRequest: request }));

let status: string;
let failureReason: string | null;
const queries = () => request.mock.calls.filter(([query]) => String(query).includes("MyTransactions")).length;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  status = "AWAITING_SIGNATURE"; failureReason = null;
  request.mockReset();
  request.mockImplementation(async (query: string) => {
    if (query.includes("MyTransactions")) return { myTransactions: [
      { id: "other", method: "approve", status: "CONFIRMED", txHash: null, failureReason: null },
      { id: "intent", method: "submitWork", status, txHash: status === "AWAITING_SIGNATURE" ? null : "0xabc", failureReason },
    ] };
    throw new Error(`Unexpected query: ${query}`);
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

async function show(onSettled = vi.fn()) {
  await act(async () => { render(<TransactionStatus intentIds={["intent"]} onSettled={onSettled} />); });
  return onSettled;
}

describe("TransactionStatus (US-39)", () => {
  it.each([
    ["AWAITING_SIGNATURE", "Waiting for signature"],
    ["SUBMITTED", "Sent"],
    ["PENDING_SAFE_HEAD", "Waiting for safe block"],
    ["CONFIRMED", "Confirmed"],
    ["FAILED", "Failed"],
    ["EXPIRED", "Failed"],
    ["DROPPED", "Failed"],
  ])("shows %s as %s", async (value, label) => {
    status = value;
    await show();
    expect(await screen.findByText(label)).toBeInTheDocument();
  });

  it("keeps tracking past two minutes until the transaction is final", async () => {
    status = "SUBMITTED";
    const onSettled = await show();
    await screen.findByText("Sent");
    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(screen.getByText("Sent")).toBeInTheDocument();
    expect(onSettled).not.toHaveBeenCalled();
    status = "CONFIRMED";
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(await screen.findByText("Confirmed")).toBeInTheDocument();
    expect(onSettled).toHaveBeenCalledWith("CONFIRMED");
    const after = queries();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(queries()).toBe(after);
  });

  it("explains a failure", async () => {
    status = "FAILED"; failureReason = "Reverted: deadline passed";
    const onSettled = await show();
    expect(await screen.findByText("Reverted: deadline passed")).toBeInTheDocument();
    expect(onSettled).toHaveBeenCalledWith("FAILED");
  });
});
