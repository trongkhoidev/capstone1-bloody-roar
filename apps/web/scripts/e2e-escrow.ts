import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma, type User } from "@bloody-roar/database";
import { ContractFactory, Wallet, providers, type ContractInterface } from "ethers";
import { graphql, type ExecutionResult } from "graphql";
import "../src/lib/env";

import { ESCROW_ABI } from "@bloody-roar/shared";
import { utils } from "ethers";

type Artifact = { abi: ContractInterface; bytecode: string };

async function testWallet(
  name: string,
  provider: providers.JsonRpcProvider,
  localRpc: boolean,
): Promise<Wallet> {
  const privateKey = process.env[name];
  if (privateKey) return new Wallet(privateKey, provider);
  if (!localRpc) throw new Error(`${name} is required for a non-local E2E network`);
  const wallet = Wallet.createRandom().connect(provider);
  await provider.send("hardhat_setBalance", [wallet.address, "0x56BC75E2D63100000"]);
  return wallet;
}

async function artifact(source: string, name = source): Promise<Artifact> {
  const file = path.resolve(
    process.cwd(),
    `../contracts/artifacts/contracts/${source}.sol/${name}.json`,
  );
  const value: unknown = JSON.parse(await readFile(file, "utf8"));
  if (!value || typeof value !== "object" || !("abi" in value) || !("bytecode" in value)) {
    throw new Error(`Invalid Hardhat artifact: ${file}`);
  }
  const candidate = value as { abi: unknown; bytecode: unknown };
  if (
    !Array.isArray(candidate.abi) ||
    !candidate.abi.every(
      (entry) => typeof entry === "string" || (typeof entry === "object" && entry !== null),
    ) ||
    typeof candidate.bytecode !== "string"
  )
    throw new Error(`Invalid Hardhat artifact: ${file}`);
  return { abi: candidate.abi as ContractInterface, bytecode: candidate.bytecode };
}

function field<T>(result: ExecutionResult<Record<string, unknown>>, name: string): T {
  if (result.errors?.length)
    throw new Error(result.errors.map((error) => error.message).join("; "));
  assert(result.data && typeof result.data[name] === "object", `Missing GraphQL field ${name}`);
  return result.data[name] as T;
}

async function mineForFinality(
  provider: providers.JsonRpcProvider,
  confirmations: number,
): Promise<void> {
  for (let index = 1; index < confirmations; index += 1) await provider.send("evm_mine", []);
}

async function run(): Promise<void> {
  const rpcUrl = process.env.E2E_RPC_URL ?? "http://127.0.0.1:8545";
  if (!["127.0.0.1", "localhost"].includes(new URL(rpcUrl).hostname))
    throw new Error("Escrow E2E requires a local Hardhat RPC");
  const dbUrl = new URL(process.env.DATABASE_URL ?? "");
  if (!["127.0.0.1", "localhost", process.env.E2E_LOCAL_DATABASE_HOST].includes(dbUrl.hostname))
    throw new Error("Escrow E2E requires an isolated local PostgreSQL database");
  const provider = new providers.JsonRpcProvider(rpcUrl);
  provider.pollingInterval = 100;
  const network = await provider.getNetwork();
  assert([31337, 1337].includes(network.chainId), "Use a local test chain");
  const clientWallet = await testWallet("TEST_CLIENT_KEY", provider, true);
  const developerWallet = await testWallet("TEST_DEVELOPER_KEY", provider, true);
  const ownerWallet = await testWallet("TEST_OWNER_KEY", provider, true);
  const arbiterWallet = await testWallet("TEST_ARBITER_KEY", provider, true);
  const feeWallet = await testWallet("TEST_FEE_KEY", provider, true);
  const escrowArtifact = await artifact("BloodyRoarEscrow");
  const compiled = new ContractFactory(escrowArtifact.abi, escrowArtifact.bytecode).interface;
  const shared = new utils.Interface([...ESCROW_ABI]);
  for (const signature of [...Object.keys(shared.events), ...Object.keys(shared.functions)]) {
    assert(
      compiled.events[signature] || compiled.functions[signature],
      `Shared ABI disagrees with compiled contract: ${signature}`,
    );
  }
  const tokenArtifact = await artifact("MockUSDC");
  const token = await new ContractFactory(
    tokenArtifact.abi,
    tokenArtifact.bytecode,
    clientWallet,
  ).deploy();
  await token.deployed();
  const escrow = await new ContractFactory(
    escrowArtifact.abi,
    escrowArtifact.bytecode,
    clientWallet,
  ).deploy(token.address, ownerWallet.address, arbiterWallet.address, feeWallet.address);
  await escrow.deployed();
  process.env.ESCROW_RPC_URL = rpcUrl;
  process.env.ESCROW_CHAIN_ID = String(network.chainId);
  process.env.ESCROW_CONTRACT_ADDRESS = escrow.address;
  process.env.ESCROW_MIN_CONFIRMATIONS = "3";
  const { schema } = await import("../src/graphql/schema");
  const users: User[] = [],
    issueIds: string[] = [],
    tokenIds: string[] = [];
  const execute = (source: string, user: User, variableValues: Record<string, unknown>) =>
    graphql({ schema, source, variableValues, contextValue: { db: prisma, user } }) as Promise<
      ExecutionResult<Record<string, unknown>>
    >;
  const confirmSource = `mutation($input: ConfirmEscrowTransactionInput!) { confirmEscrowTransaction(input: $input) { phase status resolutionKind clientRefund developerPayout platformFeeAmount } }`;
  const confirmed = async (transaction: providers.TransactionResponse) => {
    const receipt = await transaction.wait();
    await mineForFinality(provider, 3);
    return receipt;
  };
  const advance = async (seconds: number) => {
    await provider.send("evm_increaseTime", [seconds]);
    await provider.send("evm_mine", []);
  };
  try {
    for (const [wallet, role] of [
      [clientWallet, "CLIENT"],
      [developerWallet, "DEVELOPER"],
      [arbiterWallet, "ADMIN"],
    ] as const) {
      users.push(
        await prisma.user.create({ data: { walletAddress: wallet.address.toLowerCase(), role } }),
      );
    }
    const [client, developer, admin] = users as [User, User, User];
    const dbToken = await prisma.token.create({
      data: {
        symbol: "E2EUSDC",
        name: "Escrow test USDC",
        address: token.address,
        decimals: 6,
        chainId: network.chainId,
      },
    });
    tokenIds.push(dbToken.id);
    const createFunded = async (name: string, duration = 86400, tokenId = dbToken.id) => {
      const issue = await prisma.issue.create({
        data: {
          title: `E2E ${name}`,
          description: "Escrow integration verification",
          category: "SMART_CONTRACT",
          status: "IN_PROGRESS",
          bountyAmount: "100",
          tokenId,
          clientId: client.id,
          developerId: developer.id,
          requiredSkills: ["Solidity"],
          assignedAt: new Date(),
        },
      });
      issueIds.push(issue.id);
      const deadline = (await provider.getBlock("latest")).timestamp + duration;
      const termsHash = utils.id(`terms:${issue.id}`);
      await confirmed(await token.mint(clientWallet.address, 100000000));
      await confirmed(await token.connect(clientWallet).approve(escrow.address, 100000000));
      const receipt = await confirmed(
        await escrow
          .connect(clientWallet)
          .deposit(issue.id, developerWallet.address, 100000000, deadline, termsHash),
      );
      const result = await execute(
        `mutation($input: DepositToEscrowInput!) { depositToEscrow(input: $input) { phase termsHash deliveryDeadline reviewDeadline } }`,
        client,
        {
          input: { issueId: issue.id, developerId: developer.id, txHash: receipt.transactionHash },
        },
      );
      if (tokenId !== dbToken.id) {
        assert(
          result.errors?.some((e) => e.message.includes("immutable token")),
          "A different issue token must be rejected",
        );
        assert.equal(await prisma.escrow.findUnique({ where: { issueId: issue.id } }), null);
        return issue;
      }
      const deposited = field<{
        phase: string;
        termsHash: string;
        deliveryDeadline: string;
        reviewDeadline: string;
      }>(result, "depositToEscrow");
      assert.equal(deposited.phase, "FUNDED");
      assert.equal(deposited.termsHash, termsHash);
      assert.equal(new Date(deposited.deliveryDeadline).getTime(), deadline * 1000);
      assert.equal(new Date(deposited.reviewDeadline).getTime(), (deadline + 7 * 86400) * 1000);
      return issue;
    };
    const confirm = async (
      issueId: string,
      user: User,
      tx: providers.TransactionResponse,
      action: string,
      extra: Record<string, unknown> = {},
    ) => {
      const receipt = await confirmed(tx);
      return field<{
        phase: string;
        status: string;
        resolutionKind: string;
        clientRefund: number;
        developerPayout: number;
        platformFeeAmount: number;
      }>(
        await execute(confirmSource, user, {
          input: { issueId, txHash: receipt.transactionHash, action, ...extra },
        }),
        "confirmEscrowTransaction",
      );
    };

    const releasedIssue = await createFunded("release");
    const deliveryHash = utils.id("delivered work");
    await confirm(
      releasedIssue.id,
      developer,
      await escrow.connect(developerWallet).submitWork(releasedIssue.id, deliveryHash),
      "WORK",
      { commitmentHash: deliveryHash },
    );
    const releaseReceipt = await confirmed(
      await escrow.connect(clientWallet).releaseFunds(releasedIssue.id),
    );
    const releaseSource = `mutation($input: ReleaseEscrowFundsInput!) { releaseFunds(input: $input) { phase status developerPayout resolvedAt releasedAt } }`;
    const releaseInput = {
      input: { issueId: releasedIssue.id, txHash: releaseReceipt.transactionHash },
    };
    const released = field<{ phase: string; developerPayout: number; releasedAt: string | null }>(
      await execute(releaseSource, client, releaseInput),
      "releaseFunds",
    );
    assert.equal(released.phase, "RESOLVED");
    assert.equal(released.developerPayout, 97.5);
    assert.equal(released.releasedAt, null);
    assert.equal(
      (await token.balanceOf(developerWallet.address)).toString(),
      "0",
      "Resolution must not transfer tokens",
    );
    assert.equal((await escrow.claimable(developerWallet.address)).toString(), "97500000");
    field(await execute(releaseSource, client, releaseInput), "releaseFunds");
    assert.equal(
      await prisma.transaction.count({ where: { txHash: releaseReceipt.transactionHash } }),
      1,
    );
    const balanceSource = `query { escrowClaimableBalance { rawAmount amount } }`;
    assert.equal(
      field<{ rawAmount: string }>(
        await execute(balanceSource, developer, {}),
        "escrowClaimableBalance",
      ).rawAmount,
      "97500000",
    );
    await confirmed(await escrow.connect(ownerWallet).claim(developerWallet.address));
    assert.equal((await token.balanceOf(developerWallet.address)).toString(), "97500000");
    assert.equal(
      field<{ rawAmount: string }>(
        await execute(balanceSource, developer, {}),
        "escrowClaimableBalance",
      ).rawAmount,
      "0",
    );

    for (const bps of [10000, 5000]) {
      const issue = await createFunded(`settlement-${bps}`);
      await confirm(
        issue.id,
        client,
        await escrow.connect(clientWallet).proposeSettlement(issue.id, bps),
        "PROPOSE_SETTLEMENT",
        { clientBps: bps },
      );
      const result = await confirm(
        issue.id,
        developer,
        await escrow.connect(developerWallet).acceptSettlement(issue.id),
        "ACCEPT_SETTLEMENT",
      );
      assert.equal(result.status, bps === 10000 ? "CANCELLED" : "COMPLETED");
      assert.equal(result.clientRefund, bps === 10000 ? 100 : 50);
      assert.equal(result.developerPayout, bps === 10000 ? 0 : 48.75);
      assert.equal(result.platformFeeAmount, bps === 10000 ? 0 : 1.25);
    }

    const disputedIssue = await createFunded("dispute");
    const evidenceManifestHash = utils.id("client evidence");
    const disputeReceipt = await confirmed(
      await escrow.connect(clientWallet).raiseDispute(disputedIssue.id, evidenceManifestHash),
    );
    const disputeInput = {
      input: {
        issueId: disputedIssue.id,
        reason: "The submitted work does not meet the agreed acceptance criteria.",
        txHash: disputeReceipt.transactionHash,
        evidenceManifestHash,
      },
    };
    const settlementAfterDispute = await confirmed(
      await escrow.connect(developerWallet).proposeSettlement(disputedIssue.id, 5000),
    );
    const outOfOrder = await execute(confirmSource, developer, {
      input: {
        issueId: disputedIssue.id,
        txHash: settlementAfterDispute.transactionHash,
        action: "PROPOSE_SETTLEMENT",
        clientBps: 5000,
      },
    });
    assert(
      outOfOrder.errors?.some((error) => error.message.includes("preceding escrow event")),
      "A later settlement must not suppress an unconfirmed dispute",
    );
    field(
      await execute(
        `mutation($input: RaiseDisputeInput!) { raiseDispute(input: $input) { status evidenceManifestHash } }`,
        client,
        disputeInput,
      ),
      "raiseDispute",
    );
    field(
      await execute(confirmSource, developer, {
        input: {
          issueId: disputedIssue.id,
          txHash: settlementAfterDispute.transactionHash,
          action: "PROPOSE_SETTLEMENT",
          clientBps: 5000,
        },
      }),
      "confirmEscrowTransaction",
    );
    const evidence = utils.id("developer evidence");
    await confirm(
      disputedIssue.id,
      developer,
      await escrow.connect(developerWallet).submitCounterpartyEvidence(disputedIssue.id, evidence),
      "COUNTERPARTY_EVIDENCE",
      { commitmentHash: evidence },
    );
    await advance(72 * 3600);
    const decisionHash = utils.id("initial decision");
    const initial = await confirmed(
      await escrow.connect(arbiterWallet).postInitialRuling(disputedIssue.id, 5000, decisionHash),
    );
    const rulingSource = `mutation($input: ProposeDisputeResolutionInput!) { proposeDisputeResolution(input: $input) { status challengeDeadline noticeDeadline } }`;
    const initialResult = field<{ status: string; challengeDeadline: string }>(
      await execute(rulingSource, admin, {
        input: {
          issueId: disputedIssue.id,
          clientRatio: 50,
          note: "Initial evidence review supports an equal split.",
          decisionHash,
          txHash: initial.transactionHash,
        },
      }),
      "proposeDisputeResolution",
    );
    assert.equal(initialResult.status, "PROPOSED");
    assert.equal(
      new Date(initialResult.challengeDeadline).getTime(),
      ((await provider.getBlock(initial.blockNumber)).timestamp + 7 * 86400) * 1000,
    );
    const challenge = await confirmed(
      await escrow.connect(clientWallet).challengeRuling(disputedIssue.id),
    );
    field(
      await execute(
        `mutation($issueId: String!, $txHash: String!) { challengeDisputeResolution(issueId: $issueId, txHash: $txHash) { status } }`,
        client,
        { issueId: disputedIssue.id, txHash: challenge.transactionHash },
      ),
      "challengeDisputeResolution",
    );
    const finalHash = utils.id("final decision");
    const final = await confirmed(
      await escrow.connect(arbiterWallet).postFinalRuling(disputedIssue.id, 10000, finalHash),
    );
    const finalResult = field<{ status: string; noticeDeadline: string }>(
      await execute(rulingSource, admin, {
        input: {
          issueId: disputedIssue.id,
          clientRatio: 100,
          note: "Final evidence supports a full client refund.",
          decisionHash: finalHash,
          txHash: final.transactionHash,
        },
      }),
      "proposeDisputeResolution",
    );
    assert.equal(finalResult.status, "FINAL_RULING");
    assert.equal(
      new Date(finalResult.noticeDeadline).getTime(),
      ((await provider.getBlock(final.blockNumber)).timestamp + 86400) * 1000,
    );
    await advance(86400);
    assert.equal(
      (
        await confirm(
          disputedIssue.id,
          client,
          await escrow.connect(ownerWallet).finalizeRuling(disputedIssue.id),
          "FINALIZE_RULING",
        )
      ).clientRefund,
      100,
    );
    assert.equal(
      (await prisma.dispute.findUniqueOrThrow({ where: { issueId: disputedIssue.id } })).status,
      "RESOLVED",
    );

    for (const timeout of [false, true]) {
      const issue = await createFunded(timeout ? "arbiter-timeout" : "unchallenged-ruling");
      const raised = await confirmed(
        await escrow.connect(clientWallet).raiseDispute(issue.id, evidenceManifestHash),
      );
      field(
        await execute(
          `mutation($input: RaiseDisputeInput!) { raiseDispute(input: $input) { status } }`,
          client,
          {
            input: {
              issueId: issue.id,
              reason: "Evidence for integration verification.",
              txHash: raised.transactionHash,
              evidenceManifestHash,
            },
          },
        ),
        "raiseDispute",
      );
      if (timeout) {
        await advance(30 * 86400 + 1);
        await confirm(
          issue.id,
          client,
          await escrow.connect(ownerWallet).finalizeArbiterTimeoutSplit(issue.id),
          "ARBITER_TIMEOUT_SPLIT",
        );
      } else {
        await advance(72 * 3600);
        await confirm(
          issue.id,
          admin,
          await escrow.connect(arbiterWallet).postInitialRuling(issue.id, 3333, decisionHash),
          "INITIAL_RULING",
          { clientBps: 3333, commitmentHash: decisionHash },
        );
        await advance(7 * 86400 + 1);
        await confirm(
          issue.id,
          client,
          await escrow.connect(ownerWallet).finalizeRuling(issue.id),
          "FINALIZE_RULING",
        );
      }
      const resolved = await prisma.dispute.findUniqueOrThrow({ where: { issueId: issue.id } });
      assert.equal(resolved.status, "RESOLVED");
      assert.equal(resolved.finalClientRatio?.toNumber(), timeout ? 50 : 33.33);
    }

    const batchArtifact = await artifact("test/MockBatchExecutor", "MockBatchExecutor");
    const batch = await new ContractFactory(
      batchArtifact.abi,
      batchArtifact.bytecode,
      ownerWallet,
    ).deploy();
    await batch.deployed();
    await confirmed(await escrow.connect(ownerWallet).proposeArbiter(batch.address));
    await confirmed(
      await batch.execute(escrow.address, [escrow.interface.encodeFunctionData("acceptArbiter")]),
    );
    const batchIssues = [await createFunded("batch-A"), await createFunded("batch-B")];
    for (const issue of batchIssues) {
      const raised = await confirmed(
        await escrow.connect(clientWallet).raiseDispute(issue.id, evidenceManifestHash),
      );
      field(
        await execute(
          `mutation($input: RaiseDisputeInput!) { raiseDispute(input: $input) { status } }`,
          client,
          {
            input: {
              issueId: issue.id,
              reason: "Safe batch integration evidence.",
              txHash: raised.transactionHash,
              evidenceManifestHash,
            },
          },
        ),
        "raiseDispute",
      );
    }
    await advance(72 * 3600);
    const batchReceipt = await confirmed(
      await batch.execute(
        escrow.address,
        batchIssues.map((issue) =>
          escrow.interface.encodeFunctionData("postInitialRuling", [issue.id, 5000, decisionHash]),
        ),
      ),
    );
    for (const issue of batchIssues) {
      field(
        await execute(confirmSource, admin, {
          input: {
            issueId: issue.id,
            txHash: batchReceipt.transactionHash,
            action: "INITIAL_RULING",
            clientBps: 5000,
            commitmentHash: decisionHash,
          },
        }),
        "confirmEscrowTransaction",
      );
    }
    const batchRecords = await prisma.transaction.findMany({
      where: { txHash: batchReceipt.transactionHash },
    });
    assert.equal(
      batchRecords.length,
      2,
      "Both escrow events in one Safe-shaped transaction must be confirmable",
    );
    assert.notEqual(batchRecords[0]!.logIndex, batchRecords[1]!.logIndex);

    const missed = await createFunded("missed", 100);
    await advance(101);
    assert.equal(
      (
        await confirm(
          missed.id,
          client,
          await escrow.connect(ownerWallet).claimMissedDeliveryRefund(missed.id),
          "MISSED_DELIVERY_REFUND",
        )
      ).clientRefund,
      100,
    );
    const review = await createFunded("review", 100);
    await confirm(
      review.id,
      developer,
      await escrow.connect(developerWallet).submitWork(review.id, deliveryHash),
      "WORK",
      { commitmentHash: deliveryHash },
    );
    await advance(7 * 86400 + 101);
    assert.equal(
      (
        await confirm(
          review.id,
          client,
          await escrow.connect(ownerWallet).claimReviewTimeout(review.id),
          "REVIEW_TIMEOUT",
        )
      ).developerPayout,
      97.5,
    );

    const otherToken = await prisma.token.create({
      data: {
        symbol: "OTHER",
        name: "Unsupported issue token",
        address: ownerWallet.address,
        decimals: 6,
        chainId: network.chainId,
      },
    });
    tokenIds.push(otherToken.id);
    await createFunded("token-mismatch", 86400, otherToken.id);
    console.log(
      "Escrow E2E passed: deposit, work, allocation/claim, idempotency, full/split settlement, evidence, ruling/challenge/finalization, arbiter timeout, dispute ordering, Safe-shaped multi-escrow batch, delivery/review timeouts, and immutable token rejection.",
    );
  } finally {
    await prisma.issue.deleteMany({ where: { id: { in: issueIds } } });
    await prisma.token.deleteMany({ where: { id: { in: tokenIds } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    await prisma.$disconnect();
  }
}
run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Escrow E2E failed");
  process.exitCode = 1;
});
