// @vitest-environment node
import { describe, expect, it } from "vitest";
import { routeNotification } from "./escrow-bridge";

type IoArg = Parameters<typeof routeNotification>[0];

function fakeIo() {
  const emitted: Array<{ room: string; event: string; data: unknown }> = [];
  const io = {
    to: (room: string) => ({ emit: (event: string, data: unknown) => void emitted.push({ room, event, data }) }),
  };
  return { io: io as unknown as IoArg, emitted };
}

describe("routeNotification", () => {
  it("sends a projection change to the task room of its issue", () => {
    const { io, emitted } = fakeIo();
    routeNotification(io, "projection_changed", JSON.stringify({ escrowId: "esc_1", issueId: "issue_1", projectionVersion: 4 }));
    expect(emitted).toEqual([
      { room: "task:issue_1", event: "escrow:invalidate", data: { escrowId: "esc_1", projectionVersion: 4 } },
    ]);
  });

  it("sends a new notification to the user room", () => {
    const { io, emitted } = fakeIo();
    routeNotification(io, "notification_created", JSON.stringify({ userId: "user_1", id: "n_1" }));
    expect(emitted).toEqual([{ room: "user:user_1", event: "notification:new", data: { id: "n_1" } }]);
  });

  it("ignores channels it does not know and payloads without a target", () => {
    const { io, emitted } = fakeIo();
    routeNotification(io, "something_else", JSON.stringify({ issueId: "issue_1" }));
    routeNotification(io, "projection_changed", JSON.stringify({ escrowId: "esc_1" }));
    expect(emitted).toEqual([]);
  });

  it("throws on malformed JSON so the caller can log it", () => {
    const { io } = fakeIo();
    expect(() => routeNotification(io, "projection_changed", "{not json")).toThrow();
  });
});
