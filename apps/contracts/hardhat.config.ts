import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";

// Load env vars from monorepo root .env
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
dotenvConfig({ path: resolve(__dirname, "../../.env") });

const DEPLOYER_PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Hardhat default

const ALCHEMY_RPC_TESTNET = process.env.ALCHEMY_RPC_URL_TESTNET || "";
const ALCHEMY_RPC_MAINNET = process.env.ALCHEMY_RPC_URL_MAINNET || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true, // Enable via-IR for better optimization
    },
  },

  networks: {
    // Local development node
    localhost: {
      url: "http://127.0.0.1:8545",
    },

    // Arbitrum Sepolia Testnet
    arbitrumSepolia: {
      url: ALCHEMY_RPC_TESTNET || "https://sepolia-rollup.arbitrum.io/rpc",
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId: 421614,
    },

    // Base Sepolia Testnet
    baseSepolia: {
      url: ALCHEMY_RPC_TESTNET || "https://sepolia.base.org",
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId: 84532,
    },

    // Arbitrum One Mainnet
    arbitrumOne: {
      url: ALCHEMY_RPC_MAINNET || "https://arb1.arbitrum.io/rpc",
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId: 42161,
    },

    // Base Mainnet
    base: {
      url: ALCHEMY_RPC_MAINNET || "https://mainnet.base.org",
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId: 8453,
    },
  },

  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    outputFile: "gas-report.txt",
    noColors: true,
  },

  etherscan: {
    apiKey: {
      arbitrumOne: ETHERSCAN_API_KEY,
      arbitrumSepolia: ETHERSCAN_API_KEY,
      base: ETHERSCAN_API_KEY,
      baseSepolia: ETHERSCAN_API_KEY,
    },
    customChains: [
      {
        network: "arbitrumSepolia",
        chainId: 421614,
        urls: {
          apiURL: "https://api-sepolia.arbiscan.io/api",
          browserURL: "https://sepolia.arbiscan.io",
        },
      },
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
    ],
  },

  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },

  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
};

export default config;
