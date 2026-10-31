// packages/database/src/seed-demo.ts
// Extensive realistic demo seed script for Bloody-Roar Bounty Marketplace
// Usage: bun run src/seed-demo.ts

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
}

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
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname)) {
    throw new Error("DATABASE_URL must point to localhost or 127.0.0.1");
  }
  const dbName = decodeURIComponent(parsed.pathname.slice(1));
  if (dbName !== "bloody_codex_local" && !dbName.endsWith("_test")) {
    throw new Error(`Database name '${dbName}' is not bloody_codex_local or ending in _test`);
  }
  return dbName;
}

export async function seedDemo(db: PrismaClient): Promise<SeedDemoSummary> {
  const chainId = Number(process.env.CHAIN_ID ?? "31337");
  const usdc = await db.token.findFirst({
    where: {
      chainId,
      symbol: "USDC",
      isActive: true,
    },
  });
  if (!usdc) {
    throw new Error(`Chưa có token USDC cho chain ${chainId}. Chạy deploy local và db:seed trước.`);
  }

  // -------------------------------------------------------------------------
  // 1. Users (Admin, 3 Clients, 4 Developers)
  // -------------------------------------------------------------------------
  const admin = await db.user.upsert({
    where: { walletAddress: "0x000000000000000000000000000000000000dead" },
    update: {},
    create: {
      walletAddress: "0x000000000000000000000000000000000000dead",
      role: UserRole.ADMIN,
      name: "Bloody-Roar Arbiter",
      email: "arbiter@bloody-roar.dev",
      bio: "Chief Protocol Arbiter & Governance Committee. Handling escalated escrow disputes with cryptographic proof validation.",
      skills: ["Arbitration", "Protocol Governance", "EVM Forensics", "Formal Verification"],
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    },
  });

  const clientAlice = await db.user.upsert({
    where: { walletAddress: "0x1111111111111111111111111111111111111111" },
    update: {},
    create: {
      walletAddress: "0x1111111111111111111111111111111111111111",
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
    where: { walletAddress: "0x3333333333333333333333333333333333333333" },
    update: {},
    create: {
      walletAddress: "0x3333333333333333333333333333333333333333",
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
    where: { walletAddress: "0x5555555555555555555555555555555555555555" },
    update: {},
    create: {
      walletAddress: "0x5555555555555555555555555555555555555555",
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
    where: { walletAddress: "0x2222222222222222222222222222222222222222" },
    update: {},
    create: {
      walletAddress: "0x2222222222222222222222222222222222222222",
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
    where: { walletAddress: "0x4444444444444444444444444444444444444444" },
    update: {},
    create: {
      walletAddress: "0x4444444444444444444444444444444444444444",
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
    where: { walletAddress: "0x6666666666666666666666666666666666666666" },
    update: {},
    create: {
      walletAddress: "0x6666666666666666666666666666666666666666",
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
    where: { walletAddress: "0x8888888888888888888888888888888888888888" },
    update: {},
    create: {
      walletAddress: "0x8888888888888888888888888888888888888888",
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
    await db.message.upsert({
      where: { id: msg.id },
      update: { content: msg.content },
      create: msg,
    });
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

  return {
    users: 8,
    issues: 12,
    applications: applicationsData.length,
    submissions: submissionsData.length,
    reviews: reviewsData.length,
    comments: commentsData.length,
    messages: messagesData.length,
    notifications: notificationsData.length,
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
    - Users:         ${summary.users} (1 Admin, 3 Clients, 4 Developers)
    - Bounties:     ${summary.issues} (9 OPEN, 0 IN_PROGRESS, 3 COMPLETED)
    - Applications: ${summary.applications} verified proposals
    - Submissions:   ${summary.submissions} complete delivery records
    - Reviews:       ${summary.reviews} genuine 5-star reviews with testimonials
    - Comments:      ${summary.comments} technical discussion threads
    - Messages:      ${summary.messages} direct messaging dialogues
    - Notifications: ${summary.notifications} user alerts
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
