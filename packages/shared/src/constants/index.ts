// packages/shared/src/constants/index.ts
// Shared constants across the monorepo

// =============================================================================
// PLATFORM
// =============================================================================

export const PLATFORM_NAME = "Bloody-Roar";
export const PLATFORM_FEE_BPS = 250; // 2.5% trên phần Developer, khớp contract
/** @deprecated Dùng PLATFORM_FEE_BPS. Số float không dùng để tính tiền. */
export const PLATFORM_FEE_PERCENT = PLATFORM_FEE_BPS / 100;

// =============================================================================
// ESCROW
// =============================================================================

export const ESCROW_REVIEW_DAYS = 7;
export const DISPUTE_EVIDENCE_RESPONSE_HOURS = 72;
export const DISPUTE_CHALLENGE_DAYS = 7;
export const DISPUTE_FINAL_NOTICE_HOURS = 24;
export const ARBITER_STALL_DAYS = 30;
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
