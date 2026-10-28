// apps/web/src/test/escrow-core/abi.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ESCROW_ABI } from "@bloody-roar/shared/escrow";
import { ESCROW_ABI as LEGACY_ESCROW_ABI } from "@bloody-roar/shared";

const source = readFileSync(resolve(__dirname, "../../../../contracts/contracts/BloodyRoarEscrow.sol"), "utf8");
const declaredEvents = [...source.matchAll(/^\s*event (\w+)\(/gm)].map((match) => match[1] ?? "");
// Pausable và Ownable2Step khai báo các event này, contract kế thừa chúng.
const inheritedEvents = ["Paused", "Unpaused", "OwnershipTransferStarted", "OwnershipTransferred"];

const abiEvents = ESCROW_ABI.flatMap((item) => (item.type === "event" ? [item.name] : [])).sort();

describe("escrow ABI", () => {
  it("declares the 15 events of the contract", () => {
    expect(declaredEvents).toHaveLength(15);
  });

  it("has every declared event plus the four inherited ones, and nothing else", () => {
    expect(abiEvents).toEqual([...declaredEvents, ...inheritedEvents].sort());
  });

  it("keeps the legacy export pointing at the generated ABI", () => {
    expect(LEGACY_ESCROW_ABI).toBe(ESCROW_ABI);
  });
});
