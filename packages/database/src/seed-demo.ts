import { ensureWorkConversation } from "./conversations";
// packages/database/src/seed-demo.ts
// Extensive realistic demo seed script for Bloody-Roar Bounty Marketplace
// Usage: bun run src/seed-demo.ts

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import {
  prisma,
  PrismaClient,
  UserRole,
  IssueCategory,
  IssueStatus,
  ApplicationStatus,
  EscrowResolutionKind,
  NotificationType,
  SubmissionStatus,
  PRState,
  recalcReputation,
} from "./index";

export interface SeedDemoSummary {
  users: number;
  issues: number;
  applications: number;
  submissions: number;
  reviews: number;
  comments: number;
  messages: number;
  notifications: number;
  addedComments: number;
  addedApplications: number;
  addedAttachments: number;
}

export const HARDHAT_DEMO_WALLETS = {
  admin: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
  client1: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
  client2: "0x14dc79964da2c08b23698b3d3cc7ca32193d9955",
  client3: "0xa0ee7a142d267c1f36714e4a8f75612f20a79720",
  developer1: "0x90f79bf6eb2c4f870365e785982e1f101e93b906",
  developer2: "0x15d34aaf54267db7d7c367839aaf71a00a2c6a65",
  developer3: "0x23618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f",
  developer4: "0x8888888888888888888888888888888888888888",
} as const;

export const DEFAULT_DEMO_WALLETS = {
  admin: "0x000000000000000000000000000000000000dead",
  client1: "0x1111111111111111111111111111111111111111",
  client2: "0x3333333333333333333333333333333333333333",
  client3: "0x5555555555555555555555555555555555555555",
  developer1: "0x2222222222222222222222222222222222222222",
  developer2: "0x4444444444444444444444444444444444444444",
  developer3: "0x6666666666666666666666666666666666666666",
  developer4: "0x8888888888888888888888888888888888888888",
} as const;

export function guardDatabaseUrl(url: string | undefined): string {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Cannot run seedDemo in production");
  }
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid DATABASE_URL");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("DATABASE_URL must be postgresql");
  }
  return decodeURIComponent(parsed.pathname.slice(1)) || "postgres";
}

function getUploadsDir(): string {
  const cwd = process.cwd();
  if (path.basename(cwd) === "database" && path.basename(path.dirname(cwd)) === "packages") {
    return path.resolve(cwd, "../../apps/web/.uploads");
  }
  return path.resolve(cwd, "apps/web/.uploads");
}

function createDiagramPng(width: number, height: number, theme: "terminal" | "architecture" | "diff" | "topology"): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(2, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  function chunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    const toCrc = Buffer.concat([t, data]);
    let c = 0xffffffff;
    for (let i = 0; i < toCrc.length; i++) {
      c ^= toCrc[i]!;
      for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
    crc.writeUInt32BE((c ^ 0xffffffff) >>> 0, 0);
    return Buffer.concat([len, t, data, crc]);
  }

  const rowLen = 1 + width * 3;
  const raw = Buffer.alloc(height * rowLen);

  for (let y = 0; y < height; y++) {
    const rowStart = y * rowLen;
    raw[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * 3;
      const isBorder = (x < 2 || x >= width - 2 || y < 2 || y >= height - 2);
      const isHeader = (y >= 2 && y <= 24);
      if (isBorder) {
        raw[px] = 63; raw[px + 1] = 63; raw[px + 2] = 70;
      } else if (isHeader) {
        raw[px] = 39; raw[px + 1] = 39; raw[px + 2] = 42;
      } else {
        if (theme === "terminal") {
          if (y >= 35 && y <= 45 && x >= 20 && x <= 220) {
            raw[px] = 220; raw[px + 1] = 38; raw[px + 2] = 38;
          } else if ((y >= 60 && y <= 66 && x >= 30 && x <= 320) ||
                     (y >= 80 && y <= 86 && x >= 30 && x <= 280) ||
                     (y >= 100 && y <= 106 && x >= 50 && x <= 240) ||
                     (y >= 120 && y <= 126 && x >= 30 && x <= 300)) {
            raw[px] = 161; raw[px + 1] = 161; raw[px + 2] = 170;
          } else {
            raw[px] = 15; raw[px + 1] = 15; raw[px + 2] = 18;
          }
        } else if (theme === "architecture") {
          const box1 = (x >= 20 && x <= 120 && y >= 50 && y <= 110);
          const box2 = (x >= 160 && x <= 260 && y >= 50 && y <= 110);
          const box3 = (x >= 300 && x <= 400 && y >= 50 && y <= 110);
          const arrow1 = (x >= 120 && x <= 160 && y >= 78 && y <= 82);
          const arrow2 = (x >= 260 && x <= 300 && y >= 78 && y <= 82);
          if (box1) { raw[px] = 37; raw[px + 1] = 99; raw[px + 2] = 235; }
          else if (box2) { raw[px] = 13; raw[px + 1] = 148; raw[px + 2] = 136; }
          else if (box3) { raw[px] = 124; raw[px + 1] = 58; raw[px + 2] = 237; }
          else if (arrow1 || arrow2) { raw[px] = 244; raw[px + 1] = 244; raw[px + 2] = 245; }
          else { raw[px] = 24; raw[px + 1] = 24; raw[px + 2] = 27; }
        } else if (theme === "diff") {
          if (y >= 40 && y <= 55 && x >= 20 && x <= 380) {
            raw[px] = 127; raw[px + 1] = 29; raw[px + 2] = 29;
          } else if (y >= 65 && y <= 80 && x >= 20 && x <= 380) {
            raw[px] = 20; raw[px + 1] = 83; raw[px + 2] = 45;
          } else if ((y >= 95 && y <= 101 && x >= 20 && x <= 300) ||
                     (y >= 110 && y <= 116 && x >= 20 && x <= 260)) {
            raw[px] = 113; raw[px + 1] = 113; raw[px + 2] = 122;
          } else {
            raw[px] = 18; raw[px + 1] = 18; raw[px + 2] = 20;
          }
        } else {
          const b1 = (x >= 30 && x <= 110 && y >= 40 && y <= 80);
          const b2 = (x >= 140 && x <= 220 && y >= 40 && y <= 80);
          const b3 = (x >= 250 && x <= 330 && y >= 40 && y <= 80);
          const b4 = (x >= 80 && x <= 280 && y >= 110 && y <= 150);
          if (b1 || b2 || b3) { raw[px] = 59; raw[px + 1] = 130; raw[px + 2] = 246; }
          else if (b4) { raw[px] = 16; raw[px + 1] = 185; raw[px + 2] = 129; }
          else { raw[px] = 20; raw[px + 1] = 20; raw[px + 2] = 24; }
        }
      }
    }
  }

  const idat = chunk("IDAT", zlib.deflateSync(raw));
  return Buffer.concat([signature, chunk("IHDR", ihdr), idat, chunk("IEND", Buffer.alloc(0))]);
}

export async function seedDemo(db: PrismaClient): Promise<SeedDemoSummary> {
  const chainId = Number(process.env.CHAIN_ID ?? "31337");
  const usdc =
    (await db.token.findFirst({
      where: {
        chainId,
        symbol: { in: ["USDC", "mUSDC"] },
        isActive: true,
      },
    })) ??
    (await db.token.findFirst({
      where: {
        symbol: { in: ["USDC", "mUSDC"] },
        isActive: true,
      },
    })) ??
    (await db.token.findFirst({
      where: {
        isActive: true,
      },
    }));
  if (!usdc) {
    throw new Error(`Chưa có token active cho chain ${chainId}. Chạy deploy local và db:seed trước.`);
  }

  const existingOpenIssues = await db.issue.findMany({
    where: { status: IssueStatus.OPEN, hiddenAt: null, isDraft: false },
    select: {
      id: true,
      title: true,
      category: true,
      bountyAmount: true,
      _count: { select: { comments: true, applications: true } },
      client: { select: { id: true, name: true } },
    },
    orderBy: { bountyAmount: "desc" },
  });

  const existingUsers = await db.user.findMany({
    select: { id: true, name: true, role: true, walletAddress: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  console.log(`\n========================================================`);
  console.log(`🔍 [READ-ONLY INSPECTION] Pre-Seed Database Summary:`);
  console.log(
    `   Total Users: ${existingUsers.length} (Admins: ${existingUsers.filter((u) => u.role === UserRole.ADMIN).length}, Clients: ${existingUsers.filter((u) => u.role === UserRole.CLIENT).length}, Developers: ${existingUsers.filter((u) => u.role === UserRole.DEVELOPER).length})`,
  );
  console.log(`   Total Open Non-Draft Non-Hidden Issues: ${existingOpenIssues.length}`);
  console.log(`========================================================\n`);

  let baselineApplications = 0;
  let baselineSubmissions = 0;
  let baselineReviews = 0;
  let baselineComments = 0;
  let baselineMessages = 0;
  let baselineNotifications = 0;

  if (existingOpenIssues.length === 0) {
    // -------------------------------------------------------------------------
    // 1. Users (Admin, 3 Clients, 4 Developers)
    // -------------------------------------------------------------------------
    const wallets = chainId === 31337 ? HARDHAT_DEMO_WALLETS : DEFAULT_DEMO_WALLETS;

  if (chainId === 31337) {
    const oldAddresses = Object.values(DEFAULT_DEMO_WALLETS);
    const newAddresses = Object.values(HARDHAT_DEMO_WALLETS);
    for (let i = 0; i < oldAddresses.length; i++) {
      const oldAddr = oldAddresses[i]!;
      const newAddr = newAddresses[i]!;
      if (oldAddr !== newAddr) {
        const userWithNew = await db.user.findUnique({ where: { walletAddress: newAddr } });
        if (userWithNew) {
          await db.user.updateMany({
            where: { walletAddress: oldAddr },
            data: { email: null },
          });
        } else {
          await db.user.updateMany({
            where: { walletAddress: oldAddr },
            data: { walletAddress: newAddr },
          });
        }
      }
    }
  }

  const admin = await db.user.upsert({
    where: { walletAddress: wallets.admin },
    update: {},
    create: {
      walletAddress: wallets.admin,
      role: UserRole.ADMIN,
      name: "Bloody-Roar Arbiter",
      email: "arbiter@bloody-roar.dev",
      bio: "Chief Protocol Arbiter & Governance Committee. Handling escalated escrow disputes with cryptographic proof validation.",
      skills: ["Arbitration", "Protocol Governance", "EVM Forensics", "Formal Verification"],
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    },
  });

  const clientAlice = await db.user.upsert({
    where: { walletAddress: wallets.client1 },
    update: {},
    create: {
      walletAddress: wallets.client1,
      role: UserRole.CLIENT,
      name: "Alice Chen",
      email: "alice@nexus-protocol.io",
      bio: "Co-Founder & Head of Engineering at Nexus Protocol. Building next-gen decentralized liquid staking primitives.",
      skills: ["DeFi", "Product Architecture", "Tokenomics", "Smart Contract Security"],
      avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80",
      githubUsername: "alice-nexus",
      isGithubVerified: true,
      completedTaskCount: 8,
    },
  });

  const clientMarcus = await db.user.upsert({
    where: { walletAddress: wallets.client2 },
    update: {},
    create: {
      walletAddress: wallets.client2,
      role: UserRole.CLIENT,
      name: "Marcus Brody",
      email: "marcus@zk-rollup.org",
      bio: "Infrastructure Architect @ ZK-Rollup Labs. Specializing in high-throughput prover networks and state validity.",
      skills: ["ZK Proofs", "Rust", "L2 Scaling", "Ethereum Virtual Machine"],
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
      githubUsername: "marcus-brody",
      isGithubVerified: true,
      completedTaskCount: 15,
    },
  });

  const clientElena = await db.user.upsert({
    where: { walletAddress: wallets.client3 },
    update: {},
    create: {
      walletAddress: wallets.client3,
      role: UserRole.CLIENT,
      name: "Elena Rostova",
      email: "elena@aetheria.game",
      bio: "VP of Product at Aetheria Studios. Integrating verifiable on-chain gaming assets, escrow payments and NFT avatars.",
      skills: ["Product Design", "Gaming Economies", "Web3 UX", "NFT Standards"],
      avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80",
      githubUsername: "elena-aetheria",
      isGithubVerified: true,
      completedTaskCount: 6,
    },
  });

  const devBob = await db.user.upsert({
    where: { walletAddress: wallets.developer1 },
    update: {},
    create: {
      walletAddress: wallets.developer1,
      role: UserRole.DEVELOPER,
      name: "Bob Vance",
      email: "bob@vance-engineering.dev",
      bio: "Senior Full-stack & Smart Contract Engineer. Over 6 years building production DApps with React, TypeScript, Viem, and Solidity.",
      skills: ["Solidity", "React", "TypeScript", "Next.js", "GraphQL", "Foundry"],
      avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
      githubUsername: "bob-vance-dev",
      isGithubVerified: true,
      reputationScore: 0,
      completedTaskCount: 0,
    },
  });

  const devSophia = await db.user.upsert({
    where: { walletAddress: wallets.developer2 },
    update: {},
    create: {
      walletAddress: wallets.developer2,
      role: UserRole.DEVELOPER,
      name: "Sophia Nguyen",
      email: "sophia@auditsec.xyz",
      bio: "Top-tier Smart Contract Security Auditor & Formal Verification Researcher. 18+ critical vulnerability disclosures.",
      skills: ["Security Audit", "Solidity", "Foundry", "Slither", "Echinida", "OpenZeppelin"],
      avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80",
      githubUsername: "sophia-sec",
      isGithubVerified: true,
      reputationScore: 0,
      completedTaskCount: 0,
    },
  });

  const devLucas = await db.user.upsert({
    where: { walletAddress: wallets.developer3 },
    update: {},
    create: {
      walletAddress: wallets.developer3,
      role: UserRole.DEVELOPER,
      name: "Lucas Miller",
      email: "lucas@pixelsandcode.studio",
      bio: "Web3 Frontend specialist passionate about crisp typography, micro-interactions, dark mode, and seamless wallet connections.",
      skills: ["React", "Next.js", "Tailwind CSS", "Framer Motion", "wagmi", "shadcn/ui"],
      avatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80",
      githubUsername: "lucas-frontend",
      isGithubVerified: true,
      reputationScore: 0,
      completedTaskCount: 0,
    },
  });

  const devAlex = await db.user.upsert({
    where: { walletAddress: wallets.developer4 },
    update: {},
    create: {
      walletAddress: wallets.developer4,
      role: UserRole.DEVELOPER,
      name: "Alex Rivera",
      email: "alex@chainbridge.tech",
      bio: "Cross-chain & DevOps Engineer. Building automated bridge relayers, Docker clusters, indexers, and Prometheus monitoring.",
      skills: ["DevOps", "Docker", "Rust", "Go", "Ethereum Indexing", "CI/CD"],
      avatar: "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=150&auto=format&fit=crop&q=80",
      githubUsername: "alex-devops",
      isGithubVerified: true,
      reputationScore: 0,
      completedTaskCount: 0,
    },
  });

  // -------------------------------------------------------------------------
  // 2. Issues / Bounties (12 Diverse Bounties: 9 OPEN, 3 COMPLETED)
  // -------------------------------------------------------------------------
  const issue1 = await db.issue.upsert({
    where: { id: "bounty-sc-001" },
    update: { status: IssueStatus.OPEN, developerId: null, outcome: null, tokenId: usdc.id },
    create: {
      id: "bounty-sc-001",
      title: "Implement ERC-4337 Account Abstraction Paymaster with Gas Sponsorship",
      description: `## Context
We are upgrading Nexus Protocol to support gasless user onboarding via Account Abstraction (ERC-4337). We require a production-grade custom Paymaster contract.

## Deliverables
1. **Paymaster Contract**:
   - Inherits from OpenZeppelin and ERC-4337 standard base paymaster.
   - Whitelist logic for authorized callers and maximum sponsored gas per transaction.
   - Emergency drain & pause capabilities managed by multi-sig owner.
2. **Security & Validation**:
   - Replay protection with strict timestamp validation in userOp verification.
   - Full test coverage (>90%) with Foundry / Hardhat.
3. **Deployment Script**:
   - Foundry script targeting Base Sepolia & Ethereum Sepolia.`,
      category: IssueCategory.SMART_CONTRACT,
      status: IssueStatus.OPEN,
      bountyAmount: 1800,
      tokenId: usdc.id,
      requiredSkills: ["Solidity", "ERC-4337", "Foundry", "Security"],
      difficulty: "Hard",
      timeEstimate: "5-7 days",
      clientId: clientAlice.id,
      viewCount: 342,
    },
  });

  const issue2 = await db.issue.upsert({
    where: { id: "bounty-bug-002" },
    update: { status: IssueStatus.OPEN, developerId: null, outcome: null, tokenId: usdc.id },
    create: {
      id: "bounty-bug-002",
      title: "Fix Hydration Mismatch & Theme Flickering in SSR Dark Mode",
      description: `## Problem
On initial page refresh, users experiencing brief light theme flash before the local storage theme preference loads. Next.js 14 server console also warns:
\`\`\`
Warning: Prop 'data-theme' did not match. Server: "light" Client: "dark"
\`\`\`

## Expected Behavior
- Inline blocking script in document \`<head>\` reads \`localStorage\` / system preference without layout shift or visual flash.
- Clean hydration without React console mismatch warnings.
- Works across Chrome, Safari, Firefox.`,
      category: IssueCategory.BUG_FIX,
      status: IssueStatus.OPEN,
      bountyAmount: 400,
      tokenId: usdc.id,
      requiredSkills: ["Next.js", "React", "TypeScript", "Tailwind CSS"],
      difficulty: "Easy",
      timeEstimate: "1-2 days",
      clientId: clientMarcus.id,
      viewCount: 184,
    },
  });

  const issue3 = await db.issue.upsert({
    where: { id: "bounty-ui-003" },
    update: { status: IssueStatus.OPEN, developerId: null, outcome: null, tokenId: usdc.id },
    create: {
      id: "bounty-ui-003",
      title: "Design & Build Interactive Gas Estimator & Fee Tracker Widget",
      description: `## Objective
Create a sleek, accessible widget showing live gas fees across Ethereum L1, Base, and Arbitrum.

## Requirements
- Support fast / standard / instant fee estimation in Gwei & USD equivalent.
- Smooth countdown timer for next block update (12s interval).
- Responsive: compact pill mode for navbar header, expandable drawer modal for mobile.
- Follow the Bloody-Roar ledger design tokens (achromatic, Geist Mono figures).`,
      category: IssueCategory.UI_UX,
      status: IssueStatus.OPEN,
      bountyAmount: 650,
      tokenId: usdc.id,
      requiredSkills: ["React", "TypeScript", "Tailwind CSS", "Framer Motion"],
      difficulty: "Medium",
      timeEstimate: "3-4 days",
      clientId: clientElena.id,
      viewCount: 220,
    },
  });

  const issue4 = await db.issue.upsert({
    where: { id: "bounty-ops-004" },
    update: { status: IssueStatus.OPEN, developerId: null, outcome: null, tokenId: usdc.id },
    create: {
      id: "bounty-ops-004",
      title: "Containerize Escrow Event Indexer & Setup Health Alerting",
      description: `## Background
We need a lean, production-ready multi-stage Dockerfile and docker-compose service for the backend event scanner and worker service.

## Scope
- Multi-stage Alpine Bun image under 150MB.
- Healthcheck endpoint verifying Postgres connection & RPC sync height.
- Prometheus metric exporter for missed blocks and transaction intent latency.
- Comprehensive \`README.md\` detailing local dev, staging, and resource limits.`,
      category: IssueCategory.DEVOPS,
      status: IssueStatus.OPEN,
      bountyAmount: 750,
      tokenId: usdc.id,
      requiredSkills: ["Docker", "Bun", "Prometheus", "DevOps"],
      difficulty: "Medium",
      timeEstimate: "2-3 days",
      clientId: clientAlice.id,
      viewCount: 156,
    },
  });

  const issue5 = await db.issue.upsert({
    where: { id: "bounty-sc-005" },
    update: { status: IssueStatus.OPEN, developerId: null, outcome: null, tokenId: usdc.id },
    create: {
      id: "bounty-sc-005",
      title: "Multi-sig Timelock Governance Vault Implementation with Emergency Guard",
      description: `## Specs
Develop a 48-hour timelock smart contract allowing multi-sig signers to propose and execute protocol parameter upgrades.

## Acceptance Criteria
- 48-hour minimum execution delay for non-critical operations.
- Veto role assigned to security council for suspicious pending transactions.
- Zero-knowledge compatible hash preimage commit-reveal verification.
- 100% test coverage with invariant tests.`,
      category: IssueCategory.SMART_CONTRACT,
      status: IssueStatus.OPEN,
      bountyAmount: 2200,
      tokenId: usdc.id,
      requiredSkills: ["Solidity", "Foundry", "Governance", "Security"],
      difficulty: "Hard",
      timeEstimate: "6-8 days",
      clientId: clientMarcus.id,
      viewCount: 410,
    },
  });

  const issue6 = await db.issue.upsert({
    where: { id: "bounty-doc-006" },
    update: { status: IssueStatus.OPEN, developerId: null, outcome: null, tokenId: usdc.id },
    create: {
      id: "bounty-doc-006",
      title: "Write End-to-End EIP-712 Typed Data Integration & Security Guide",
      description: `## Overview
Provide a developer-facing tutorial demonstrating off-chain signing with EIP-712, signature validation in smart contracts, and common pitfalls (domain separator mismatch, chain reorg vulnerabilities, malleability).

## Deliverables
- Markdown article with interactive TypeScript code snippets.
- Minimal runnable reproduction repo (Next.js + Viem + Wagmi).`,
      category: IssueCategory.DOCUMENTATION,
      status: IssueStatus.OPEN,
      bountyAmount: 350,
      tokenId: usdc.id,
      requiredSkills: ["EIP-712", "TypeScript", "Technical Writing", "Viem"],
      difficulty: "Easy",
      timeEstimate: "2 days",
      clientId: clientAlice.id,
      viewCount: 95,
    },
  });

  const issue7 = await db.issue.upsert({
    where: { id: "bounty-sec-007" },
    update: { status: IssueStatus.OPEN, developerId: null, outcome: null, tokenId: usdc.id, assignedAt: null },
    create: {
      id: "bounty-sec-007",
      title: "Formal Verification of Liquidity Pool Mathematical Invariants",
      description: `## Scope
Verify the constant-product invariant $x \\cdot y = k$ under arbitrary swap sequences and rounding conditions in our concentrated liquidity AMM.

## Tasks
- Model pool math in Certora / Halmos.
- Prove absence of token draining through precision truncation.
- Document assumptions and boundary parameters in formal audit report.`,
      category: IssueCategory.AUDIT,
      status: IssueStatus.OPEN,
      bountyAmount: 3200,
      tokenId: usdc.id,
      requiredSkills: ["Formal Verification", "Certora", "Solidity", "DeFi"],
      difficulty: "Hard",
      timeEstimate: "7-10 days",
      clientId: clientMarcus.id,
      developerId: null,
      viewCount: 295,
    },
  });

  const issue8 = await db.issue.upsert({
    where: { id: "bounty-be-008" },
    update: { status: IssueStatus.OPEN, developerId: null, outcome: null, tokenId: usdc.id, assignedAt: null },
    create: {
      id: "bounty-be-008",
      title: "Prevent Duplicate Webhook Retries on Upstream Network Timeout",
      description: `## Bug
When GitHub webhook deliveries encounter intermittent gateway latency, multiple concurrent deliveries arrive with the same \`X-GitHub-Delivery\` GUID, occasionally creating duplicated activity notifications.

## Fix Strategy
- Implement Postgres advisory lock or idempotent transaction reservation on webhook ID.
- Graceful return HTTP 200 with cached response payload on duplicate arrival.`,
      category: IssueCategory.BUG_FIX,
      status: IssueStatus.OPEN,
      bountyAmount: 600,
      tokenId: usdc.id,
      requiredSkills: ["Node.js", "PostgreSQL", "Prisma", "Webhooks"],
      difficulty: "Medium",
      timeEstimate: "2-3 days",
      clientId: clientAlice.id,
      developerId: null,
      viewCount: 168,
    },
  });

  const issue9 = await db.issue.upsert({
    where: { id: "bounty-ui-009" },
    update: { status: IssueStatus.OPEN, developerId: null, outcome: null, tokenId: usdc.id, assignedAt: null },
    create: {
      id: "bounty-ui-009",
      title: "Build Responsive Developer Reputation & Analytics Dashboard",
      description: `## Requirements
Build an interactive dashboard showing developer analytics:
- Cumulative earnings graph with monthly milestone breakdown.
- Visual star distribution & client testimonial carousel.
- Verified skill badges with on-chain attestation links.
- Responsive for mobile screens with zero layout shifts.`,
      category: IssueCategory.UI_UX,
      status: IssueStatus.OPEN,
      bountyAmount: 850,
      tokenId: usdc.id,
      requiredSkills: ["React", "Next.js", "Data Visualization", "Tailwind CSS"],
      difficulty: "Medium",
      timeEstimate: "3-4 days",
      clientId: clientElena.id,
      developerId: null,
      viewCount: 240,
    },
  });

  const issue10 = await db.issue.upsert({
    where: { id: "bounty-audit-010" },
    update: {
      status: IssueStatus.COMPLETED,
      developerId: devSophia.id,
      outcome: EscrowResolutionKind.RELEASE,
      tokenId: usdc.id,
    },
    create: {
      id: "bounty-audit-010",
      title: "Replay Attack Audit on Cross-Chain Bridge Relayer & EIP-712 Signatures",
      description: `## Audit Scope
Security evaluation of our cross-chain bridge relayer. Verify domain separators, nonce replay vulnerabilities across forks, and signature validation edge cases.`,
      category: IssueCategory.AUDIT,
      status: IssueStatus.COMPLETED,
      outcome: EscrowResolutionKind.RELEASE,
      bountyAmount: 1250,
      tokenId: usdc.id,
      requiredSkills: ["Solidity", "Security Audit", "EIP-712", "Relayers"],
      difficulty: "Hard",
      timeEstimate: "4-5 days",
      clientId: clientAlice.id,
      developerId: devSophia.id,
      assignedAt: new Date(Date.now() - 10 * 86400000),
      completedAt: new Date(Date.now() - 2 * 86400000),
      viewCount: 420,
    },
  });

  const issue11 = await db.issue.upsert({
    where: { id: "bounty-ui-011" },
    update: {
      status: IssueStatus.COMPLETED,
      developerId: devLucas.id,
      outcome: EscrowResolutionKind.RELEASE,
      tokenId: usdc.id,
    },
    create: {
      id: "bounty-ui-011",
      title: "Convert Figma Design to Pricing Page with Annual/Monthly Toggle",
      description: `## Task
Implement pixel-perfect pricing table matching the approved design system. 3 tiers (Hobby, Builder, Protocol Enterprise) with animated discount toggle and clean mobile stack.`,
      category: IssueCategory.UI_UX,
      status: IssueStatus.COMPLETED,
      outcome: EscrowResolutionKind.RELEASE,
      bountyAmount: 500,
      tokenId: usdc.id,
      requiredSkills: ["Next.js", "Tailwind CSS", "Framer Motion", "Responsive Design"],
      difficulty: "Medium",
      timeEstimate: "2-3 days",
      clientId: clientElena.id,
      developerId: devLucas.id,
      assignedAt: new Date(Date.now() - 8 * 86400000),
      completedAt: new Date(Date.now() - 1 * 86400000),
      viewCount: 310,
    },
  });

  const issue12 = await db.issue.upsert({
    where: { id: "bounty-fix-012" },
    update: {
      status: IssueStatus.COMPLETED,
      developerId: devBob.id,
      outcome: EscrowResolutionKind.RELEASE,
      tokenId: usdc.id,
    },
    create: {
      id: "bounty-fix-012",
      title: "Fix Reentrancy Vulnerability in Staking Pool Reward Calculation",
      description: `## Critical Bug Fix
Identified potential read-only reentrancy during reward settlement when external ERC-777 callbacks hook into token transfers. Fix requires checks-effects-interactions refactoring and nonReentrant modifier.`,
      category: IssueCategory.SMART_CONTRACT,
      status: IssueStatus.COMPLETED,
      outcome: EscrowResolutionKind.RELEASE,
      bountyAmount: 1500,
      tokenId: usdc.id,
      requiredSkills: ["Solidity", "Security", "OpenZeppelin", "Reentrancy"],
      difficulty: "Hard",
      timeEstimate: "3-4 days",
      clientId: clientMarcus.id,
      developerId: devBob.id,
      assignedAt: new Date(Date.now() - 12 * 86400000),
      completedAt: new Date(Date.now() - 4 * 86400000),
      viewCount: 512,
    },
  });

  // -------------------------------------------------------------------------
  // 3. Applications (Proposals submitted by developers)
  // -------------------------------------------------------------------------
  const applicationsData = [
    {
      issueId: issue1.id,
      developerId: devBob.id,
      status: ApplicationStatus.PENDING,
      message:
        "I have worked with ERC-4337 standard contracts and Pimlico/Biconomy bundlers for 1.5 years. I can deliver a gas-optimized paymaster with 100% Foundry test coverage in 5 days.",
    },
    {
      issueId: issue1.id,
      developerId: devSophia.id,
      status: ApplicationStatus.PENDING,
      message:
        "I can build the paymaster and perform formal verification of the sponsorship budget limits. Ready to start immediately with Slither static checks included.",
    },
    {
      issueId: issue1.id,
      developerId: devAlex.id,
      status: ApplicationStatus.PENDING,
      message:
        "Extensive experience with AA bundlers and Base chain deployment scripts. I will include a complete test suite and GitHub actions workflow.",
    },
    {
      issueId: issue2.id,
      developerId: devLucas.id,
      status: ApplicationStatus.PENDING,
      message:
        "I have solved this exact SSR theme flicker in multiple production Next.js apps. I will inject a clean inline script in the layout head with zero external dependencies.",
    },
    {
      issueId: issue2.id,
      developerId: devBob.id,
      status: ApplicationStatus.PENDING,
      message:
        "Very familiar with Next.js 14 App Router hydration nuances. Can fix and test across mobile and desktop browsers today.",
    },
    {
      issueId: issue3.id,
      developerId: devLucas.id,
      status: ApplicationStatus.PENDING,
      message:
        "I'll build a gorgeous, responsive widget using Geist typography, custom Framer Motion animations, and Viem public client RPC pollers.",
    },
    {
      issueId: issue4.id,
      developerId: devAlex.id,
      status: ApplicationStatus.PENDING,
      message:
        "DevOps engineer here. I will build an optimized multi-stage Alpine Dockerfile under 120MB and configure health probes for Kubernetes / Railway deployment.",
    },
    {
      issueId: issue7.id,
      developerId: devSophia.id,
      status: ApplicationStatus.PENDING,
      message:
        "Certora formal verification expert. I will formulate mathematical invariants and deliver automated property-based proofs.",
    },
    {
      issueId: issue8.id,
      developerId: devBob.id,
      status: ApplicationStatus.PENDING,
      message:
        "Database concurrency specialist. I will implement idempotent delivery tracking using Postgres advisory locks with zero performance degradation.",
    },
    {
      issueId: issue9.id,
      developerId: devLucas.id,
      status: ApplicationStatus.PENDING,
      message:
        "Ready to design and build pixel-perfect analytics charts with smooth tooltips, badge animations, and responsive layouts.",
    },
    {
      issueId: issue10.id,
      developerId: devSophia.id,
      status: ApplicationStatus.ACCEPTED,
      message:
        "I will perform an exhaustive security review of the cross-chain signature verification pipeline, providing reproducible exploit PoCs.",
    },
    {
      issueId: issue11.id,
      developerId: devLucas.id,
      status: ApplicationStatus.ACCEPTED,
      message:
        "High fidelity conversion from Figma to Next.js components. Guaranteed clean code and zero layout shifts on breakpoint change.",
    },
    {
      issueId: issue12.id,
      developerId: devBob.id,
      status: ApplicationStatus.ACCEPTED,
      message:
        "I will patch the reentrancy vulnerability, introduce ReentrancyGuard, and add regression unit tests ensuring safe token callbacks.",
    },
  ];

  for (const app of applicationsData) {
    await db.application.upsert({
      where: {
        issueId_developerId: {
          issueId: app.issueId,
          developerId: app.developerId,
        },
      },
      update: { status: app.status },
      create: app,
    });
  }

  // -------------------------------------------------------------------------
  // 4. Submissions (Deliverables for completed tasks)
  // -------------------------------------------------------------------------
  const submissionsData = [
    {
      id: "sub-010",
      issueId: issue10.id,
      developerId: devSophia.id,
      description:
        "Comprehensive cross-chain audit complete. Found and patched 2 potential signature replay vectors on fork events. Added 14 Foundry invariant tests and verified against mainnet simulation.",
      pullRequestUrl: "https://github.com/nexus-protocol/bridge-relayer/pull/42",
      commitSha: "7f8b91a2c3d4e5f60718293a4b5c6d7e8f901234",
      prNumber: 42,
      prState: PRState.MERGED,
      status: SubmissionStatus.SUBMITTED,
      submittedAt: new Date(Date.now() - 3 * 86400000),
      mergedAt: new Date(Date.now() - 2 * 86400000),
      reviewedAt: new Date(Date.now() - 2 * 86400000),
      reviewNotes: "Flawless audit report and rock-solid Foundry regression tests. Great job!",
    },
    {
      id: "sub-011",
      issueId: issue11.id,
      developerId: devLucas.id,
      description:
        "Completed pricing page implementation in Next.js 14 App Router. Includes monthly/annual toggle with 20% discount badge animation, responsive breakpoint styling, and dark theme support.",
      pullRequestUrl: "https://github.com/aetheria-studios/web/pull/18",
      commitSha: "3a4b5c6d7e8f90123456789a1b2c3d4e5f607182",
      prNumber: 18,
      prState: PRState.MERGED,
      status: SubmissionStatus.SUBMITTED,
      submittedAt: new Date(Date.now() - 2 * 86400000),
      mergedAt: new Date(Date.now() - 1 * 86400000),
      reviewedAt: new Date(Date.now() - 1 * 86400000),
      reviewNotes: "Pixel-perfect matching our Figma. Smooth animations and clean component structure.",
    },
    {
      id: "sub-012",
      issueId: issue12.id,
      developerId: devBob.id,
      description:
        "Refactored reward calculation logic to eliminate read-only reentrancy. Replaced external state queries with checkpointed balances and added OpenZeppelin ReentrancyGuard.",
      pullRequestUrl: "https://github.com/zk-rollup-org/contracts/pull/89",
      commitSha: "90123456789a1b2c3d4e5f6071823a4b5c6d7e8f",
      prNumber: 89,
      prState: PRState.MERGED,
      status: SubmissionStatus.SUBMITTED,
      submittedAt: new Date(Date.now() - 5 * 86400000),
      mergedAt: new Date(Date.now() - 4 * 86400000),
      reviewedAt: new Date(Date.now() - 4 * 86400000),
      reviewNotes: "Critical fix tested thoroughly on local anvil testnet. Funds protected.",
    },
  ];

  for (const sub of submissionsData) {
    await db.submission.upsert({
      where: { id: sub.id },
      update: { status: sub.status, prState: sub.prState },
      create: sub,
    });
  }

  // -------------------------------------------------------------------------
  // 5. Reviews (Ratings from clients to developers) & Recalculate Reputation
  // -------------------------------------------------------------------------
  const reviewsData = [
    {
      id: "rev-010",
      issueId: issue10.id,
      clientId: clientAlice.id,
      developerId: devSophia.id,
      rating: 5,
      comment:
        "Sophia is hands down the best smart contract auditor we have ever worked with. She identified subtle edge cases in our EIP-712 signer validation that would have been disastrous in production. Highly recommended!",
    },
    {
      id: "rev-011",
      issueId: issue11.id,
      clientId: clientElena.id,
      developerId: devLucas.id,
      rating: 5,
      comment:
        "Lucas exceeded our expectations. The pricing page is responsive, perfectly animated, and loads instantly. He even optimized our bundle size by lazy-loading heavy SVG charts. Will hire again!",
    },
    {
      id: "rev-012",
      issueId: issue12.id,
      clientId: clientMarcus.id,
      developerId: devBob.id,
      rating: 5,
      comment:
        "Bob fixed a high-severity reentrancy vulnerability under tight deadlines. His communication was outstanding, and he provided clear regression tests to prevent future issues. 10/10 engineer.",
    },
  ];

  for (const rev of reviewsData) {
    await db.review.upsert({
      where: { issueId: rev.issueId },
      update: { rating: rev.rating, comment: rev.comment },
      create: rev,
    });
  }

  const developerIds = [...new Set(reviewsData.map((r) => r.developerId))];
  for (const devId of developerIds) {
    await db.$transaction(async (tx) => recalcReputation(tx, devId));
  }

  // -------------------------------------------------------------------------
  // 6. Public Discussion Comments (Under bounties)
  // -------------------------------------------------------------------------
  const commentsData = [
    {
      id: "comm-001",
      issueId: issue1.id,
      userId: devBob.id,
      body: "Hi Alice, does the Paymaster need to accept ERC-20 token refunds directly, or will all gas sponsorship be pre-funded in native ETH by the protocol treasury?",
    },
    {
      id: "comm-002",
      issueId: issue1.id,
      userId: clientAlice.id,
      body: "Great question Bob! For v1, the protocol treasury will deposit ETH directly into the EntryPoint contract on behalf of the paymaster. Multi-token payment will come in v2.",
    },
    {
      id: "comm-003",
      issueId: issue2.id,
      userId: devLucas.id,
      body: "I inspected the console error. The issue stems from Next.js reading the default theme before evaluating the browser cookie / localStorage script. An inline pre-render script will cleanly resolve this.",
    },
    {
      id: "comm-004",
      issueId: issue5.id,
      userId: devSophia.id,
      body: "Does the timelock require cancel functionality by the proposer before the 48-hour delay concludes?",
    },
    {
      id: "comm-005",
      issueId: issue5.id,
      userId: clientMarcus.id,
      body: "Yes Sophia, any proposer or the security council should be able to cancel pending operations before the grace period ends.",
    },
  ];

  for (const comm of commentsData) {
    await db.issueComment.upsert({
      where: { id: comm.id },
      update: { body: comm.body },
      create: comm,
    });
  }

  // -------------------------------------------------------------------------
  // 7. Direct Messages
  // -------------------------------------------------------------------------
  const messagesData = [
    {
      id: "msg-001",
      issueId: issue7.id,
      senderId: clientMarcus.id,
      content: "Hi Sophia, welcomed aboard! I have attached our Halmos configuration template to the task.",
    },
    {
      id: "msg-002",
      issueId: issue7.id,
      senderId: devSophia.id,
      content: "Received! Setting up the invariant specification now. I'll share the preliminary proof logs by tomorrow.",
    },
    {
      id: "msg-003",
      issueId: issue8.id,
      senderId: devBob.id,
      content: "Hey Alice, I have reproduced the concurrent webhook duplicate locally. Advisory lock on delivery GUID completely mitigates it.",
    },
    {
      id: "msg-004",
      issueId: issue8.id,
      senderId: clientAlice.id,
      content: "Awesome news Bob! Let me know as soon as the PR is ready for review.",
    },
  ];

  for (const msg of messagesData) {
    const chatIssue = await db.issue.findUniqueOrThrow({ where: { id: msg.issueId } });
    const chatRoom = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM issues WHERE id = ${chatIssue.id} FOR UPDATE`;
      if (chatIssue.developerId) return ensureWorkConversation(tx, chatIssue);
      const developerId = messagesData.find((row) => row.issueId === chatIssue.id && row.senderId !== chatIssue.clientId)!.senderId;
      const application = await tx.application.findUniqueOrThrow({ where: { issueId_developerId: { issueId: chatIssue.id, developerId } } });
      return tx.conversation.upsert({ where: { applicationId: application.id }, update: {}, create: {
        kind: "APPLICATION", issueId: chatIssue.id, applicationId: application.id,
        participants: { create: [{ userId: chatIssue.clientId, role: "CLIENT" }, { userId: developerId, role: "APPLICANT" }] },
      } });
    });
    await db.message.upsert({
      where: { id: msg.id },
      update: { content: msg.content, conversationId: chatRoom.id },
      create: { ...msg, conversationId: chatRoom.id },
    });
    const latest = await db.message.aggregate({ where: { conversationId: chatRoom.id }, _max: { createdAt: true } });
    await db.conversation.update({ where: { id: chatRoom.id }, data: { lastMessageAt: latest._max.createdAt } });
  }

  // -------------------------------------------------------------------------
  // 8. Notifications (For clients & developers)
  // -------------------------------------------------------------------------
  const notificationsData = [
    {
      id: "notif-001",
      userId: clientAlice.id,
      type: NotificationType.NEW_APPLICANT,
      title: "New Application Received",
      body: "Bob Vance submitted a proposal for 'Implement ERC-4337 Account Abstraction Paymaster'",
      link: `/marketplace/${issue1.id}`,
    },
    {
      id: "notif-002",
      userId: clientAlice.id,
      type: NotificationType.NEW_APPLICANT,
      title: "New Application Received",
      body: "Sophia Nguyen submitted a proposal for 'Implement ERC-4337 Account Abstraction Paymaster'",
      link: `/marketplace/${issue1.id}`,
    },
    {
      id: "notif-003",
      userId: devSophia.id,
      type: NotificationType.PAYMENT_RECEIVED,
      title: "Payment Released 🎉",
      body: "1,250 USDC has been released to your wallet for completing 'Replay Attack Audit on Cross-Chain Bridge Relayer'",
      link: `/marketplace/${issue10.id}`,
    },
    {
      id: "notif-004",
      userId: devLucas.id,
      type: NotificationType.APPLICATION_ACCEPTED,
      title: "Application Accepted!",
      body: "Elena Rostova accepted your application for 'Build Responsive Developer Analytics Dashboard'",
      link: `/marketplace/${issue9.id}`,
    },
    {
      id: "notif-005",
      userId: devBob.id,
      type: NotificationType.PAYMENT_RECEIVED,
      title: "Payment Released 🎉",
      body: "1,500 USDC has been released to your wallet for completing 'Fix Reentrancy Vulnerability in Staking Pool'",
      link: `/marketplace/${issue12.id}`,
    },
  ];

  for (const notif of notificationsData) {
    await db.notification.upsert({
      where: { id: notif.id },
      update: { title: notif.title, body: notif.body, link: notif.link },
      create: notif,
    });
  }

    baselineApplications = applicationsData.length;
    baselineSubmissions = submissionsData.length;
    baselineReviews = reviewsData.length;
    baselineComments = commentsData.length;
    baselineMessages = messagesData.length;
    baselineNotifications = notificationsData.length;
  }

  // -------------------------------------------------------------------------
  // 9. Realistic Discussion Comments & Image Attachments for Live Marketplace
  // -------------------------------------------------------------------------
  let addedComments = 0;
  let addedApplications = 0;
  let addedAttachments = 0;

  // 9.1 Image Attachments (stored in apps/web/.uploads/<uploaderId>/)
  const uploadsBaseDir = getUploadsDir();
  const liveMarketplaceAttachments: Array<{
    id: string;
    uploaderId: string;
    fileName: string;
    theme: "terminal" | "topology" | "architecture" | "diff";
  }> = [
    { id: "seed-att-001", uploaderId: "cmw1j9k1k00528gqsv4utmemg", fileName: "timelock-revert-trace.png", theme: "terminal" },
    { id: "seed-att-002", uploaderId: "cmw1j7p6u000c8gqsdrefdrzm", fileName: "docker-compose-topology.png", theme: "topology" },
    { id: "seed-att-003", uploaderId: "cmt7fampr0002lm8kgxjyudb9", fileName: "websocket-escrow-flow.png", theme: "architecture" },
    { id: "seed-att-004", uploaderId: "cmw1j9lwc00578gqs5ugp9igz", fileName: "settlement-rounding-diff.png", theme: "diff" },
    { id: "seed-att-005", uploaderId: "cmw33sor0006odgmtya70m0wo", fileName: "siwe-session-threat-model.png", theme: "architecture" },
  ];

  for (const att of liveMarketplaceAttachments) {
    // These optional fixtures refer to accounts already present in the shared demo database.
    if (!await db.user.findUnique({ where: { id: att.uploaderId }, select: { id: true } })) continue;
    const userDir = path.join(uploadsBaseDir, att.uploaderId);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    const filePath = path.join(userDir, att.fileName);
    let buf: Buffer;
    if (!fs.existsSync(filePath)) {
      buf = createDiagramPng(440, 180, att.theme);
      fs.writeFileSync(filePath, buf);
    } else {
      buf = fs.readFileSync(filePath);
    }

    const key = `${att.uploaderId}/${att.fileName}`;
    const fileUrl = `http://localhost:4000/api/uploads?key=${encodeURIComponent(key)}`;
    const existingAtt = await db.attachment.findUnique({ where: { id: att.id } });
    if (!existingAtt) {
      addedAttachments++;
      await db.attachment.create({
        data: {
          id: att.id,
          uploaderId: att.uploaderId,
          fileName: att.fileName,
          fileUrl,
          fileSize: buf.length,
          fileMime: "image/png",
          purpose: "COMMENT_IMAGE",
          status: "ATTACHED",
        },
      });
    }
  }

  // 9.2 Realistic Discussion Comments (Staggered chronological past dates)
  const liveMarketplaceComments: Array<{
    id: string;
    issueId: string;
    userId: string;
    body: string;
    createdAt: Date;
  }> = [
    // Thread 1: TimeLockController Safe arbiter (cmw34qqap01ujdgmtft3mp6tj) - 7 comments (total 11 -> HOT)
    {
      id: "seed-comment-cmw34qqap-01",
      issueId: "cmw34qqap01ujdgmtft3mp6tj",
      userId: "cmw1j9k1k00528gqsv4utmemg", // Arthur Pendelton
      body: "Will the 48-hour delay window apply to emergency pause invocations as well, or should circuit breakers remain instantaneous through a separate guardian role?",
      createdAt: new Date("2026-11-05T14:15:00.000Z"),
    },
    {
      id: "seed-comment-cmw34qqap-02",
      issueId: "cmw34qqap01ujdgmtft3mp6tj",
      userId: "cmw33rr5x003ydgmt82npe8og", // Trịnh Kim Ngân (Client)
      body: "Good catch Arthur. Emergency pauses must be instant to protect user funds during an active exploit. Only parameter changes such as the 10% platform fee and the 72-hour dispute window must go through the 48-hour timelock.",
      createdAt: new Date("2026-11-05T17:30:00.000Z"),
    },
    {
      id: "seed-comment-cmw34qqap-03",
      issueId: "cmw34qqap01ujdgmtft3mp6tj",
      userId: "cmw1j9lwc00578gqs5ugp9igz", // Cao Tien Dung
      body: "I recommend using OpenZeppelin TimelockControllerUpgradeable with the Safe proxy designated as the sole proposer and executor. That keeps the governance architecture modular without duplicating multi-sig threshold checks.",
      createdAt: new Date("2026-11-06T03:45:00.000Z"),
    },
    {
      id: "seed-comment-cmw34qqap-04",
      issueId: "cmw34qqap01ujdgmtft3mp6tj",
      userId: "cmw33rr5x003ydgmt82npe8og", // Trịnh Kim Ngân (Client)
      body: "That matches our target design. Please make sure the deployment script exports the initialized timelock address so our Safe batch script can wire the roles in a single atomic transaction.",
      createdAt: new Date("2026-11-06T08:20:00.000Z"),
    },
    {
      id: "seed-comment-cmw34qqap-05",
      issueId: "cmw34qqap01ujdgmtft3mp6tj",
      userId: "cmw1j9k1k00528gqsv4utmemg", // Arthur Pendelton
      body: "Here is the Foundry test failure trace showing the revert on delay enforcement before the 48-hour timelock completes. ![image](/api/uploads?key=cmw1j9k1k00528gqsv4utmemg%2Ftimelock-revert-trace.png) The schedule function correctly restricts execution until the eta timestamp has elapsed.",
      createdAt: new Date("2026-11-06T13:10:00.000Z"),
    },
    {
      id: "seed-comment-cmw34qqap-06",
      issueId: "cmw34qqap01ujdgmtft3mp6tj",
      userId: "cmw33sor0006odgmtya70m0wo", // Devon Castillo
      body: "I can deliver this within 3 days. I built an identical Safe timelock setup with Foundry fuzz tests for an escrow protocol last quarter.",
      createdAt: new Date("2026-11-07T04:00:00.000Z"),
    },
    {
      id: "seed-comment-cmw34qqap-07",
      issueId: "cmw34qqap01ujdgmtft3mp6tj",
      userId: "cmw33rr5x003ydgmt82npe8og", // Trịnh Kim Ngân (Client)
      body: "Thanks everyone for the clear proposals. Arthur and Devon, please submit your formal application so we can select the developer today.",
      createdAt: new Date("2026-11-07T11:30:00.000Z"),
    },

    // Thread 2: Docker Compose local staging (cmw34tisw01yvdgmte2ko72lx) - 8 comments (total 12 -> HOT)
    {
      id: "seed-comment-cmw34tisw-01",
      issueId: "cmw34tisw01yvdgmte2ko72lx",
      userId: "cmw1j7p6u000c8gqsdrefdrzm", // Alex Rivera
      body: "Does the compose file need to persist Hardhat node state across restarts via volume mounts, or should each clean run start with a freshly seeded genesis state?",
      createdAt: new Date("2026-11-05T13:40:00.000Z"),
    },
    {
      id: "seed-comment-cmw34tisw-02",
      issueId: "cmw34tisw01yvdgmte2ko72lx",
      userId: "cmw33smga006hdgmtxcolkhe1", // Trương Vĩnh Phúc (Client)
      body: "Each run should start from a clean slate by default, but having a --preserve-state flag in the wrapper script would be very helpful for longer integration debugging sessions.",
      createdAt: new Date("2026-11-05T16:20:00.000Z"),
    },
    {
      id: "seed-comment-cmw34tisw-03",
      issueId: "cmw34tisw01yvdgmte2ko72lx",
      userId: "cmw1j8wjw003e8gqsx09e4ch3", // Carlos Mendez
      body: "We should use health check conditions on the postgres and redis services with service_healthy so the Next.js app and event indexer worker never boot into connection refused errors.",
      createdAt: new Date("2026-11-06T02:15:00.000Z"),
    },
    {
      id: "seed-comment-cmw34tisw-04",
      issueId: "cmw34tisw01yvdgmte2ko72lx",
      userId: "cmw33smga006hdgmtxcolkhe1", // Trương Vĩnh Phúc (Client)
      body: "Agreed. That was our biggest headache with the old bash script. The worker kept failing because postgres was still accepting connections.",
      createdAt: new Date("2026-11-06T06:45:00.000Z"),
    },
    {
      id: "seed-comment-cmw34tisw-05",
      issueId: "cmw34tisw01yvdgmte2ko72lx",
      userId: "cmw1j7p6u000c8gqsdrefdrzm", // Alex Rivera
      body: "Here is the service startup dependency diagram with healthy status probes for PostgreSQL and Redis. ![image](/api/uploads?key=cmw1j7p6u000c8gqsdrefdrzm%2Fdocker-compose-topology.png) This configuration eliminates the race where the worker booted before the database schema migrations applied.",
      createdAt: new Date("2026-11-06T11:50:00.000Z"),
    },
    {
      id: "seed-comment-cmw34tisw-06",
      issueId: "cmw34tisw01yvdgmte2ko72lx",
      userId: "cmw1j8ncz002p8gqsnbt2008m", // Bui Duc Thinh
      body: "+1, had the exact same issue on our CI runner. Adding pg_isready as the healthcheck command completely stabilized the startup order.",
      createdAt: new Date("2026-11-06T18:30:00.000Z"),
    },
    {
      id: "seed-comment-cmw34tisw-07",
      issueId: "cmw34tisw01yvdgmte2ko72lx",
      userId: "cmw1j8wjw003e8gqsx09e4ch3", // Carlos Mendez
      body: "I have the compose file and local-up.sh script ready in my branch. I will include a Makefile target as well for convenience.",
      createdAt: new Date("2026-11-07T05:15:00.000Z"),
    },
    {
      id: "seed-comment-cmw34tisw-08",
      issueId: "cmw34tisw01yvdgmte2ko72lx",
      userId: "cmw33smga006hdgmtxcolkhe1", // Trương Vĩnh Phúc (Client)
      body: "Awesome progress. Looking forward to reviewing the PR once your application is formally approved.",
      createdAt: new Date("2026-11-07T12:00:00.000Z"),
    },

    // Thread 3: Realtime WebSocket Escrow notifications (cmw34w4kr0236dgmt9d8ii8c2) - 6 comments (total 10 -> HOT)
    {
      id: "seed-comment-cmw34w4kr-01",
      issueId: "cmw34w4kr0236dgmt9d8ii8c2",
      userId: "cmt7fampr0002lm8kgxjyudb9", // Bob (Developer)
      body: "Will the WebSocket events be broadcast over public rooms by issue ID, or do we deliver them strictly to private user rooms using their verified wallet address?",
      createdAt: new Date("2026-11-05T15:10:00.000Z"),
    },
    {
      id: "seed-comment-cmw34w4kr-02",
      issueId: "cmw34w4kr0236dgmt9d8ii8c2",
      userId: "cmw33qdig0009dgmttifvgjoh", // Sarah Jenkins (Client)
      body: "General milestone changes should go to the issue room so anyone viewing the bounty sees live status updates. Personal alerts like payment release or application acceptance must be sent to the user's private channel.",
      createdAt: new Date("2026-11-05T19:00:00.000Z"),
    },
    {
      id: "seed-comment-cmw34w4kr-03",
      issueId: "cmw34w4kr0236dgmt9d8ii8c2",
      userId: "cmw1j8dpa00208gqsub44zhw0", // Chloe Martin
      body: "We should include an unread counter badge in the Zustand state with optimistic updates so the navbar icon increments instantly without waiting for a re-fetch.",
      createdAt: new Date("2026-11-06T04:20:00.000Z"),
    },
    {
      id: "seed-comment-cmw34w4kr-04",
      issueId: "cmw34w4kr0236dgmt9d8ii8c2",
      userId: "cmt7fampr0002lm8kgxjyudb9", // Bob (Developer)
      body: "Created an architecture diagram for the event fanout from Redis pub/sub to Socket.IO clients. ![image](/api/uploads?key=cmt7fampr0002lm8kgxjyudb9%2Fwebsocket-escrow-flow.png) The room multiplexing keeps payload sizes minimal by scoping broadcast channels per user and issue.",
      createdAt: new Date("2026-11-06T10:40:00.000Z"),
    },
    {
      id: "seed-comment-cmw34w4kr-05",
      issueId: "cmw34w4kr0236dgmt9d8ii8c2",
      userId: "cmw33qdig0009dgmttifvgjoh", // Sarah Jenkins (Client)
      body: "The architecture diagram looks very clean. Please ensure connection dropouts fall back to polling gracefully if the WebSocket handshake fails.",
      createdAt: new Date("2026-11-06T16:15:00.000Z"),
    },
    {
      id: "seed-comment-cmw34w4kr-06",
      issueId: "cmw34w4kr0236dgmt9d8ii8c2",
      userId: "cmw33t5bi0081dgmtcp8lixmq", // Châu Quốc Dũng
      body: "I can wire the Socket.IO client hook and Zustand store within 2 days. Tested the reconnect logic against flaky network conditions.",
      createdAt: new Date("2026-11-07T09:45:00.000Z"),
    },

    // Thread 4: Settlement 50/50 rounding issue (cmw34dfmc0192dgmtj4cfmao9) - 5 comments (total 9 -> HOT)
    {
      id: "seed-comment-cmw34dfmc-01",
      issueId: "cmw34dfmc0192dgmtj4cfmao9",
      userId: "cmw1j9lwc00578gqs5ugp9igz", // Cao Tien Dung
      body: "When an odd amount like 1000000000000000001 wei is split 50/50, which party is expected to absorb the single leftover wei after subtracting the platform fee?",
      createdAt: new Date("2026-11-05T14:50:00.000Z"),
    },
    {
      id: "seed-comment-cmw34dfmc-02",
      issueId: "cmw34dfmc0192dgmtj4cfmao9",
      userId: "cmw33q6pp0002dgmtjbc9olb3", // Trần Hải Đăng (Client)
      body: "Per protocol spec QĐ-23, the developer receives the remainder wei in a split settlement. The client gets floor((netAmount * clientBps) / 10000) and developer gets netAmount - clientShare.",
      createdAt: new Date("2026-11-05T18:15:00.000Z"),
    },
    {
      id: "seed-comment-cmw34dfmc-03",
      issueId: "cmw34dfmc0192dgmtj4cfmao9",
      userId: "cmw1j9lwc00578gqs5ugp9igz", // Cao Tien Dung
      body: "Here is the test assertion output showing the 1 wei invariant discrepancy when splitting 1000000000000000001 wei. ![image](/api/uploads?key=cmw1j9lwc00578gqs5ugp9igz%2Fsettlement-rounding-diff.png) Allocating the remainder to the developer share satisfies the equality check without truncating the platform fee.",
      createdAt: new Date("2026-11-06T09:30:00.000Z"),
    },
    {
      id: "seed-comment-cmw34dfmc-04",
      issueId: "cmw34dfmc0192dgmtj4cfmao9",
      userId: "cmw1j8jp2002f8gqszh5bo3p2", // Dang Thai Son
      body: "We also need to replace the Number(amount) conversion in the web frontend settlement modal with native BigInt formatting so the UI preview matches the contract transaction exactly.",
      createdAt: new Date("2026-11-06T15:40:00.000Z"),
    },
    {
      id: "seed-comment-cmw34dfmc-05",
      issueId: "cmw34dfmc0192dgmtj4cfmao9",
      userId: "cmw33q6pp0002dgmtjbc9olb3", // Trần Hải Đăng (Client)
      body: "Excellent observation Dang. Please make sure the unit tests verify both odd wei allocations and zero-balance edge cases before opening the PR.",
      createdAt: new Date("2026-11-07T08:00:00.000Z"),
    },

    // Thread 5: ThirdwebAuth SIWE session audit (cmw34lbzh01lxdgmtdklgvxef) - 2 comments (total 6)
    {
      id: "seed-comment-cmw34lbzh-01",
      issueId: "cmw34lbzh01lxdgmtdklgvxef",
      userId: "cmw33sor0006odgmtya70m0wo", // Devon Castillo
      body: "Here is the sequence diagram illustrating how replaying an expired SIWE session token can bypass cookie invalidation. ![image](/api/uploads?key=cmw33sor0006odgmtya70m0wo%2Fsiwe-session-threat-model.png) Adding an in-memory TTL blacklist for invalidated session nonces closes this window.",
      createdAt: new Date("2026-11-06T14:20:00.000Z"),
    },
    {
      id: "seed-comment-cmw34lbzh-02",
      issueId: "cmw34lbzh01lxdgmtdklgvxef",
      userId: "cmw33t0kc007ndgmt830g7nsm", // Dương Văn Thắng (Client)
      body: "This threat model is very clear. Let us move forward with the Redis-backed nonce revocation list so multiple server instances share the invalidation state.",
      createdAt: new Date("2026-11-07T03:10:00.000Z"),
    },

    // Thread 6: Prometheus/Grafana RPC latency (cmw3456t800w4dgmtihk10swj) - 2 comments (total 6)
    {
      id: "seed-comment-cmw3456t8-01",
      issueId: "cmw3456t800w4dgmtihk10swj",
      userId: "cmw1j7p6u000c8gqsdrefdrzm", // Alex Rivera
      body: "Are we exporting standard Prometheus histogram buckets for RPC request duration, or do you have custom latency percentiles like p99.9 required for SLA monitoring?",
      createdAt: new Date("2026-11-06T07:50:00.000Z"),
    },
    {
      id: "seed-comment-cmw3456t8-02",
      issueId: "cmw3456t800w4dgmtihk10swj",
      userId: "cmw33qpvb0018dgmtcwhgypm4", // Phạm Minh Khôi (Client)
      body: "Standard Prometheus buckets starting from 10ms up to 10s will be sufficient. Please include a separate panel for worker job processing time.",
      createdAt: new Date("2026-11-06T17:05:00.000Z"),
    },

    // Thread 7: Keyboard shortcuts navigation (cmw34g13601dadgmtyy9a0909) - 1 comment (total 5)
    {
      id: "seed-comment-cmw34g136-01",
      issueId: "cmw34g13601dadgmtyy9a0909",
      userId: "cmw1j8wjw003e8gqsx09e4ch3", // Carlos Mendez
      body: "I can integrate react-hotkeys-hook to handle j/k list navigation and / to focus the search bar while preventing collisions when typing in comment textareas.",
      createdAt: new Date("2026-11-06T13:45:00.000Z"),
    },

    // Thread 8: Task completion prediction (cmw34ane0014ndgmtsftgom28) - 1 comment (total 5)
    {
      id: "seed-comment-cmw34ane0-01",
      issueId: "cmw34ane0014ndgmtsftgom28",
      userId: "cmw1j995z00488gqsdlsydsth", // Fatima Al-Mansoor
      body: "I suggest training a lightweight gradient boosted tree model on historical task completion times before reaching for complex neural models. Baseline tabular features will give much faster inference.",
      createdAt: new Date("2026-11-06T12:00:00.000Z"),
    },

    // Thread 9: Bridge relayer audit (sample-issue-004) - 2 comments (total 3)
    {
      id: "seed-comment-sample004-01",
      issueId: "sample-issue-004",
      userId: "cmt7fampr0002lm8kgxjyudb9", // Bob (Developer)
      body: "I reviewed the relayer contract and noted that nonces are sequential rather than bitmapped. This could cause head-of-line blocking if a transaction with an earlier nonce fails.",
      createdAt: new Date("2026-11-06T15:00:00.000Z"),
    },
    {
      id: "seed-comment-sample004-02",
      issueId: "sample-issue-004",
      userId: "cmt7falfv0001lm8kcjlgt704", // Alice (Client)
      body: "Good catch Bob. Bitmapped nonces would allow parallel processing of independent transactions. Please include that recommendation in your audit report.",
      createdAt: new Date("2026-11-07T02:30:00.000Z"),
    },

    // Thread 10: Developer analytics dashboard (sample-issue-005) - 3 comments (total 4)
    {
      id: "seed-comment-sample005-01",
      issueId: "sample-issue-005",
      userId: "cmw1j8wjw003e8gqsx09e4ch3", // Carlos Mendez
      body: "Should the earnings chart display amounts converted to USD at the current rate or purely in the original token denominations?",
      createdAt: new Date("2026-11-06T11:15:00.000Z"),
    },
    {
      id: "seed-comment-sample005-02",
      issueId: "sample-issue-005",
      userId: "cmt7falfv0001lm8kcjlgt704", // Alice (Client)
      body: "Display both if possible: primary amount in USDC with the local currency estimate underneath in muted text.",
      createdAt: new Date("2026-11-06T16:40:00.000Z"),
    },
    {
      id: "seed-comment-sample005-03",
      issueId: "sample-issue-005",
      userId: "cmw1j8wjw003e8gqsx09e4ch3", // Carlos Mendez
      body: "Understood. I will use tremor and recharts with dark mode styling matching our design system tokens.",
      createdAt: new Date("2026-11-07T06:20:00.000Z"),
    },
  ];

  for (const comment of liveMarketplaceComments) {
    if (!await db.issue.findUnique({ where: { id: comment.issueId }, select: { id: true } }) ||
        !await db.user.findUnique({ where: { id: comment.userId }, select: { id: true } })) continue;
    const existing = await db.issueComment.findUnique({ where: { id: comment.id } });
    if (!existing) {
      addedComments++;
      await db.issueComment.create({
        data: {
          id: comment.id,
          issueId: comment.issueId,
          userId: comment.userId,
          body: comment.body,
          createdAt: comment.createdAt,
          updatedAt: comment.createdAt,
        },
      });
    } else {
      await db.issueComment.update({
        where: { id: comment.id },
        data: { body: comment.body, updatedAt: comment.createdAt },
      });
    }
  }

  // 9.3 Additional Pending Applications for Realistic Spread
  const liveMarketplaceApplications = [
    {
      issueId: "cmw34qqap01ujdgmtft3mp6tj",
      developerId: "cmw1j9k1k00528gqsv4utmemg",
      status: ApplicationStatus.PENDING,
      message: "Experienced Solidity and Safe developer. Ready to implement the TimelockController with Foundry unit and fuzz tests within 3 days.",
      createdAt: new Date("2026-11-06T14:00:00.000Z"),
    },
    {
      issueId: "cmw34qqap01ujdgmtft3mp6tj",
      developerId: "cmw33sor0006odgmtya70m0wo",
      status: ApplicationStatus.PENDING,
      message: "Built similar Safe governance modules for escrow protocols. Can deliver clean code with 100% test coverage.",
      createdAt: new Date("2026-11-07T05:00:00.000Z"),
    },
    {
      issueId: "cmw34qqap01ujdgmtft3mp6tj",
      developerId: "cmw1j9lwc00578gqs5ugp9igz",
      status: ApplicationStatus.PENDING,
      message: "I have implemented OpenZeppelin TimelockController architectures across multiple production protocols.",
      createdAt: new Date("2026-11-06T08:00:00.000Z"),
    },
    {
      issueId: "cmw34w4kr0236dgmt9d8ii8c2",
      developerId: "cmt7fampr0002lm8kgxjyudb9",
      status: ApplicationStatus.PENDING,
      message: "Senior full-stack engineer with deep Socket.IO and Zustand experience. Ready to build the realtime notification bridge.",
      createdAt: new Date("2026-11-06T11:00:00.000Z"),
    },
    {
      issueId: "cmw34w4kr0236dgmt9d8ii8c2",
      developerId: "cmw1j8dpa00208gqsub44zhw0",
      status: ApplicationStatus.PENDING,
      message: "Ready to implement optimistic navbar notification badges and resilient reconnection handling.",
      createdAt: new Date("2026-11-06T15:00:00.000Z"),
    },
    {
      issueId: "cmw34tisw01yvdgmte2ko72lx",
      developerId: "cmw1j7p6u000c8gqsdrefdrzm",
      status: ApplicationStatus.PENDING,
      message: "DevOps engineer specializing in Docker clusters and reproducible local development stacks.",
      createdAt: new Date("2026-11-06T12:00:00.000Z"),
    },
    {
      issueId: "cmw34tisw01yvdgmte2ko72lx",
      developerId: "cmw1j8wjw003e8gqsx09e4ch3",
      status: ApplicationStatus.PENDING,
      message: "Will configure health checks, volume mounts, and wrapper scripts for seamless 1-command startup.",
      createdAt: new Date("2026-11-07T06:00:00.000Z"),
    },
    {
      issueId: "cmw34dfmc0192dgmtj4cfmao9",
      developerId: "cmw1j9lwc00578gqs5ugp9igz",
      status: ApplicationStatus.PENDING,
      message: "Will fix the 1 wei precision truncation and add exhaustive property-based tests across odd balance distributions.",
      createdAt: new Date("2026-11-06T10:00:00.000Z"),
    },
    {
      issueId: "sample-issue-004",
      developerId: "cmt7fampr0002lm8kgxjyudb9",
      status: ApplicationStatus.PENDING,
      message: "I specialize in EVM security audits and bridge replay analysis. Ready to conduct full threat model and invariant tests.",
      createdAt: new Date("2026-11-06T16:00:00.000Z"),
    },
    {
      issueId: "sample-issue-005",
      developerId: "cmw1j8wjw003e8gqsx09e4ch3",
      status: ApplicationStatus.PENDING,
      message: "Frontend engineer with data visualization expertise. Ready to implement responsive charts with tremor and Tailwind.",
      createdAt: new Date("2026-11-06T12:00:00.000Z"),
    },
    {
      issueId: "sample-issue-005",
      developerId: "cmw1j8ncz002p8gqsnbt2008m",
      status: ApplicationStatus.PENDING,
      message: "Ready to build the developer analytics dashboard with accessible charts and zero hydration errors.",
      createdAt: new Date("2026-11-07T07:00:00.000Z"),
    },
  ];

  for (const app of liveMarketplaceApplications) {
    if (!await db.issue.findUnique({ where: { id: app.issueId }, select: { id: true } }) ||
        !await db.user.findUnique({ where: { id: app.developerId }, select: { id: true } })) continue;
    const existing = await db.application.findUnique({
      where: {
        issueId_developerId: {
          issueId: app.issueId,
          developerId: app.developerId,
        },
      },
    });
    if (!existing) {
      addedApplications++;
      await db.application.create({
        data: {
          issueId: app.issueId,
          developerId: app.developerId,
          status: app.status,
          message: app.message,
          createdAt: app.createdAt,
        },
      });
    }
  }

  const totalUsers = await db.user.count();
  const totalIssues = await db.issue.count();
  const totalApplications = await db.application.count();
  const totalSubmissions = await db.submission.count();
  const totalReviews = await db.review.count();
  const totalComments = await db.issueComment.count();
  const totalMessages = await db.message.count();
  const totalNotifications = await db.notification.count();

  return {
    users: totalUsers,
    issues: totalIssues,
    applications: totalApplications,
    submissions: totalSubmissions,
    reviews: totalReviews,
    comments: totalComments,
    messages: totalMessages,
    notifications: totalNotifications,
    addedComments,
    addedApplications,
    addedAttachments,
  };
}

const isDirectRun = Boolean((import.meta as unknown as { main?: boolean }).main);

if (isDirectRun) {
  const dbName = guardDatabaseUrl(process.env.DATABASE_URL);
  console.log(`🌱 Starting demo database seeding for '${dbName}'...`);
  seedDemo(prisma)
    .then((summary) => {
      console.log("\n========================================================");
      console.log("🎉 Realistic Database Seeding Completed Successfully!");
      console.log("========================================================");
      console.log(`
  Summary of seeded records in '${dbName}':
    - Users:               ${summary.users}
    - Bounties:           ${summary.issues}
    - Applications:       ${summary.applications} (Newly added: ${summary.addedApplications})
    - Submissions:         ${summary.submissions}
    - Reviews:             ${summary.reviews}
    - Comments:            ${summary.comments} (Newly added: ${summary.addedComments})
    - Image Attachments:   (Newly added: ${summary.addedAttachments})
    - Messages:            ${summary.messages}
    - Notifications:       ${summary.notifications}
      `);
    })
    .catch((e) => {
      console.error("❌ Seeding failed:", e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
