// apps/web/src/test/escrow-core/eip712.test.ts
import { ethers } from "ethers";
import { describe, expect, it } from "vitest";
import {
  fundingIntentTypedData,
  recoverFundingIntentSigner,
  type FundingIntentInput,
} from "@bloody-roar/shared/escrow";

// Khóa ký được sinh ngẫu nhiên mỗi lần chạy. Ký bằng ethers v5, recover bằng viem: cùng địa chỉ nghĩa là hai bên hash ra cùng digest.
const wallet = ethers.Wallet.createRandom();

const intent: FundingIntentInput = {
  chainId: 84532,
  verifyingContract: "0x1111111111111111111111111111111111111111",
  escrowId: "issue-1",
  client: wallet.address as `0x${string}`,
  developer: "0x3333333333333333333333333333333333333333",
  token: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  amount: 1_250_000_000n,
  deliveryDeadline: 1_791_828_000n,
  termsHash: `0x${"11".repeat(32)}`,
  intentExpiry: 1_791_800_000n,
  nonce: 1n,
};

// Domain theo QĐ-18, viết tay để test không dùng lại hàm đang kiểm.
const domain = {
  name: "BloodyRoarEscrow",
  version: "1",
  chainId: intent.chainId,
  verifyingContract: intent.verifyingContract,
};

// Kiểu theo QĐ-18. Thứ tự field là một phần của digest, nên đổi thứ tự là đổi chữ ký.
const ethersTypes = {
  FundingIntent: [
    { name: "escrowId", type: "string" },
    { name: "client", type: "address" },
    { name: "developer", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "deliveryDeadline", type: "uint256" },
    { name: "termsHash", type: "bytes32" },
    { name: "intentExpiry", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
};

// ethers v5 nhận số dạng chuỗi.
function ethersMessage(input: FundingIntentInput) {
  return {
    escrowId: input.escrowId,
    client: input.client,
    developer: input.developer,
    token: input.token,
    amount: input.amount.toString(),
    deliveryDeadline: input.deliveryDeadline.toString(),
    termsHash: input.termsHash,
    intentExpiry: input.intentExpiry.toString(),
    nonce: input.nonce.toString(),
  };
}

describe("fundingIntentTypedData", () => {
  it("uses the QĐ-18 domain and the FundingIntent field order", () => {
    const typed = fundingIntentTypedData(intent);
    expect(typed.domain).toEqual(domain);
    expect(typed.types).toEqual(ethersTypes);
    expect(typed.primaryType).toBe("FundingIntent");
  });
});

describe("recoverFundingIntentSigner", () => {
  it("recovers the address that signed the intent with another library", async () => {
    const signature = (await wallet._signTypedData(domain, ethersTypes, ethersMessage(intent))) as `0x${string}`;
    expect(await recoverFundingIntentSigner(intent, signature)).toBe(wallet.address);
  });

  it("recovers a different address when any signed field changes", async () => {
    const signature = (await wallet._signTypedData(
      domain,
      ethersTypes,
      ethersMessage(intent),
    )) as `0x${string}`;
    expect(await recoverFundingIntentSigner({ ...intent, amount: 1_250_000_001n }, signature)).not.toBe(wallet.address);
    expect(await recoverFundingIntentSigner({ ...intent, nonce: 2n }, signature)).not.toBe(wallet.address);
  });

  it("binds the signature to the chain (domain separation)", async () => {
    const signature = (await wallet._signTypedData(
      domain,
      ethersTypes,
      ethersMessage(intent),
    )) as `0x${string}`;
    expect(await recoverFundingIntentSigner({ ...intent, chainId: 1 }, signature)).not.toBe(wallet.address);
  });
});
