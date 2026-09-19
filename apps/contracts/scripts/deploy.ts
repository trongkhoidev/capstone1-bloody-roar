import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ethers, network } from "hardhat";
import {
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
  assertBaseSepoliaUsdc,
  assertProductionSafes,
} from "./deployment-checks";

const LOCAL_CHAIN_IDS = new Set([31337n, 1337n]);

function requiredExternalAddress(name: string): string {
  const value = process.env[name];
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`${name} must be a valid address for non-local deployments`);
  }
  return value;
}

async function main() {
  const { chainId } = await ethers.provider.getNetwork();
  const isLocal = LOCAL_CHAIN_IDS.has(chainId);
  const isBaseSepolia = chainId === BASE_SEPOLIA_CHAIN_ID;

  if (!isLocal && !isBaseSepolia) {
    throw new Error(
      `Refusing deployment on chain ${chainId}. Base Sepolia is the only supported MVP network.`,
    );
  }

  // A network flag alone is not authorization to put funds-control code on Base.
  if (isBaseSepolia && process.env.ALLOW_BASE_SEPOLIA_DEPLOYMENT !== "true") {
    throw new Error(
      "Refusing Base Sepolia deployment. Set ALLOW_BASE_SEPOLIA_DEPLOYMENT=true only after separate authorization.",
    );
  }

  const [deployer, localOwner, localArbiter, localFeeRecipient] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployment signer is configured");

  let tokenAddress = process.env.USDC_ADDRESS;
  let ownerSafe = process.env.OWNER_SAFE;
  let arbiterSafe = process.env.ARBITER_SAFE;
  let feeRecipient = process.env.FEE_RECIPIENT;

  if (isLocal) {
    // Local runs remain reproducible without any secrets. External networks do
    // not get this fallback and therefore cannot silently use a deployer EOA.
    if (!tokenAddress) {
      const TokenFactory = await ethers.getContractFactory("MockUSDC");
      const token = await TokenFactory.deploy();
      await token.waitForDeployment();
      tokenAddress = await token.getAddress();
      console.log(`Local MockUSDC deployed to ${tokenAddress}`);
    }
    if (!localOwner || !localArbiter || !localFeeRecipient) {
      throw new Error("Local deployment needs four distinct Hardhat signers");
    }
    ownerSafe ||= localOwner.address;
    arbiterSafe ||= localArbiter.address;
    feeRecipient ||= localFeeRecipient.address;
  } else {
    tokenAddress ||= BASE_SEPOLIA_USDC;
    if (!ethers.isAddress(tokenAddress)) throw new Error("USDC_ADDRESS must be a valid address");
    ownerSafe = requiredExternalAddress("OWNER_SAFE");
    arbiterSafe = requiredExternalAddress("ARBITER_SAFE");
    feeRecipient = requiredExternalAddress("FEE_RECIPIENT");
    await assertBaseSepoliaUsdc(ethers.provider, tokenAddress);
    await assertProductionSafes(ethers.provider, [ownerSafe, arbiterSafe, feeRecipient]);
  }

  if (!tokenAddress || !ownerSafe || !arbiterSafe || !feeRecipient) {
    throw new Error("Token and all three role addresses are required");
  }

  console.log("Deploying BloodyRoarEscrow");
  console.log(`  network:       ${network.name} (${chainId})`);
  console.log(`  deployer:      ${deployer.address}`);
  console.log(`  token:         ${tokenAddress}`);
  console.log(`  owner Safe:    ${ownerSafe}`);
  console.log(`  arbiter Safe:  ${arbiterSafe}`);
  console.log(`  fee recipient: ${feeRecipient}`);

  const EscrowFactory = await ethers.getContractFactory("BloodyRoarEscrow");
  const escrow = await EscrowFactory.deploy(tokenAddress, ownerSafe, arbiterSafe, feeRecipient);
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();

  const [deployedCode, readToken, readOwner, readArbiter, readFeeRecipient] = await Promise.all([
    ethers.provider.getCode(escrowAddress),
    escrow.getFunction("token")(),
    escrow.getFunction("owner")(),
    escrow.getFunction("arbiter")(),
    escrow.getFunction("feeRecipient")(),
  ]);
  if (deployedCode === "0x") throw new Error("Deployment readback found no bytecode");
  const expectedReadback = [tokenAddress, ownerSafe, arbiterSafe, feeRecipient].map(ethers.getAddress);
  const actualReadback = [readToken, readOwner, readArbiter, readFeeRecipient].map(ethers.getAddress);
  if (actualReadback.some((value, index) => value !== expectedReadback[index])) {
    throw new Error(`Deployment readback mismatch: ${actualReadback.join(", ")}`);
  }

  const manifest = {
    network: network.name,
    chainId: chainId.toString(),
    contract: "BloodyRoarEscrow",
    address: escrowAddress,
    token: tokenAddress,
    ownerSafe,
    arbiterSafe,
    feeRecipient,
    deploymentTransaction: escrow.deploymentTransaction()?.hash ?? null,
    deployedAt: new Date().toISOString(),
    verification: {
      constructorArgs: [tokenAddress, ownerSafe, arbiterSafe, feeRecipient],
      command: `npx hardhat verify --network ${network.name} ${escrowAddress} ${tokenAddress} ${ownerSafe} ${arbiterSafe} ${feeRecipient}`,
    },
    readback: {
      bytecodeBytes: (deployedCode.length - 2) / 2,
      token: readToken,
      owner: readOwner,
      arbiter: readArbiter,
      feeRecipient: readFeeRecipient,
    },
  };

  const outputDir = join(process.cwd(), "deployments");
  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, `${network.name}.json`);
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`Escrow deployed to ${escrowAddress}`);
  console.log(`Manifest written to ${outputPath}`);
  console.log(`Verify with: ${manifest.verification.command}`);
  console.log("Role handover remains Safe-controlled; this script does not transfer participant authority.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
