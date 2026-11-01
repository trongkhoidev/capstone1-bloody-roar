import * as fs from "node:fs";
import * as path from "node:path";
import { ethers, type Contract, type providers, type Wallet } from "./lib/ethers";
import { appendLedger } from "./lib/ledger";
import { assertBaseSepolia, assertNotForbidden, BASE_SEPOLIA_CHAIN_ID } from "./fund";
import { KEYS_PATH, type WalletStore } from "./wallets";

export const SAFE_FACTORY_ADDRESS = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";
export const SAFE_SINGLETON_V141 = "0x41675C099F32341bf84BFc5382aF534df5C7461a";
export const SAFE_FALLBACK_HANDLER = "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99";

export const SAFE_FACTORY_ABI = [
  "function createProxyWithNonce(address _singleton, bytes initializer, uint256 saltNonce) returns (address proxy)",
  "function proxyCreationCode() view returns (bytes)",
  "event ProxyCreation(address indexed proxy, address singleton)",
];

export const SAFE_ABI = [
  "function setup(address[] _owners, uint256 _threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address payable paymentReceiver)",
  "function VERSION() view returns (string)",
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
];

export const SAFES_PATH = path.resolve(process.cwd(), "demo-wallets/safes.json");

export interface RoleSafes {
  ownerSafe: string;
  arbiterSafe: string;
  feeSafe: string;
}

export function encodeSafeSetup(owners: string[], threshold = 2): string {
  const iface = new ethers.utils.Interface(SAFE_ABI);
  return iface.encodeFunctionData("setup", [
    owners,
    threshold,
    ethers.constants.AddressZero,
    "0x",
    SAFE_FALLBACK_HANDLER,
    ethers.constants.AddressZero,
    0,
    ethers.constants.AddressZero,
  ]);
}

export function predictSafeAddress(
  factoryAddress: string,
  singleton: string,
  proxyCreationCode: string,
  initializer: string,
  saltNonce: ethers.BigNumberish
): string {
  const initHash = ethers.utils.keccak256(initializer);
  const salt = ethers.utils.keccak256(
    ethers.utils.solidityPack(["bytes32", "uint256"], [initHash, saltNonce])
  );
  const deploymentData = ethers.utils.solidityPack(
    ["bytes", "uint256"],
    [proxyCreationCode, singleton]
  );
  const codeHash = ethers.utils.keccak256(deploymentData);
  return ethers.utils.getCreate2Address(factoryAddress, salt, codeHash);
}

export async function createOrGetSafe(
  role: "ownerSafe" | "arbiterSafe" | "feeSafe",
  owners: string[],
  saltNonce: number,
  deployerWallet: Wallet,
  factoryContract: Contract,
  proxyCreationCode: string
): Promise<string> {
  const provider = deployerWallet.provider;
  const initializer = encodeSafeSetup(owners, 2);
  const predictedAddress = predictSafeAddress(
    SAFE_FACTORY_ADDRESS,
    SAFE_SINGLETON_V141,
    proxyCreationCode,
    initializer,
    saltNonce
  );

  const existingCode = await provider.getCode(predictedAddress);
  if (existingCode !== "0x") {
    console.log(`Safe for ${role} already exists at ${predictedAddress}`);
    return predictedAddress;
  }

  console.log(`Creating Safe for ${role} at predicted ${predictedAddress}...`);
  const tx = await factoryContract.createProxyWithNonce(
    SAFE_SINGLETON_V141,
    initializer,
    saltNonce
  );
  console.log(`Tx submitted: ${tx.hash}, waiting confirmation...`);
  const receipt = await tx.wait(1);

  appendLedger({
    ts: new Date().toISOString(),
    from: deployerWallet.address,
    to: SAFE_FACTORY_ADDRESS,
    asset: "ETH",
    amount: "0.0",
    txHash: tx.hash,
    purpose: `Deploy Safe v1.4.1 for ${role} at ${predictedAddress}`,
  });

  return predictedAddress;
}

export async function setupAllSafes(
  provider: providers.JsonRpcProvider,
  keysPath: string = KEYS_PATH,
  safesPath: string = SAFES_PATH
): Promise<RoleSafes> {
  await assertBaseSepolia(provider);

  const keys = JSON.parse(fs.readFileSync(keysPath, "utf-8")) as WalletStore;
  const deployer = keys["deployer"];
  if (!deployer) throw new Error("Deployer wallet not found");
  assertNotForbidden(deployer.address);

  const ownerSafeOwners = [keys["ownerSafe1"]!.address, keys["ownerSafe2"]!.address, keys["ownerSafe3"]!.address];
  const arbiterSafeOwners = [keys["arbiterSafe1"]!.address, keys["arbiterSafe2"]!.address, keys["arbiterSafe3"]!.address];
  const feeSafeOwners = [keys["feeSafe1"]!.address, keys["feeSafe2"]!.address, keys["feeSafe3"]!.address];

  // Check if already saved
  if (fs.existsSync(safesPath)) {
    try {
      const saved = JSON.parse(fs.readFileSync(safesPath, "utf-8")) as RoleSafes;
      if (saved.ownerSafe && saved.arbiterSafe && saved.feeSafe) {
        const [c1, c2, c3] = await Promise.all([
          provider.getCode(saved.ownerSafe),
          provider.getCode(saved.arbiterSafe),
          provider.getCode(saved.feeSafe),
        ]);
        if (c1 !== "0x" && c2 !== "0x" && c3 !== "0x") {
          return saved;
        }
      }
    } catch {
      // Continue to create
    }
  }

  const deployerBalance = await provider.getBalance(deployer.address);
  const factory = new ethers.Contract(SAFE_FACTORY_ADDRESS, SAFE_FACTORY_ABI, provider);
  const proxyCreationCode = await factory.proxyCreationCode();

  // Predict addresses
  const predictedOwnerSafe = predictSafeAddress(
    SAFE_FACTORY_ADDRESS,
    SAFE_SINGLETON_V141,
    proxyCreationCode,
    encodeSafeSetup(ownerSafeOwners, 2),
    8453201
  );
  const predictedArbiterSafe = predictSafeAddress(
    SAFE_FACTORY_ADDRESS,
    SAFE_SINGLETON_V141,
    proxyCreationCode,
    encodeSafeSetup(arbiterSafeOwners, 2),
    8453202
  );
  const predictedFeeSafe = predictSafeAddress(
    SAFE_FACTORY_ADDRESS,
    SAFE_SINGLETON_V141,
    proxyCreationCode,
    encodeSafeSetup(feeSafeOwners, 2),
    8453203
  );

  const codes = await Promise.all([
    provider.getCode(predictedOwnerSafe),
    provider.getCode(predictedArbiterSafe),
    provider.getCode(predictedFeeSafe),
  ]);

  if (codes[0] !== "0x" && codes[1] !== "0x" && codes[2] !== "0x") {
    const result: RoleSafes = {
      ownerSafe: predictedOwnerSafe,
      arbiterSafe: predictedArbiterSafe,
      feeSafe: predictedFeeSafe,
    };
    fs.writeFileSync(safesPath, JSON.stringify(result, null, 2), "utf-8");
    return result;
  }

  if (deployerBalance.lt(ethers.utils.parseEther("0.001"))) {
    console.warn(`Deployer ${deployer.address} has insufficient balance (${ethers.utils.formatEther(deployerBalance)} ETH) to deploy Safes.`);
    const result: RoleSafes = {
      ownerSafe: predictedOwnerSafe,
      arbiterSafe: predictedArbiterSafe,
      feeSafe: predictedFeeSafe,
    };
    fs.writeFileSync(safesPath, JSON.stringify(result, null, 2), "utf-8");
    return result;
  }

  const deployerWallet = new ethers.Wallet(deployer.privateKey, provider);
  const factoryWithSigner = factory.connect(deployerWallet);

  const ownerSafe = await createOrGetSafe("ownerSafe", ownerSafeOwners, 8453201, deployerWallet, factoryWithSigner, proxyCreationCode);
  const arbiterSafe = await createOrGetSafe("arbiterSafe", arbiterSafeOwners, 8453202, deployerWallet, factoryWithSigner, proxyCreationCode);
  const feeSafe = await createOrGetSafe("feeSafe", feeSafeOwners, 8453203, deployerWallet, factoryWithSigner, proxyCreationCode);

  const result: RoleSafes = { ownerSafe, arbiterSafe, feeSafe };
  fs.writeFileSync(safesPath, JSON.stringify(result, null, 2), "utf-8");
  return result;
}

if ((import.meta as unknown as { main?: boolean }).main) {
  const defaultBaseRpc = "https://sepolia.base.org";
  const rpcUrl =
    process.env.RPC_URL &&
    !process.env.RPC_URL.includes("127.0.0.1") &&
    !process.env.RPC_URL.includes("localhost")
      ? process.env.RPC_URL
      : defaultBaseRpc;
  const provider = new ethers.providers.StaticJsonRpcProvider(rpcUrl, {
    chainId: BASE_SEPOLIA_CHAIN_ID,
    name: "base-sepolia",
  });
  setupAllSafes(provider).then((safes) => {
    console.log("=== Role Safes ===");
    console.log(`Owner Safe:   ${safes.ownerSafe}`);
    console.log(`Arbiter Safe: ${safes.arbiterSafe}`);
    console.log(`Fee Safe:     ${safes.feeSafe}`);
  }).catch((err) => {
    console.error("Create safes error:", err);
    process.exit(1);
  });
}
