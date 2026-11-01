import { Contract, Provider, getAddress } from "ethers";

export const BASE_SEPOLIA_CHAIN_ID = 84532n;
export const BASE_SEPOLIA_USDC = getAddress("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
export const SAFE_COMPATIBILITY_FALLBACK_HANDLER = getAddress(
  "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99",
);
export const SAFE_V141_SINGLETONS = new Set([
  getAddress("0x41675C099F32341bf84BFc5382aF534df5C7461a"),
  getAddress("0x29fcB43b46531BcA003ddC8FCB67FFE91900C762"),
]);

const SAFE_SENTINEL = "0x0000000000000000000000000000000000000001";
const SAFE_SINGLETON_STORAGE_SLOT = 0n;
const GUARD_STORAGE_SLOT =
  "0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8";
const FALLBACK_HANDLER_STORAGE_SLOT =
  "0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5";

const SAFE_ABI = [
  "function VERSION() view returns (string)",
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function getModulesPaginated(address start, uint256 pageSize) view returns (address[] array, address next)",
];

const TOKEN_ABI = [
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
];

type SafeSnapshot = {
  address: string;
  singleton: string;
  owners: string[];
  threshold: bigint;
  version: string;
  fallbackHandler: string;
};

function storedAddress(value: string): string {
  return getAddress(`0x${value.slice(-40)}`);
}

export async function assertBaseSepoliaUsdc(provider: Provider, tokenAddress: string) {
  const token = getAddress(tokenAddress);
  if (token !== BASE_SEPOLIA_USDC) {
    throw new Error(`USDC must be the canonical Base Sepolia deployment: ${BASE_SEPOLIA_USDC}`);
  }
  if ((await provider.getCode(token)) === "0x") throw new Error("Canonical USDC has no bytecode");

  const metadata = new Contract(token, TOKEN_ABI, provider);
  const [decimals, name, symbol] = await Promise.all([
    metadata.getFunction("decimals")() as Promise<bigint>,
    metadata.getFunction("name")() as Promise<string>,
    metadata.getFunction("symbol")() as Promise<string>,
  ]);
  if (decimals !== 6n || name !== "USDC" || symbol !== "USDC") {
    throw new Error(`Unexpected USDC metadata: ${name} (${symbol}), decimals=${decimals}`);
  }
}

async function inspectSafe(provider: Provider, safeAddress: string): Promise<SafeSnapshot> {
  const address = getAddress(safeAddress);
  if ((await provider.getCode(address)) === "0x") throw new Error(`${address} has no bytecode`);

  const safe = new Contract(address, SAFE_ABI, provider);
  const [version, owners, threshold, modulesResult, singletonValue, guardValue, fallbackValue] =
    await Promise.all([
      safe.getFunction("VERSION")() as Promise<string>,
      safe.getFunction("getOwners")() as Promise<string[]>,
      safe.getFunction("getThreshold")() as Promise<bigint>,
      safe.getFunction("getModulesPaginated")(SAFE_SENTINEL, 10) as Promise<[string[], string]>,
      provider.getStorage(address, SAFE_SINGLETON_STORAGE_SLOT),
      provider.getStorage(address, GUARD_STORAGE_SLOT),
      provider.getStorage(address, FALLBACK_HANDLER_STORAGE_SLOT),
    ]);

  if (version !== "1.4.1") throw new Error(`${address} uses unapproved Safe version ${version}`);
  const singleton = storedAddress(singletonValue);
  if (!SAFE_V141_SINGLETONS.has(singleton)) {
    throw new Error(`${address} uses unapproved Safe singleton ${singleton}`);
  }
  if (owners.length !== 3 || threshold !== 2n) {
    throw new Error(`${address} must be configured as a 2-of-3 Safe`);
  }
  if (modulesResult[0].length !== 0 || getAddress(modulesResult[1]) !== getAddress(SAFE_SENTINEL)) {
    throw new Error(`${address} has enabled Safe modules`);
  }
  if (storedAddress(guardValue) !== getAddress("0x0000000000000000000000000000000000000000")) {
    throw new Error(`${address} has a Safe guard configured`);
  }

  const fallbackHandler = storedAddress(fallbackValue);
  const noHandler = getAddress("0x0000000000000000000000000000000000000000");
  if (fallbackHandler !== noHandler && fallbackHandler !== SAFE_COMPATIBILITY_FALLBACK_HANDLER) {
    throw new Error(`${address} has an unapproved fallback handler ${fallbackHandler}`);
  }

  return {
    address,
    singleton,
    owners: owners.map(getAddress),
    threshold,
    version,
    fallbackHandler,
  };
}

export async function assertProductionSafes(
  provider: Provider,
  roleAddresses: [string, string, string],
): Promise<SafeSnapshot[]> {
  const uniqueRoles = new Set(roleAddresses.map((address) => getAddress(address)));
  if (uniqueRoles.size !== roleAddresses.length) throw new Error("Role Safes must be distinct");

  const snapshots = await Promise.all(roleAddresses.map((address) => inspectSafe(provider, address)));
  const allOwners = snapshots.flatMap((safe) => safe.owners);
  if (new Set(allOwners).size !== allOwners.length) {
    throw new Error("Owner, arbiter, and fee Safes must have disjoint signer sets");
  }
  return snapshots;
}
