import { afterAll, beforeAll, expect, test } from "bun:test";
import { assertTestDatabase } from "@bloody-roar/database/test-guard";
import { prisma } from "@bloody-roar/database";
import { encodeFunctionData, encodeFunctionResult, type Abi, type Hex, ESCROW_ABI } from "@bloody-roar/shared";
import { contractConfigJob } from "../src/jobs/contract-config";
import type { RpcClient } from "../src/chain/client";
import { testConfig } from "./helpers";

const abi: Abi = ESCROW_ABI;

const config = testConfig();
beforeAll(() => assertTestDatabase(process.env.TEST_DATABASE_URL));
afterAll(async () => {
  await prisma.contractConfig.deleteMany({
    where: {
      chainId: config.chainId,
      contractAddress: config.escrowAddress.toLowerCase(),
    },
  });
  await prisma.$disconnect();
});

test("contractConfigJob upserts config from chain and normalizes pending addresses", async () => {
  const returnValues: Record<string, unknown> = {
    paused: false,
    owner: "0x1111111111111111111111111111111111111111",
    pendingOwner: "0x0000000000000000000000000000000000000000",
    arbiter: "0x2222222222222222222222222222222222222222",
    pendingArbiter: "0x3333333333333333333333333333333333333333",
    feeRecipient: "0x4444444444444444444444444444444444444444",
    pendingFeeRecipient: "0x0000000000000000000000000000000000000000",
  };

  const fakeRpc: RpcClient = {
    lastLatencyMs: 1,
    errorStreak: 0,
    async call<T>(method: string, params: unknown[]): Promise<T> {
      if (method === "eth_call") {
        const [{ data }] = params as [{ to: string; data: Hex }];
        for (const [fnName, val] of Object.entries(returnValues)) {
          const selector = encodeFunctionData({ abi, functionName: fnName });
          if (data === selector) {
            return encodeFunctionResult({ abi, functionName: fnName, result: val as never }) as T;
          }
        }
      }
      throw new Error(`Unexpected fake rpc call: ${method}`);
    },
  };

  // Run first time
  await contractConfigJob.run({ db: prisma, rpc: fakeRpc, config, now: () => new Date() });

  const record1 = await prisma.contractConfig.findUniqueOrThrow({
    where: {
      chainId_contractAddress: {
        chainId: config.chainId,
        contractAddress: config.escrowAddress.toLowerCase(),
      },
    },
  });

  expect(record1.paused).toBe(false);
  expect(record1.owner).toBe("0x1111111111111111111111111111111111111111");
  expect(record1.pendingOwner).toBeNull();
  expect(record1.arbiter).toBe("0x2222222222222222222222222222222222222222");
  expect(record1.pendingArbiter).toBe("0x3333333333333333333333333333333333333333");
  expect(record1.feeRecipient).toBe("0x4444444444444444444444444444444444444444");
  expect(record1.pendingFeeRecipient).toBeNull();

  // Run second time (idempotent)
  await contractConfigJob.run({ db: prisma, rpc: fakeRpc, config, now: () => new Date() });

  const count = await prisma.contractConfig.count({
    where: {
      chainId: config.chainId,
      contractAddress: config.escrowAddress.toLowerCase(),
    },
  });
  expect(count).toBe(1);
});
