import { describe, expect, it } from "vitest";
import { Wallet } from "ethers";
import { createLoginMessage, verifySiweLogin } from "../lib/auth/siwe";

describe("verifySiweLogin", () => {
  it("accepts a valid signature when payload address is lowercase", async () => {
    const wallet = Wallet.createRandom();
    const payload = {
      domain: "localhost:4000",
      address: wallet.address.toLowerCase(),
      statement: "Please ensure that the domain above matches the URL of the current website.",
      version: "1",
      nonce: "nonce-123",
      issued_at: new Date(Date.now() - 1000).toISOString(),
      expiration_time: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      invalid_before: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    };
    const signature = await wallet.signMessage(createLoginMessage(payload));
    const recovered = verifySiweLogin({ payload, signature }, "localhost:4000");
    expect(recovered.toLowerCase()).toBe(wallet.address.toLowerCase());
  });
});
