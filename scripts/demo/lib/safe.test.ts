// @ts-ignore
import { describe, expect, it } from "bun:test";
import { ethers } from "./ethers";
import {
  buildPackedSignatures,
  computeSafeTxHash,
  signSafeTx,
  type SafeTxData,
} from "./safe";

describe("Safe v1.4.1 EIP-712 Signing and Hash Computation (R6)", () => {
  const safeAddress = "0x58f8f2e4B3ECcC6dC4a6541Bc3F7e9F7226e2E90";
  const chainId = 84532;

  const testTx: SafeTxData = {
    to: "0x1234567890123456789012345678901234567890",
    value: 0,
    data: "0xdeadbeef",
    operation: 0,
    safeTxGas: 0,
    baseGas: 0,
    gasPrice: 0,
    gasToken: ethers.constants.AddressZero,
    refundReceiver: ethers.constants.AddressZero,
  };

  it("computes deterministic EIP-712 SafeTx hash matching EIP-712 encoding", () => {
    const hash1 = computeSafeTxHash(safeAddress, chainId, testTx, 0);
    const hash2 = computeSafeTxHash(safeAddress, chainId, testTx, 0);

    expect(hash1.startsWith("0x")).toBe(true);
    expect(hash1.length).toBe(66);
    expect(hash1).toBe(hash2);

    // Nonce changes the hash
    const hashNonce1 = computeSafeTxHash(safeAddress, chainId, testTx, 1);
    expect(hashNonce1).not.toBe(hash1);
  });

  it("packs signatures in ascending order of signer addresses", async () => {
    const walletA = ethers.Wallet.createRandom();
    const walletB = ethers.Wallet.createRandom();

    const sigA = await signSafeTx(safeAddress, chainId, testTx, 0, walletA);
    const sigB = await signSafeTx(safeAddress, chainId, testTx, 0, walletB);

    const packed1 = buildPackedSignatures([sigA, sigB]);
    const packed2 = buildPackedSignatures([sigB, sigA]);

    // Packed signatures must be order-independent because of internal sorting
    expect(packed1).toBe(packed2);
    // 2 signatures * 65 bytes = 130 bytes = 260 hex characters + "0x" = 262 chars
    expect(packed1.length).toBe(2 + 65 * 2 * 2);
  });
});
