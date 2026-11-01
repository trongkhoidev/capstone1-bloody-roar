import { beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { decodeFunctionResult, encodeFunctionData } from "@bloody-roar/shared";
import type { Hex } from "@bloody-roar/shared/escrow";
import { fixture } from "./harness/fixture";
import { fund } from "./harness/funding";
import { rpc } from "./harness/chain";
const abi = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] }] as const;
beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));
test("E5: signed funding projects only after the worker folds deposit", async () => {
  const f = await fixture();
  const contract = process.env.ESCROW_ADDRESS as Hex;
  const data = encodeFunctionData({ abi, functionName: "balanceOf", args: [contract] });
  const balance = async () => decodeFunctionResult({ abi, functionName: "balanceOf", data: await rpc<Hex>("eth_call", [{ to: f.token.address, data }, "latest"]) });
  const before = await balance();
  const { reservation, steps } = await fund(f);
  expect(steps.map((step) => step.method)).toEqual(["approve", "deposit"]);
  expect((await f.prisma.issue.findUniqueOrThrow({ where: { id: f.issueId } })).status).toBe("IN_PROGRESS");
  expect((await f.prisma.fundingReservation.findUniqueOrThrow({ where: { id: reservation.id } })).status).toBe("FUNDED");
  expect((await f.prisma.application.findUniqueOrThrow({ where: { id: f.applicationId } })).status).toBe("ACCEPTED");
  expect((await f.prisma.application.findUniqueOrThrow({ where: { id: f.rivalApplicationId } })).status).toBe("REJECTED");
  for (const [type, userId] of [["APPLICATION_ACCEPTED", f.developer.id], ["TASK_ASSIGNED", f.developer.id], ["APPLICATION_REJECTED", f.rival.id], ["DEPOSIT_CONFIRMED", f.client.id]] as const)
    expect(await f.prisma.notification.count({ where: { type, userId, data: { path: ["issueId"], equals: f.issueId } } })).toBe(1);
  expect(await balance() - before).toBe(100000000n);
}, 120_000);
