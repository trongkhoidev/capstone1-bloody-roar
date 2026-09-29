import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import type { BloodyRoarEscrow, MockUSDC } from "../typechain-types";
import { SAFE_V141_SINGLETONS, assertProductionSafes } from "../scripts/deployment-checks";

const DAY = 24 * 60 * 60;
const USDC = (value: string | number | bigint) => ethers.parseUnits(value.toString(), 6);
const hash = (value: string) => ethers.keccak256(ethers.toUtf8Bytes(value));

describe("BloodyRoarEscrow", () => {
  let escrow: BloodyRoarEscrow;
  let token: MockUSDC;
  let owner: SignerWithAddress;
  let arbiter: SignerWithAddress;
  let feeRecipient: SignerWithAddress;
  let client: SignerWithAddress;
  let developer: SignerWithAddress;
  let nextOwner: SignerWithAddress;
  let nextArbiter: SignerWithAddress;
  let nextFeeRecipient: SignerWithAddress;
  let outsider: SignerWithAddress;

  async function deployFixture() {
    const signers = await ethers.getSigners();
    if (signers.length < 9) throw new Error("Hardhat must provide at least nine test signers");
    [owner, arbiter, feeRecipient, client, developer, nextOwner, nextArbiter, nextFeeRecipient, outsider] =
      signers as [
        SignerWithAddress,
        SignerWithAddress,
        SignerWithAddress,
        SignerWithAddress,
        SignerWithAddress,
        SignerWithAddress,
        SignerWithAddress,
        SignerWithAddress,
        SignerWithAddress,
        ...SignerWithAddress[],
      ];
    const tokenFactory = await ethers.getContractFactory("MockUSDC");
    token = (await tokenFactory.deploy()) as unknown as MockUSDC;
    await token.waitForDeployment();
    const escrowFactory = await ethers.getContractFactory("BloodyRoarEscrow");
    escrow = (await escrowFactory.deploy(
      await token.getAddress(),
      owner.address,
      arbiter.address,
      feeRecipient.address,
    )) as unknown as BloodyRoarEscrow;
    await escrow.waitForDeployment();
    await token.mint(client.address, USDC(1_000_000));
    await token.connect(client).approve(await escrow.getAddress(), ethers.MaxUint256);
  }

  async function deposit(
    id: string,
    amount = USDC(1_000),
    deadlineIn = DAY,
    depositor = client,
    worker = developer,
  ) {
    const deadline = BigInt(await time.latest()) + BigInt(deadlineIn);
    await escrow
      .connect(depositor)
      .deposit(id, worker.address, amount, deadline, hash(`terms:${id}`));
    return deadline;
  }

  async function dispute(id: string, raiser = client) {
    await deposit(id);
    await escrow.connect(raiser).raiseDispute(id, hash(`evidence:${id}:${raiser.address}`));
    return escrow.getDispute(id);
  }

  async function reachInitialRuling(id: string, clientBps = 4_000n) {
    const d = await dispute(id);
    await time.setNextBlockTimestamp(d.raisedAt + 72n * 60n * 60n);
    await escrow.connect(arbiter).postInitialRuling(id, clientBps, hash(`initial:${id}`));
    return escrow.getDispute(id);
  }

  beforeEach(deployFixture);

  describe("deployment and prospective governance", () => {
    it("pins the token, constants, and three distinct roles", async () => {
      expect(await escrow.token()).to.equal(await token.getAddress());
      expect(await escrow.owner()).to.equal(owner.address);
      expect(await escrow.arbiter()).to.equal(arbiter.address);
      expect(await escrow.feeRecipient()).to.equal(feeRecipient.address);
      expect(await escrow.EVIDENCE_RESPONSE_PERIOD()).to.equal(72n * 60n * 60n);
      expect(await escrow.CHALLENGE_PERIOD()).to.equal(7n * BigInt(DAY));
      expect(await escrow.FINAL_RULING_NOTICE_PERIOD()).to.equal(BigInt(DAY));
      expect(await escrow.BASE_SEPOLIA_CHAIN_ID()).to.equal(84_532n);
      expect(await escrow.BASE_SEPOLIA_USDC()).to.equal(
        "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      );
    });

    it("rejects zero, colliding, and non-six-decimal constructor inputs", async () => {
      const factory = await ethers.getContractFactory("BloodyRoarEscrow");
      await expect(
        factory.deploy(ethers.ZeroAddress, owner.address, arbiter.address, feeRecipient.address),
      ).to.be.revertedWithCustomError(factory, "InvalidAddress");
      await expect(
        factory.deploy(await token.getAddress(), ethers.ZeroAddress, arbiter.address, feeRecipient.address),
      ).to.be.revertedWithCustomError(factory, "OwnableInvalidOwner");
      await expect(
        factory.deploy(await token.getAddress(), owner.address, ethers.ZeroAddress, feeRecipient.address),
      ).to.be.revertedWithCustomError(factory, "InvalidAddress");
      await expect(
        factory.deploy(await token.getAddress(), owner.address, arbiter.address, ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(factory, "InvalidAddress");
      await expect(
        factory.deploy(await token.getAddress(), owner.address, owner.address, feeRecipient.address),
      ).to.be.revertedWithCustomError(factory, "RoleCollision");
      await expect(
        factory.deploy(await token.getAddress(), owner.address, arbiter.address, owner.address),
      ).to.be.revertedWithCustomError(factory, "RoleCollision");
      await expect(
        factory.deploy(await token.getAddress(), owner.address, arbiter.address, arbiter.address),
      ).to.be.revertedWithCustomError(factory, "RoleCollision");

      const badTokenFactory = await ethers.getContractFactory("MockToken");
      const badToken = await badTokenFactory.deploy(18);
      await expect(
        factory.deploy(await badToken.getAddress(), owner.address, arbiter.address, feeRecipient.address),
      ).to.be.revertedWithCustomError(factory, "InvalidTokenDecimals");
    });

    it("uses two-step ownership and disables renunciation", async () => {
      await expect(escrow.connect(owner).transferOwnership(nextOwner.address))
        .to.emit(escrow, "OwnershipTransferStarted")
        .withArgs(owner.address, nextOwner.address);
      await expect(escrow.connect(outsider).acceptOwnership()).to.be.reverted;
      await escrow.connect(nextOwner).acceptOwnership();
      expect(await escrow.owner()).to.equal(nextOwner.address);
      await expect(escrow.connect(nextOwner).renounceOwnership()).to.be.revertedWithCustomError(
        escrow,
        "OwnershipRenunciationDisabled",
      );
    });

    it("rotates arbiter and fee recipient prospectively", async () => {
      await deposit("old-roles");
      await escrow.connect(owner).proposeArbiter(nextArbiter.address);
      await escrow.connect(nextArbiter).acceptArbiter();
      await escrow.connect(owner).proposeFeeRecipient(nextFeeRecipient.address);
      await escrow.connect(nextFeeRecipient).acceptFeeRecipient();
      await deposit("new-roles");

      const oldRoles = await escrow.getEscrow("old-roles");
      const newRoles = await escrow.getEscrow("new-roles");
      expect(oldRoles.arbiter).to.equal(arbiter.address);
      expect(oldRoles.feeRecipient).to.equal(feeRecipient.address);
      expect(newRoles.arbiter).to.equal(nextArbiter.address);
      expect(newRoles.feeRecipient).to.equal(nextFeeRecipient.address);

      await escrow.connect(client).raiseDispute("old-roles", hash("old evidence"));
      const d = await escrow.getDispute("old-roles");
      await time.setNextBlockTimestamp(d.raisedAt + 72n * 60n * 60n);
      await expect(
        escrow.connect(nextArbiter).postInitialRuling("old-roles", 5_000, hash("wrong arbiter")),
      ).to.be.revertedWithCustomError(escrow, "NotAuthorized");
      await escrow.connect(arbiter).postInitialRuling("old-roles", 5_000, hash("right arbiter"));
    });

    it("rejects prospective role collisions and incomplete acceptances", async () => {
      await expect(escrow.connect(owner).proposeArbiter(owner.address)).to.be.revertedWithCustomError(
        escrow,
        "RoleCollision",
      );
      await expect(escrow.connect(owner).proposeArbiter(arbiter.address)).to.be.revertedWithCustomError(
        escrow,
        "RoleCollision",
      );
      await expect(escrow.connect(owner).proposeArbiter(feeRecipient.address)).to.be.revertedWithCustomError(
        escrow,
        "RoleCollision",
      );
      await expect(escrow.connect(owner).proposeFeeRecipient(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        escrow,
        "InvalidAddress",
      );
      await expect(escrow.connect(owner).proposeFeeRecipient(owner.address)).to.be.revertedWithCustomError(
        escrow,
        "RoleCollision",
      );
      await expect(escrow.connect(owner).proposeFeeRecipient(arbiter.address)).to.be.revertedWithCustomError(
        escrow,
        "RoleCollision",
      );
      await expect(escrow.connect(nextArbiter).acceptArbiter()).to.be.revertedWithCustomError(
        escrow,
        "NoPendingArbiter",
      );
      await expect(escrow.connect(nextFeeRecipient).acceptFeeRecipient()).to.be.revertedWithCustomError(
        escrow,
        "NoPendingFeeRecipient",
      );
      await expect(escrow.connect(owner).transferOwnership(arbiter.address)).to.be.revertedWithCustomError(
        escrow,
        "RoleCollision",
      );
    });

    it("pause blocks only deposits, not funded exits", async () => {
      await deposit("funded");
      await escrow.connect(owner).pause();
      await expect(deposit("paused")).to.be.revertedWithCustomError(escrow, "EnforcedPause");
      await escrow.connect(developer).submitWork("funded", hash("delivery"));
      await escrow.connect(client).releaseFunds("funded");
      await escrow.connect(owner).unpause();
      await expect(deposit("unpaused")).to.not.be.reverted;
    });
  });

  describe("funding and delivery", () => {
    it("records immutable funding terms and rejects duplicate identifiers", async () => {
      const deadline = await deposit("one");
      const e = await escrow.getEscrow("one");
      expect(e.client).to.equal(client.address);
      expect(e.developer).to.equal(developer.address);
      expect(e.amount).to.equal(USDC(1_000));
      expect(e.deliveryDeadline).to.equal(deadline);
      expect(e.termsHash).to.equal(hash("terms:one"));
      expect(await escrow.totalUnresolvedPrincipal()).to.equal(USDC(1_000));
      expect(await escrow.accountedBalance()).to.equal(USDC(1_000));
      expect(await escrow.isSolvent()).to.equal(true);
      await expect(deposit("one")).to.be.revertedWithCustomError(escrow, "EscrowAlreadyExists");
    });

    it("rejects empty IDs, zero values, same-party escrows, and invalid deadlines", async () => {
      const now = BigInt(await time.latest());
      await expect(
        escrow.connect(client).deposit("", developer.address, 1, now + 10n, hash("terms")),
      ).to.be.revertedWithCustomError(escrow, "EmptyEscrowId");
      await expect(
        escrow.connect(client).deposit("zero-address", ethers.ZeroAddress, 1, now + 10n, hash("terms")),
      ).to.be.revertedWithCustomError(escrow, "InvalidAddress");
      await expect(
        escrow.connect(client).deposit("same", client.address, 1, now + 10n, hash("terms")),
      ).to.be.revertedWithCustomError(escrow, "IdenticalParticipants");
      await expect(
        escrow.connect(client).deposit("amount", developer.address, 0, now + 10n, hash("terms")),
      ).to.be.revertedWithCustomError(escrow, "InvalidAmount");
      await expect(
        escrow.connect(client).deposit("terms", developer.address, 1, now + 10n, ethers.ZeroHash),
      ).to.be.revertedWithCustomError(escrow, "ZeroHash");
      await expect(
        escrow.connect(client).deposit("deadline", developer.address, 1, now, hash("terms")),
      ).to.be.revertedWithCustomError(escrow, "InvalidDeadline");
      await expect(
        escrow.connect(client).deposit("overflow", developer.address, 1, ethers.MaxUint256, hash("terms")),
      ).to.be.revertedWithCustomError(escrow, "InvalidDeadline");
    });

    it("rejects fee-on-transfer funding by exact balance delta", async () => {
      await token.setFee(100, outsider.address);
      await expect(deposit("fee-token")).to.be.revertedWithCustomError(escrow, "InvalidReceivedAmount");
      expect(await token.balanceOf(await escrow.getAddress())).to.equal(0);
    });

    it("allows delivery revisions through the deadline and rejects invalid submissions", async () => {
      const deadline = await deposit("delivery", USDC(100), 100);
      await expect(escrow.connect(client).submitWork("delivery", hash("wrong"))).to.be.revertedWithCustomError(
        escrow,
        "NotAuthorized",
      );
      await expect(escrow.connect(developer).submitWork("delivery", ethers.ZeroHash)).to.be.revertedWithCustomError(
        escrow,
        "ZeroHash",
      );
      await escrow.connect(developer).submitWork("delivery", hash("v1"));
      await time.setNextBlockTimestamp(deadline);
      await escrow.connect(developer).submitWork("delivery", hash("v2"));
      expect((await escrow.getEscrow("delivery")).deliveryHash).to.equal(hash("v2"));
      await time.setNextBlockTimestamp(deadline + 1n);
      await expect(escrow.connect(developer).submitWork("delivery", hash("late"))).to.be.revertedWithCustomError(
        escrow,
        "DeadlinePassed",
      );
    });
  });

  describe("resolution credits and independent claims", () => {
    it("allocates release credits with floor-rounded fee and no push transfers", async () => {
      await deposit("release", 101n);
      await escrow.connect(developer).submitWork("release", hash("delivery"));
      await expect(escrow.connect(client).releaseFunds("release"))
        .to.emit(escrow, "EscrowResolved")
        .withArgs("release", 1, 0, 99, 2, ethers.ZeroHash);
      expect(await token.balanceOf(developer.address)).to.equal(0);
      expect(await escrow.claimable(developer.address)).to.equal(99);
      expect(await escrow.claimable(feeRecipient.address)).to.equal(2);
      expect(await escrow.totalUnresolvedPrincipal()).to.equal(0);
      expect(await escrow.totalClaimable()).to.equal(101);
      await escrow.connect(outsider).claim(developer.address);
      expect(await token.balanceOf(developer.address)).to.equal(99);
      await expect(escrow.claim(developer.address)).to.be.revertedWithCustomError(escrow, "NothingToClaim");
    });

    it("gives a fee-free full refund after missed delivery at the strict boundary", async () => {
      const deadline = await deposit("missed", USDC(100), 100);
      await time.setNextBlockTimestamp(deadline);
      await expect(escrow.claimMissedDeliveryRefund("missed")).to.be.revertedWithCustomError(
        escrow,
        "DeadlineNotReached",
      );
      await time.setNextBlockTimestamp(deadline + 1n);
      await escrow.connect(outsider).claimMissedDeliveryRefund("missed");
      expect(await escrow.claimable(client.address)).to.equal(USDC(100));
      expect(await escrow.claimable(feeRecipient.address)).to.equal(0);
    });

    it("starts review timeout at the delivery deadline and permits permissionless resolution", async () => {
      const deadline = await deposit("review", USDC(100), 100);
      await escrow.connect(developer).submitWork("review", hash("delivery"));
      const reviewDeadline = deadline + 7n * BigInt(DAY);
      await time.setNextBlockTimestamp(reviewDeadline - 1n);
      await expect(escrow.claimReviewTimeout("review")).to.be.revertedWithCustomError(
        escrow,
        "ReviewWindowNotReached",
      );
      await time.setNextBlockTimestamp(reviewDeadline);
      await escrow.connect(outsider).claimReviewTimeout("review");
      expect(await escrow.claimable(developer.address)).to.equal(USDC(97.5));
      expect(await escrow.claimable(feeRecipient.address)).to.equal(USDC(2.5));
    });

    for (const clientBps of [0n, 1n, 5_000n, 9_999n, 10_000n]) {
      it(`conserves every unit for a ${clientBps} bps mutual settlement`, async () => {
        const id = `settlement-${clientBps}`;
        const amount = 1_000_003n;
        await deposit(id, amount);
        await escrow.connect(client).proposeSettlement(id, clientBps);
        await escrow.connect(developer).acceptSettlement(id);
        const clientAmount = (amount * clientBps) / 10_000n;
        const developerGross = amount - clientAmount;
        const fee = (developerGross * 250n) / 10_000n;
        const developerAmount = amount - clientAmount - fee;
        expect(
          (await escrow.claimable(client.address)) +
            (await escrow.claimable(developer.address)) +
            (await escrow.claimable(feeRecipient.address)),
        ).to.equal(amount);
        expect(await escrow.claimable(client.address)).to.equal(clientAmount);
        expect(await escrow.claimable(developer.address)).to.equal(developerAmount);
        expect(await escrow.claimable(feeRecipient.address)).to.equal(fee);
      });
    }

    it("supports revocation and rejects invalid settlement actions", async () => {
      await deposit("settlement-actions");
      await expect(escrow.connect(outsider).proposeSettlement("settlement-actions", 1)).to.be.revertedWithCustomError(
        escrow,
        "NotAuthorized",
      );
      await expect(escrow.connect(client).proposeSettlement("settlement-actions", 10_001)).to.be.revertedWithCustomError(
        escrow,
        "InvalidBasisPoints",
      );
      await escrow.connect(client).proposeSettlement("settlement-actions", 5_000);
      await expect(escrow.connect(outsider).acceptSettlement("settlement-actions")).to.be.revertedWithCustomError(
        escrow,
        "NotAuthorized",
      );
      await expect(escrow.connect(developer).proposeSettlement("settlement-actions", 4_000)).to.be.revertedWithCustomError(
        escrow,
        "SettlementAlreadyPending",
      );
      await expect(escrow.connect(developer).revokeSettlement("settlement-actions")).to.be.revertedWithCustomError(
        escrow,
        "NotSettlementProposer",
      );
      await expect(escrow.connect(client).acceptSettlement("settlement-actions")).to.be.revertedWithCustomError(
        escrow,
        "NotTheCounterparty",
      );
      await escrow.connect(client).revokeSettlement("settlement-actions");
      await expect(escrow.connect(developer).acceptSettlement("settlement-actions")).to.be.revertedWithCustomError(
        escrow,
        "NoPendingSettlement",
      );
    });

    it("isolates a blocked recipient and validates exact outbound balance deltas", async () => {
      await deposit("blocked", USDC(100));
      await escrow.connect(client).proposeSettlement("blocked", 5_000);
      await escrow.connect(developer).acceptSettlement("blocked");
      await token.setBlocked(client.address, true);
      await expect(escrow.connect(outsider).claim(client.address)).to.be.revertedWith("blocked");
      await expect(escrow.connect(outsider).claim(developer.address)).to.not.be.reverted;
      expect(await escrow.claimable(client.address)).to.equal(USDC(50));

      await token.setBlocked(client.address, false);
      await token.setFee(100, outsider.address);
      await expect(escrow.claim(client.address)).to.be.revertedWithCustomError(
        escrow,
        "RecipientBalanceMismatch",
      );
      expect(await escrow.claimable(client.address)).to.equal(USDC(50));
    });
  });

  describe("dispute evidence, rulings, and liveness", () => {
    it("allows either party to dispute before delivery with one nonzero immutable manifest", async () => {
      const d = await dispute("evidence", developer);
      expect(d.raisedBy).to.equal(developer.address);
      expect(d.raiserEvidenceHash).to.equal(hash(`evidence:evidence:${developer.address}`));
      await expect(
        escrow.connect(developer).submitCounterpartyEvidence("evidence", hash("self evidence")),
      ).to.be.revertedWithCustomError(escrow, "NotTheCounterparty");
      await expect(
        escrow.connect(client).submitCounterpartyEvidence("evidence", ethers.ZeroHash),
      ).to.be.revertedWithCustomError(escrow, "ZeroHash");
      await escrow.connect(client).submitCounterpartyEvidence("evidence", hash("client response"));
      await expect(
        escrow.connect(client).submitCounterpartyEvidence("evidence", hash("replacement")),
      ).to.be.revertedWithCustomError(escrow, "EvidenceAlreadySubmitted");
    });

    it("enforces the 72-hour evidence period and permits silence", async () => {
      const d = await dispute("response-window");
      const responseDeadline = d.raisedAt + 72n * 60n * 60n;
      await expect(
        escrow.connect(arbiter).postInitialRuling("response-window", 5_000, hash("early")),
      ).to.be.revertedWithCustomError(escrow, "EvidenceResponsePeriodActive");
      await time.setNextBlockTimestamp(responseDeadline);
      await expect(
        escrow.connect(developer).submitCounterpartyEvidence("response-window", hash("late")),
      ).to.be.revertedWithCustomError(escrow, "EvidenceResponseWindowClosed");
      await escrow.connect(arbiter).postInitialRuling("response-window", 5_000, hash("decision"));
    });

    it("allows only a party receiving less than full principal to use the single challenge", async () => {
      await reachInitialRuling("client-wins", 10_000n);
      await expect(escrow.connect(client).challengeRuling("client-wins")).to.be.revertedWithCustomError(
        escrow,
        "ChallengeNotPermitted",
      );
      await escrow.connect(developer).challengeRuling("client-wins");
      await expect(escrow.connect(client).challengeRuling("client-wins")).to.be.revertedWithCustomError(
        escrow,
        "InvalidPhase",
      );

      await reachInitialRuling("developer-wins", 0n);
      await expect(escrow.connect(developer).challengeRuling("developer-wins")).to.be.revertedWithCustomError(
        escrow,
        "ChallengeNotPermitted",
      );
      await escrow.connect(client).challengeRuling("developer-wins");
    });

    it("finalizes an unchallenged ruling permissionlessly at the seven-day boundary", async () => {
      const d = await reachInitialRuling("unchallenged", 2_500n);
      const deadline = d.initialRulingAt + 7n * BigInt(DAY);
      await time.setNextBlockTimestamp(deadline - 1n);
      await expect(escrow.finalizeRuling("unchallenged")).to.be.revertedWithCustomError(
        escrow,
        "RulingNotReady",
      );
      await time.setNextBlockTimestamp(deadline);
      await escrow.connect(outsider).finalizeRuling("unchallenged");
      expect((await escrow.getEscrow("unchallenged")).resolutionKind).to.equal(5);
    });

    it("enforces a 24-hour transparency notice after the one final ruling", async () => {
      const initial = await reachInitialRuling("final", 8_000n);
      await escrow.connect(developer).challengeRuling("final");
      await escrow.connect(arbiter).postFinalRuling("final", 4_000, hash("final decision"));
      const d = await escrow.getDispute("final");
      expect(d.initialRulingAt).to.equal(initial.initialRulingAt);
      const deadline = d.finalRulingAt + BigInt(DAY);
      await time.setNextBlockTimestamp(deadline - 1n);
      await expect(escrow.finalizeRuling("final")).to.be.revertedWithCustomError(escrow, "RulingNotReady");
      await time.setNextBlockTimestamp(deadline);
      await escrow.connect(outsider).finalizeRuling("final");
    });

    it("makes fallback win exactly at the no-initial-ruling timeout", async () => {
      const d = await dispute("initial-stall");
      const deadline = d.raisedAt + 30n * BigInt(DAY);
      await time.setNextBlockTimestamp(deadline - 1n);
      await expect(escrow.finalizeArbiterTimeoutSplit("initial-stall")).to.be.revertedWithCustomError(
        escrow,
        "ArbiterStallNotReached",
      );
      await time.setNextBlockTimestamp(deadline);
      await expect(
        escrow.connect(arbiter).postInitialRuling("initial-stall", 5_000, hash("too late")),
      ).to.be.revertedWithCustomError(escrow, "ArbiterStallDeadlineReached");
      await escrow.connect(outsider).finalizeArbiterTimeoutSplit("initial-stall");
      expect((await escrow.getEscrow("initial-stall")).resolutionKind).to.equal(6);
    });

    it("makes fallback win exactly at the no-final-ruling timeout", async () => {
      await reachInitialRuling("final-stall", 5_000n);
      await escrow.connect(client).challengeRuling("final-stall");
      const d = await escrow.getDispute("final-stall");
      const deadline = d.challengedAt + 30n * BigInt(DAY);
      await time.setNextBlockTimestamp(deadline);
      await expect(
        escrow.connect(arbiter).postFinalRuling("final-stall", 5_000, hash("too late")),
      ).to.be.revertedWithCustomError(escrow, "ArbiterStallDeadlineReached");
      await escrow.connect(outsider).finalizeArbiterTimeoutSplit("final-stall");
    });

    it("allows mutual settlement from every unresolved dispute phase", async () => {
      await dispute("disputed-settlement");
      await escrow.connect(client).proposeSettlement("disputed-settlement", 6_000);
      await escrow.connect(developer).acceptSettlement("disputed-settlement");

      await reachInitialRuling("ruling-settlement", 5_000n);
      await escrow.connect(developer).proposeSettlement("ruling-settlement", 4_000);
      await escrow.connect(client).acceptSettlement("ruling-settlement");

      await reachInitialRuling("challenged-settlement", 5_000n);
      await escrow.connect(client).challengeRuling("challenged-settlement");
      await escrow.connect(developer).proposeSettlement("challenged-settlement", 5_500);
      await escrow.connect(client).acceptSettlement("challenged-settlement");
    });
  });

  describe("accounting invariants", () => {
    it("covers missing escrow and authorization failure surfaces", async () => {
      await expect(escrow.submitWork("", hash("delivery"))).to.be.revertedWithCustomError(
        escrow,
        "EmptyEscrowId",
      );
      await expect(escrow.submitWork("missing", hash("delivery"))).to.be.revertedWithCustomError(
        escrow,
        "EscrowNotFound",
      );
      await expect(escrow.releaseFunds("")).to.be.revertedWithCustomError(escrow, "EmptyEscrowId");
      await expect(escrow.claimMissedDeliveryRefund("")).to.be.revertedWithCustomError(
        escrow,
        "EmptyEscrowId",
      );
      await expect(escrow.claimReviewTimeout("")).to.be.revertedWithCustomError(escrow, "EmptyEscrowId");
      await expect(escrow.proposeSettlement("", 0)).to.be.revertedWithCustomError(escrow, "EmptyEscrowId");
      await expect(escrow.raiseDispute("", hash("evidence"))).to.be.revertedWithCustomError(
        escrow,
        "EmptyEscrowId",
      );
      await expect(escrow.connect(outsider).pause()).to.be.reverted;
      await expect(escrow.connect(outsider).unpause()).to.be.reverted;
      await expect(escrow.connect(outsider).transferOwnership(nextOwner.address)).to.be.reverted;
      await expect(escrow.connect(outsider).proposeArbiter(nextArbiter.address)).to.be.reverted;
      await expect(escrow.connect(outsider).proposeFeeRecipient(nextFeeRecipient.address)).to.be.reverted;
      await expect(escrow.claim(ethers.ZeroAddress)).to.be.revertedWithCustomError(escrow, "InvalidAddress");
    });

    it("rejects invalid actions across ordinary lifecycle phases", async () => {
      await deposit("ordinary-errors");
      await expect(escrow.revokeSettlement("ordinary-errors")).to.be.revertedWithCustomError(
        escrow,
        "NoPendingSettlement",
      );
      await expect(escrow.connect(client).releaseFunds("ordinary-errors")).to.be.revertedWithCustomError(
        escrow,
        "NoDelivery",
      );
      await expect(escrow.claimReviewTimeout("ordinary-errors")).to.be.revertedWithCustomError(
        escrow,
        "NoDelivery",
      );
      await escrow.connect(developer).submitWork("ordinary-errors", hash("delivery"));
      await expect(escrow.claimMissedDeliveryRefund("ordinary-errors")).to.be.revertedWithCustomError(
        escrow,
        "NoDelivery",
      );
      await expect(escrow.connect(developer).releaseFunds("ordinary-errors")).to.be.revertedWithCustomError(
        escrow,
        "NotAuthorized",
      );
      await escrow.connect(client).releaseFunds("ordinary-errors");
      await expect(escrow.connect(developer).submitWork("ordinary-errors", hash("again"))).to.be.revertedWithCustomError(
        escrow,
        "InvalidPhase",
      );
      await expect(escrow.claimMissedDeliveryRefund("ordinary-errors")).to.be.revertedWithCustomError(
        escrow,
        "InvalidPhase",
      );
      await expect(escrow.claimReviewTimeout("ordinary-errors")).to.be.revertedWithCustomError(
        escrow,
        "InvalidPhase",
      );
      await expect(escrow.revokeSettlement("ordinary-errors")).to.be.revertedWithCustomError(
        escrow,
        "InvalidPhase",
      );
      await expect(escrow.acceptSettlement("ordinary-errors")).to.be.revertedWithCustomError(
        escrow,
        "InvalidPhase",
      );
    });

    it("rejects invalid actions across dispute and ruling phases", async () => {
      await deposit("dispute-errors");
      await expect(
        escrow.connect(client).raiseDispute("dispute-errors", ethers.ZeroHash),
      ).to.be.revertedWithCustomError(escrow, "ZeroHash");
      await escrow.connect(client).raiseDispute("dispute-errors", hash("evidence"));
      await expect(
        escrow.connect(outsider).acceptSettlement("dispute-errors"),
      ).to.be.revertedWithCustomError(escrow, "NoPendingSettlement");
      await expect(
        escrow.connect(outsider).postInitialRuling("dispute-errors", 5_000, hash("decision")),
      ).to.be.revertedWithCustomError(escrow, "NotAuthorized");
      const d = await escrow.getDispute("dispute-errors");
      await time.setNextBlockTimestamp(d.raisedAt + 72n * 60n * 60n);
      await expect(
        escrow.connect(arbiter).postInitialRuling("dispute-errors", 10_001, hash("decision")),
      ).to.be.revertedWithCustomError(escrow, "InvalidBasisPoints");
      await expect(
        escrow.connect(arbiter).postInitialRuling("dispute-errors", 5_000, ethers.ZeroHash),
      ).to.be.revertedWithCustomError(escrow, "ZeroHash");
      await escrow.connect(arbiter).postInitialRuling("dispute-errors", 5_000, hash("decision"));
      const ruled = await escrow.getDispute("dispute-errors");
      await time.setNextBlockTimestamp(ruled.initialRulingAt + 7n * BigInt(DAY));
      await expect(escrow.connect(client).challengeRuling("dispute-errors")).to.be.revertedWithCustomError(
        escrow,
        "ChallengeWindowClosed",
      );
      await escrow.finalizeRuling("dispute-errors");
      await expect(
        escrow.connect(developer).submitCounterpartyEvidence("dispute-errors", hash("late")),
      ).to.be.revertedWithCustomError(escrow, "InvalidPhase");
      await expect(
        escrow.connect(arbiter).postInitialRuling("dispute-errors", 5_000, hash("again")),
      ).to.be.revertedWithCustomError(escrow, "InvalidPhase");
      await expect(escrow.finalizeRuling("dispute-errors")).to.be.revertedWithCustomError(
        escrow,
        "InvalidPhase",
      );
      await expect(escrow.finalizeArbiterTimeoutSplit("dispute-errors")).to.be.revertedWithCustomError(
        escrow,
        "InvalidPhase",
      );

      await reachInitialRuling("final-errors", 5_000n);
      await escrow.connect(client).challengeRuling("final-errors");
      await expect(
        escrow.connect(outsider).postFinalRuling("final-errors", 5_000, hash("final")),
      ).to.be.revertedWithCustomError(escrow, "NotAuthorized");
      await expect(
        escrow.connect(arbiter).postFinalRuling("final-errors", 10_001, hash("final")),
      ).to.be.revertedWithCustomError(escrow, "InvalidBasisPoints");
      await expect(
        escrow.connect(arbiter).postFinalRuling("final-errors", 5_000, ethers.ZeroHash),
      ).to.be.revertedWithCustomError(escrow, "ZeroHash");

      await escrow.connect(arbiter).postFinalRuling("final-errors", 5_000, hash("final"));
      await expect(
        escrow.connect(arbiter).postFinalRuling("final-errors", 5_000, hash("again")),
      ).to.be.revertedWithCustomError(escrow, "InvalidPhase");
    });

    it("detects issuer-induced insolvency before accepting more principal", async () => {
      await deposit("solvency-a", USDC(100));
      await token.burn(await escrow.getAddress(), 1);
      await expect(deposit("solvency-b", USDC(1))).to.be.revertedWithCustomError(escrow, "Insolvent");
      expect(await escrow.totalUnresolvedPrincipal()).to.equal(USDC(100));
    });

    it("keeps unresolved principal plus credits equal to deposited units", async () => {
      await deposit("a", USDC(10));
      await deposit("b", USDC(20));
      await escrow.connect(developer).submitWork("a", hash("a"));
      await escrow.connect(client).releaseFunds("a");
      expect(await escrow.totalUnresolvedPrincipal()).to.equal(USDC(20));
      expect(await escrow.totalClaimable()).to.equal(USDC(10));
      expect(await escrow.accountedBalance()).to.equal(USDC(30));
      expect(await token.balanceOf(await escrow.getAddress())).to.equal(USDC(30));
      await escrow.claim(developer.address);
      await escrow.claim(feeRecipient.address);
      expect(await escrow.accountedBalance()).to.equal(USDC(20));
      expect(await token.balanceOf(await escrow.getAddress())).to.equal(USDC(20));
    });

    it("prevents double allocation and irreversible terminal transitions", async () => {
      await deposit("terminal");
      await escrow.connect(developer).submitWork("terminal", hash("delivery"));
      await escrow.connect(client).releaseFunds("terminal");
      await expect(escrow.connect(client).releaseFunds("terminal")).to.be.revertedWithCustomError(
        escrow,
        "InvalidPhase",
      );
      await expect(escrow.connect(client).raiseDispute("terminal", hash("evidence"))).to.be.revertedWithCustomError(
        escrow,
        "InvalidPhase",
      );
      await expect(escrow.connect(client).proposeSettlement("terminal", 1)).to.be.revertedWithCustomError(
        escrow,
        "InvalidPhase",
      );
    });
  });
});

describe("production Safe deployment checks", () => {
  it("accepts only official Safe v1.4.1 singleton implementations", async () => {
    const signers = await ethers.getSigners();
    if (signers.length < 13) throw new Error("Hardhat must provide at least thirteen test signers");
    const [singleton] = SAFE_V141_SINGLETONS;
    if (!singleton) throw new Error("An approved Safe singleton must be configured");
    const mockFactory = await ethers.getContractFactory("MockSafe");
    const safes = await Promise.all([
      mockFactory.deploy(singleton, signers.slice(0, 3).map((signer) => signer.address)),
      mockFactory.deploy(singleton, signers.slice(3, 6).map((signer) => signer.address)),
      mockFactory.deploy(singleton, signers.slice(6, 9).map((signer) => signer.address)),
    ]);
    await Promise.all(safes.map((safe) => safe.waitForDeployment()));

    const snapshots = await assertProductionSafes(ethers.provider, [
      await safes[0].getAddress(),
      await safes[1].getAddress(),
      await safes[2].getAddress(),
    ]);
    expect(snapshots).to.have.length(3);

    const spoof = await mockFactory.deploy(
      signers[9]!.address,
      signers.slice(10, 13).map((signer) => signer.address),
    );
    await spoof.waitForDeployment();
    let rejection: unknown;
    try {
      await assertProductionSafes(ethers.provider, [
        await spoof.getAddress(),
        await safes[1].getAddress(),
        await safes[2].getAddress(),
      ]);
    } catch (error) {
      rejection = error;
    }
    expect(rejection).to.be.instanceOf(Error);
    expect((rejection as Error).message).to.contain("uses unapproved Safe singleton");
  });
});
