// @ts-ignore
import { describe, expect, it } from "bun:test";
import { ethers } from "./lib/ethers";
import {
  encodeSafeSetup,
  predictSafeAddress,
  SAFE_FALLBACK_HANDLER,
  SAFE_FACTORY_ADDRESS,
  SAFE_SINGLETON_V141,
} from "./create-safes";

describe("Safe Creation and Prediction (R3)", () => {
  const owners = [
    "0x1111111111111111111111111111111111111111",
    "0x2222222222222222222222222222222222222222",
    "0x3333333333333333333333333333333333333333",
  ];

  it("encodes Safe setup calldata correctly with threshold 2 and fallback handler", () => {
    const data = encodeSafeSetup(owners, 2);
    expect(data.startsWith("0x")).toBe(true);

    const iface = new ethers.utils.Interface([
      "function setup(address[] _owners, uint256 _threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address payable paymentReceiver)",
    ]);
    const decoded = iface.decodeFunctionData("setup", data);
    expect(decoded._owners.length).toBe(3);
    expect(decoded._threshold.toString()).toBe("2");
    expect(decoded.fallbackHandler.toLowerCase()).toBe(SAFE_FALLBACK_HANDLER.toLowerCase());
  });

  it("predicts deterministic CREATE2 Safe addresses", () => {
    const dummyCreationCode = "0x6080604052";
    const initializer1 = encodeSafeSetup(owners, 2);
    const addr1 = predictSafeAddress(
      SAFE_FACTORY_ADDRESS,
      SAFE_SINGLETON_V141,
      dummyCreationCode,
      initializer1,
      8453201
    );

    expect(ethers.utils.isAddress(addr1)).toBe(true);

    // Idempotent calculation
    const addr1Again = predictSafeAddress(
      SAFE_FACTORY_ADDRESS,
      SAFE_SINGLETON_V141,
      dummyCreationCode,
      initializer1,
      8453201
    );
    expect(addr1Again).toBe(addr1);

    // Different saltNonce gives different address
    const addr2 = predictSafeAddress(
      SAFE_FACTORY_ADDRESS,
      SAFE_SINGLETON_V141,
      dummyCreationCode,
      initializer1,
      8453202
    );
    expect(addr2).not.toBe(addr1);
  });
});
