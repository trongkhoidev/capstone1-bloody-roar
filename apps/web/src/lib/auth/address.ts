import { utils } from "ethers";

/** EIP-55 checksum. Thirdweb Auth compares recovered signer with `===`. */
export function toChecksumAddress(address: string): string {
  return utils.getAddress(address);
}

export function tryChecksumAddress(
  address: string | undefined | null,
): string | undefined {
  if (!address) return undefined;
  try {
    return utils.getAddress(address);
  } catch {
    return undefined;
  }
}
