import * as fs from "node:fs";
import { ethers, type BigNumber, type Contract, type providers } from "./lib/ethers";
import { appendLedger } from "./lib/ledger";
import { KEYS_PATH, ROLE_DEFINITIONS, type WalletStore } from "./wallets";

export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const CANONICAL_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const FORBIDDEN_PUBLIC_DEPLOYER = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf".toLowerCase();

export const TARGET_ETH: Record<string, string> = {
  deployer: "0.003",
  admin: "0.001",
  ownerSafe: "0.0003",
  arbiterSafe: "0.0003",
  feeSafe: "0.0003",
  client: "0.0005",
  developer: "0.0005",
  both: "0.0005",
  spammer: "0.0005",
};

export function assertNotForbidden(address: string): void {
  if (address.toLowerCase() === FORBIDDEN_PUBLIC_DEPLOYER) {
    throw new Error(`CRITICAL: Cannot use forbidden public deployer key ${address}`);
  }
}

export async function assertBaseSepolia(provider: {
  getNetwork(): Promise<{ chainId: number }>;
}): Promise<void> {
  const net = await provider.getNetwork();
  if (net.chainId !== BASE_SEPOLIA_CHAIN_ID) {
    throw new Error(`Chain mismatch: expected ${BASE_SEPOLIA_CHAIN_ID}, got ${net.chainId}`);
  }
}

export function getTargetEthForRole(persona: string): BigNumber {
  const targetStr = TARGET_ETH[persona] ?? "0.0005";
  return ethers.utils.parseEther(targetStr);
}

export interface FundSummary {
  treasuryAddress: string;
  treasuryEthBalance: string;
  treasuryUsdcBalance: string;
  totalEthNeeded: string;
  totalUsdcNeeded: string;
  distributionsPlanned: Array<{ role: string; address: string; amountEth: string }>;
  isFunded: boolean;
}

export async function inspectTreasury(
  provider: providers.JsonRpcProvider,
  keysPath: string = KEYS_PATH
): Promise<FundSummary> {
  await assertBaseSepolia(provider);

  if (!fs.existsSync(keysPath)) {
    throw new Error(`Keys store not found at ${keysPath}. Run wallets.ts first.`);
  }

  const keys = JSON.parse(fs.readFileSync(keysPath, "utf-8")) as WalletStore;
  const treasury = keys["treasury"];
  if (!treasury) throw new Error("Treasury wallet not defined in keys.json");

  assertNotForbidden(treasury.address);

  const treasuryEth = await provider.getBalance(treasury.address);
  const usdcAbi = ["function balanceOf(address) view returns (uint256)"];
  const usdcContract = new ethers.Contract(CANONICAL_USDC, usdcAbi, provider);
  const treasuryUsdc: BigNumber = await usdcContract.balanceOf(treasury.address).catch(() => ethers.BigNumber.from(0));

  let totalEthNeeded = ethers.BigNumber.from(0);
  const planned: Array<{ role: string; address: string; amountEth: string }> = [];

  const targets = ROLE_DEFINITIONS.filter((d) => d.role !== "treasury").map((def) => {
    const entry = keys[def.role];
    if (!entry) return null;
    assertNotForbidden(entry.address);
    return { def, entry };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  // Batch query in chunks of 8
  const chunkSize = 8;
  for (let i = 0; i < targets.length; i += chunkSize) {
    const chunk = targets.slice(i, i + chunkSize);
    const balances = await Promise.all(chunk.map((item) => provider.getBalance(item.entry.address)));
    for (let j = 0; j < chunk.length; j++) {
      const item = chunk[j]!;
      const bal = balances[j]!;
      const target = getTargetEthForRole(item.def.persona);
      if (bal.lt(target)) {
        const diff = target.sub(bal);
        totalEthNeeded = totalEthNeeded.add(diff);
        planned.push({
          role: item.def.role,
          address: item.entry.address,
          amountEth: ethers.utils.formatEther(diff),
        });
      }
    }
  }

  // 35 bounties averaging ~1 USDC = ~35 USDC needed
  const totalUsdcNeeded = "35.0";

  return {
    treasuryAddress: treasury.address,
    treasuryEthBalance: ethers.utils.formatEther(treasuryEth),
    treasuryUsdcBalance: ethers.utils.formatUnits(treasuryUsdc, 6),
    totalEthNeeded: ethers.utils.formatEther(totalEthNeeded),
    totalUsdcNeeded,
    distributionsPlanned: planned,
    isFunded: treasuryEth.gte(totalEthNeeded) && totalEthNeeded.gt(0),
  };
}

export async function distributeEthFromTreasury(
  provider: providers.JsonRpcProvider,
  keysPath: string = KEYS_PATH
): Promise<{ distributedCount: number; totalDistributedEth: string }> {
  await assertBaseSepolia(provider);

  const keys = JSON.parse(fs.readFileSync(keysPath, "utf-8")) as WalletStore;
  const treasuryEntry = keys["treasury"];
  if (!treasuryEntry) throw new Error("Treasury wallet not found");

  assertNotForbidden(treasuryEntry.address);
  const treasuryWallet = new ethers.Wallet(treasuryEntry.privateKey, provider);

  const summary = await inspectTreasury(provider, keysPath);
  if (!summary.isFunded) {
    console.warn(`Treasury has insufficient ETH: balance=${summary.treasuryEthBalance}, needed=${summary.totalEthNeeded}`);
    return { distributedCount: 0, totalDistributedEth: "0.0" };
  }

  let distributed = 0;
  let totalDistributed = ethers.BigNumber.from(0);

  for (const plan of summary.distributionsPlanned) {
    const amount = ethers.utils.parseEther(plan.amountEth);
    const tx = await treasuryWallet.sendTransaction({
      to: plan.address,
      value: amount,
    });
    console.log(`Sent ${plan.amountEth} ETH to ${plan.role} (${plan.address}), tx: ${tx.hash}`);
    await tx.wait(1);

    appendLedger({
      ts: new Date().toISOString(),
      from: treasuryEntry.address,
      to: plan.address,
      asset: "ETH",
      amount: plan.amountEth,
      txHash: tx.hash,
      purpose: `Top up gas for ${plan.role}`,
    });

    distributed += 1;
    totalDistributed = totalDistributed.add(amount);
  }

  return {
    distributedCount: distributed,
    totalDistributedEth: ethers.utils.formatEther(totalDistributed),
  };
}

export const LOCAL_MOCK_USDC = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

export async function fundLocalWallets(
  provider: providers.JsonRpcProvider,
  keysPath: string = KEYS_PATH
): Promise<{ fundedCount: number; mintedUsdcCount: number }> {
  if (!fs.existsSync(keysPath)) {
    throw new Error(`Keys store not found at ${keysPath}. Run wallets.ts first.`);
  }

  const keys = JSON.parse(fs.readFileSync(keysPath, "utf-8")) as WalletStore;
  const token = new ethers.Contract(
    LOCAL_MOCK_USDC,
    ["function mint(address to, uint256 amount) external"],
    provider.getSigner(0)
  );

  let funded = 0;
  let minted = 0;
  const ethHex = "0x56bc75e2d63100000"; // 100 ETH
  const mintAmount = ethers.utils.parseUnits("50000", 6);

  for (const entry of Object.values(keys)) {
    await provider.send("hardhat_setBalance", [entry.address, ethHex]);
    funded++;
    if (entry.persona === "client" || entry.persona === "both" || entry.role === "admin") {
      const tx = await token.mint(entry.address, mintAmount);
      await tx.wait();
      minted++;
    }
  }

  console.log(`Local funding complete: ${funded} wallets funded with 100 ETH, ${minted} wallets minted 50,000 mUSDC`);
  return { fundedCount: funded, mintedUsdcCount: minted };
}

if ((import.meta as unknown as { main?: boolean }).main) {
  const isLocal = process.env.CHAIN_ID === "31337";
  if (isLocal) {
    const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    fundLocalWallets(provider)
      .then(() => process.exit(0))
      .catch((err) => {
        console.error("Local fund error:", err);
        process.exit(1);
      });
  } else {
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
    inspectTreasury(provider).then((res) => {
      console.log("=== Demo Treasury Status ===");
      console.log(`Treasury Address:     ${res.treasuryAddress}`);
      console.log(`Current ETH Balance:  ${res.treasuryEthBalance} ETH`);
      console.log(`Current USDC Balance: ${res.treasuryUsdcBalance} USDC`);
      console.log(`Total ETH Needed:     ${res.totalEthNeeded} ETH`);
      console.log(`Total USDC Needed:    ${res.totalUsdcNeeded} USDC`);
      console.log(`Planned Recipients:   ${res.distributionsPlanned.length} wallets`);
      if (!res.isFunded && ethers.utils.parseEther(res.totalEthNeeded).gt(0)) {
        console.log(`\nCẦN NGƯỜI DÙNG: nạp ${res.totalEthNeeded} ETH và ${res.totalUsdcNeeded} USDC vào ${res.treasuryAddress} trên Base Sepolia`);
      }
    }).catch((err) => {
      console.error("Fund check error:", err);
      process.exit(1);
    });
  }
}
