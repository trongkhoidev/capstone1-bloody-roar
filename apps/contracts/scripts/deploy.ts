// apps/contracts/scripts/deploy.ts
// Deploy BloodyRoarEscrow to the configured network

import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying BloodyRoarEscrow...");
  console.log("Deployer:", deployer.address);
  console.log("Network:", (await ethers.provider.getNetwork()).name);

  // Use deployer as arbiter and fee recipient for initial deployment
  // In production: use a multisig
  const arbiter = deployer.address;
  const feeRecipient = deployer.address;

  const EscrowFactory = await ethers.getContractFactory("BloodyRoarEscrow");
  const escrow = await EscrowFactory.deploy(arbiter, feeRecipient);

  await escrow.waitForDeployment();

  const address = await escrow.getAddress();
  console.log(`✅ BloodyRoarEscrow deployed to: ${address}`);
  console.log(`   Arbiter:       ${arbiter}`);
  console.log(`   Fee Recipient: ${feeRecipient}`);

  // Verify on Etherscan (run separately after deployment)
  console.log("\nTo verify on Etherscan:");
  console.log(`npx hardhat verify --network ${process.env.HARDHAT_NETWORK || "localhost"} ${address} "${arbiter}" "${feeRecipient}"`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
