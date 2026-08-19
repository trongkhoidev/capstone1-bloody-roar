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
const INFURA_RPC_TESTNET = process.env.INFURA_RPC_URL_TESTNET || "";

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

    // Ethereum Sepolia Testnet (L1)
    sepolia: {
      url:
        ALCHEMY_RPC_TESTNET ||
        INFURA_RPC_TESTNET ||
        "https://rpc.sepolia.org",
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId: 11155111,
    },

    // Ethereum Mainnet (L1)
    mainnet: {
      url:
        ALCHEMY_RPC_MAINNET ||
        "https://eth.llamarpc.com",
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId: 1,
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
      mainnet: ETHERSCAN_API_KEY,
      sepolia: ETHERSCAN_API_KEY,
    },
    // No customChains needed — mainnet + sepolia are natively supported by hardhat-verify
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
