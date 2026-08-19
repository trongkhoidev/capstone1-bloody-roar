// apps/contracts/test/BloodyRoarEscrow.test.ts
// Sprint 0: Compile verification tests only
// Sprint 1: Add full unit tests (14+ cases) for all escrow functions

import { expect } from "chai";
import { ethers } from "hardhat";
import type { BloodyRoarEscrow } from "../typechain-types";

describe("BloodyRoarEscrow", () => {
  let escrow: BloodyRoarEscrow;
  let owner: Awaited<ReturnType<typeof ethers.getSigner>>;
  let arbiter: Awaited<ReturnType<typeof ethers.getSigner>>;
  let client: Awaited<ReturnType<typeof ethers.getSigner>>;
  let developer: Awaited<ReturnType<typeof ethers.getSigner>>;
  let feeRecipient: Awaited<ReturnType<typeof ethers.getSigner>>;

  beforeEach(async () => {
    [owner, arbiter, client, developer, feeRecipient] =
      await ethers.getSigners();

    const EscrowFactory = await ethers.getContractFactory("BloodyRoarEscrow");
    escrow = (await EscrowFactory.deploy(
      arbiter.address,
      feeRecipient.address
    )) as BloodyRoarEscrow;

    await escrow.waitForDeployment();
  });

  // ---------------------------------------------------------------------------
  // Sprint 0: Deployment tests (compile verification)
  // ---------------------------------------------------------------------------

  describe("Deployment", () => {
    it("should deploy successfully", async () => {
      expect(await escrow.getAddress()).to.be.a("string");
    });

    it("should set the correct arbiter", async () => {
      expect(await escrow.arbiter()).to.equal(arbiter.address);
    });

    it("should set the correct fee recipient", async () => {
      expect(await escrow.feeRecipient()).to.equal(feeRecipient.address);
    });

    it("should set the correct owner", async () => {
      expect(await escrow.owner()).to.equal(owner.address);
    });

    it("should have correct constants", async () => {
      expect(await escrow.TIMEOUT_PERIOD()).to.equal(30n * 24n * 60n * 60n);
      expect(await escrow.CHALLENGE_PERIOD()).to.equal(24n * 60n * 60n);
      expect(await escrow.PLATFORM_FEE_BPS()).to.equal(250n);
    });
  });

  // ---------------------------------------------------------------------------
  // Admin: Pause / Unpause
  // ---------------------------------------------------------------------------

  describe("Admin", () => {
    it("owner can pause the contract", async () => {
      await expect(escrow.connect(owner).pause()).to.not.be.reverted;
      expect(await escrow.paused()).to.equal(true);
    });

    it("owner can unpause the contract", async () => {
      await escrow.connect(owner).pause();
      await expect(escrow.connect(owner).unpause()).to.not.be.reverted;
      expect(await escrow.paused()).to.equal(false);
    });

    it("non-owner cannot pause", async () => {
      await expect(escrow.connect(client).pause()).to.be.revertedWithCustomError(
        escrow,
        "OwnableUnauthorizedAccount"
      );
    });

    it("owner can update arbiter", async () => {
      const newArbiter = developer.address;
      await escrow.connect(owner).setArbiter(newArbiter);
      expect(await escrow.arbiter()).to.equal(newArbiter);
    });
  });

  // ---------------------------------------------------------------------------
  // Sprint 1 TODO: Add tests for all escrow functions
  // ---------------------------------------------------------------------------
  // Planned tests:
  // [ ] deposit() — locks funds, emits Deposited
  // [ ] deposit() — reverts if paused
  // [ ] deposit() — reverts if issue already has escrow
  // [ ] releaseFunds() — transfers funds to dev, takes fee
  // [ ] releaseFunds() — only client can call
  // [ ] mutualCancel() — both parties must approve
  // [ ] mutualCancel() — refunds to client after both approve
  // [ ] claimTimeout() — developer claims after 30 days
  // [ ] claimTimeout() — reverts before 30 days
  // [ ] raiseDispute() — sets DISPUTED state
  // [ ] raiseDispute() — only parties can call
  // [ ] proposeResolution() — only arbiter can call
  // [ ] challengeResolution() — resets to DISPUTED within 24h
  // [ ] executeResolution() — splits funds after 24h
  // ---------------------------------------------------------------------------
});
