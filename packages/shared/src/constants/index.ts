// packages/shared/src/constants/index.ts
// Shared constants across the monorepo

// =============================================================================
// PLATFORM
// =============================================================================

export const PLATFORM_NAME = "Bloody-Roar";
export const PLATFORM_FEE_PERCENT = 2.5; // 2.5% platform fee

// =============================================================================
// ESCROW
// =============================================================================

export const ESCROW_TIMEOUT_DAYS = 30; // Days before dev can auto-claim
export const DISPUTE_CHALLENGE_HOURS = 24; // Hours to challenge a resolution
export const SUPPORTED_CHAIN_IDS = {
  BASE_SEPOLIA: 84532,
  LOCALHOST: 31337,
  // mainnet (1/8453) sẽ thêm khi lên production
} as const;

export const ACTIVE_CHAIN_ID = 84532;

// =============================================================================
// ISSUE / BOUNTY
// =============================================================================

export const ISSUE_CATEGORIES = [
  "BUG_FIX",
  "FEATURE",
  "SMART_CONTRACT",
  "AUDIT",
  "UI_UX",
  "DATA_SCIENCE",
  "DEVOPS",
  "DOCUMENTATION",
  "OTHER",
] as const;

export const ISSUE_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "DISPUTED",
] as const;

export const ISSUE_SORT_BY = [
  "CREATED_AT",
  "BOUNTY_AMOUNT",
  "VIEW_COUNT",
  "DEADLINE",
] as const;

export const ISSUE_DIFFICULTY = ["Easy", "Medium", "Hard", "Expert"] as const;

export const BOUNTY_MIN_AMOUNT = 10; // Minimum 10 USDT
export const BOUNTY_MAX_AMOUNT = 100_000; // Maximum 100,000 USDT

// =============================================================================
// PAGINATION
// =============================================================================

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// =============================================================================
// FILE UPLOAD
// =============================================================================

export const MAX_FILE_SIZE_MB = 50;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const ALLOWED_FILE_TYPES = [
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  // Documents
  "application/pdf",
  "text/plain",
  "text/markdown",
  // Archives
  "application/zip",
  "application/x-tar",
  "application/gzip",
  // Code
  "text/javascript",
  "text/typescript",
  "application/json",
  "text/html",
  "text/css",
] as const;

// =============================================================================
// AI GUARD
// =============================================================================

export const AI_GUARD_PATTERNS = {
  // Private keys / seeds
  ETH_PRIVATE_KEY: /0x[0-9a-fA-F]{64}/g,
  MNEMONIC_PHRASE: /(\b\w+\b\s+){11,23}\b\w+\b/g, // 12-24 word seed phrases

  // API keys (generic)
  GENERIC_API_KEY: /[A-Za-z0-9_\-]{32,}(?=\s|$|["'])/g,

  // OpenAI
  OPENAI_API_KEY: /sk-[A-Za-z0-9]{32,}/g,

  // Groq
  GROQ_API_KEY: /gsk_[A-Za-z0-9]{32,}/g,

  // AWS
  AWS_ACCESS_KEY: /AKIA[0-9A-Z]{16}/g,
  AWS_SECRET_KEY: /[0-9a-zA-Z/+]{40}/g,

  // GitHub
  GITHUB_TOKEN: /gh[pousr]_[A-Za-z0-9]{36}/g,

  // PII
  EMAIL: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
  PHONE_VN: /(\+84|0)[0-9]{9,10}/g,
  CCCD_VN: /[0-9]{9}([0-9]{3})?/g, // 9 or 12 digit
} as const;

export const AI_GUARD_MASK = "[REDACTED]";

// =============================================================================
// SKILLS / TECH TAGS
// =============================================================================

export const TECH_SKILLS = [
  // Frontend
  "React", "Next.js", "Vue.js", "Angular", "Svelte",
  "TypeScript", "JavaScript", "HTML/CSS", "Tailwind CSS",
  "Framer Motion", "Three.js", "WebGL",

  // Backend
  "Node.js", "Python", "Go", "Rust", "Java", "C#",
  "GraphQL", "REST API", "tRPC", "gRPC",
  "PostgreSQL", "MySQL", "MongoDB", "Redis",
  "Prisma", "TypeORM", "SQLAlchemy",

  // Web3 / Blockchain
  "Solidity", "Vyper", "Hardhat", "Foundry", "Truffle",
  "Ethers.js", "Viem", "Web3.js", "Thirdweb SDK",
  "OpenZeppelin", "EIP-712", "ERC-20", "ERC-721",
  "IPFS", "Chainlink", "The Graph",

  // DevOps
  "Docker", "Kubernetes", "AWS", "GCP", "Azure",
  "GitHub Actions", "CI/CD", "Terraform", "Nginx",

  // AI / Data
  "Python ML", "TensorFlow", "PyTorch", "LangChain",
  "OpenAI API", "Vercel AI SDK",

  // Mobile
  "React Native", "Flutter", "Swift", "Kotlin",

  // Testing
  "Vitest", "Jest", "Playwright", "Cypress", "Hardhat Testing",
] as const;
