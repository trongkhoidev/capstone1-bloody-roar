// packages/database/src/seed.ts
// Seed the database with admin user and sample data for development
// Usage: bun run db:seed

import { prisma, UserRole, IssueCategory, IssueStatus } from "./index";

async function main() {
  console.log("🌱 Seeding database...");

  // -----------------------------------------------------------------------
  // 1. Admin user
  // -----------------------------------------------------------------------
  const admin = await prisma.user.upsert({
    where: { walletAddress: "0x000000000000000000000000000000000000dead" },
    update: {},
    create: {
      walletAddress: "0x000000000000000000000000000000000000dead",
      role: UserRole.ADMIN,
      name: "Bloody-Roar Admin",
      email: "admin@bloody-roar.dev",
      bio: "Platform administrator and arbiter",
      skills: ["Administration", "Dispute Resolution"],
    },
  });
  console.log(`✅ Admin user: ${admin.id}`);

  // -----------------------------------------------------------------------
  // 2. Sample Client
  // -----------------------------------------------------------------------
  const client = await prisma.user.upsert({
    where: { walletAddress: "0x1111111111111111111111111111111111111111" },
    update: {},
    create: {
      walletAddress: "0x1111111111111111111111111111111111111111",
      role: UserRole.CLIENT,
      name: "Alice (Client)",
      email: "alice@example.com",
      bio: "CTO at a Web3 startup. Looking for skilled developers.",
      skills: ["Product Management", "Web3"],
    },
  });
  console.log(`✅ Client user: ${client.id}`);

  // -----------------------------------------------------------------------
  // 3. Sample Developer
  // -----------------------------------------------------------------------
  const developer = await prisma.user.upsert({
    where: { walletAddress: "0x2222222222222222222222222222222222222222" },
    update: {},
    create: {
      walletAddress: "0x2222222222222222222222222222222222222222",
      role: UserRole.DEVELOPER,
      name: "Bob (Developer)",
      email: "bob@example.com",
      bio: "Full-stack Web3 developer. React + Solidity + TypeScript.",
      skills: ["React", "TypeScript", "Solidity", "Next.js", "GraphQL"],
      githubUsername: "bob-dev",
      isGithubVerified: true,
      reputationScore: 4.8,
      completedTaskCount: 12,
    },
  });
  console.log(`✅ Developer user: ${developer.id}`);

  // -----------------------------------------------------------------------
  // 3.5. Supported Token (whitelist)
  // -----------------------------------------------------------------------
  const usdc = await prisma.token.upsert({
    where: {
      chainId_address: {
        chainId: 84532,
        address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      },
    },
    update: {},
    create: {
      symbol: "USDC",
      name: "USD Coin",
      address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      decimals: 6,
      chainId: 84532,
      isActive: true,
      sortOrder: 1,
    },
  });
  console.log(`✅ Token: ${usdc.symbol} (${usdc.chainId})`);

  // -----------------------------------------------------------------------
  // 4. Sample Issues (Bounties)
  // -----------------------------------------------------------------------
  const issue1 = await prisma.issue.upsert({
    where: { id: "sample-issue-001" },
    update: {},
    create: {
      id: "sample-issue-001",
      title: "Fix React upload crash when file > 5MB",
      description: `## Bug Report

When a user tries to upload an image larger than 5MB, the application crashes with:

\`\`\`
TypeError: Cannot read properties of undefined (reading 'size')
  at FileUploadComponent.handleChange (FileUpload.tsx:42)
\`\`\`

## Expected Behavior
Show a user-friendly error message and prevent the upload.

## Acceptance Criteria
- [ ] Error message shown when file exceeds 5MB
- [ ] No application crash
- [ ] Toast notification displayed
- [ ] Unit test added`,
      category: IssueCategory.BUG_FIX,
      status: IssueStatus.OPEN,
      bountyAmount: 200,
      tokenId: usdc.id,
      requiredSkills: ["React", "TypeScript"],
      difficulty: "Easy",
      timeEstimate: "1-2 days",
      clientId: client.id,
    },
  });
  console.log(`✅ Issue 1: ${issue1.id}`);

  const issue2 = await prisma.issue.upsert({
    where: { id: "sample-issue-002" },
    update: {},
    create: {
      id: "sample-issue-002",
      title: "Implement ERC-20 token vesting contract",
      description: `## Feature Request

Build a Solidity smart contract for token vesting with the following specs:

- Cliff period: configurable (default 6 months)
- Vesting duration: configurable (default 24 months)  
- Linear vesting after cliff
- Emergency pause by owner
- Full test coverage (>80%)

## Tech Stack
- Solidity 0.8.24
- Hardhat + Chai
- OpenZeppelin v5`,
      category: IssueCategory.SMART_CONTRACT,
      status: IssueStatus.OPEN,
      bountyAmount: 800,
      tokenId: usdc.id,
      requiredSkills: ["Solidity", "Hardhat", "OpenZeppelin"],
      difficulty: "Hard",
      timeEstimate: "5-7 days",
      clientId: client.id,
    },
  });
  console.log(`✅ Issue 2: ${issue2.id}`);

  const issue3 = await prisma.issue.upsert({
    where: { id: "sample-issue-003" },
    update: {},
    create: {
      id: "sample-issue-003",
      title: "Build responsive pricing page (Figma → Next.js)",
      description: `## Task

Convert the Figma design to a pixel-perfect, responsive pricing page.

**Figma link:** [TODO — attach in real task]

### Requirements
- 3 pricing tiers (Free, Pro, Enterprise)
- Annual / Monthly toggle with smooth animation
- Mobile-first, responsive (3 breakpoints)
- Shadcn/ui components
- Framer Motion entrance animations`,
      category: IssueCategory.UI_UX,
      status: IssueStatus.IN_PROGRESS,
      bountyAmount: 350,
      tokenId: usdc.id,
      requiredSkills: ["Next.js", "Tailwind CSS", "Framer Motion", "shadcn/ui"],
      difficulty: "Medium",
      timeEstimate: "2-3 days",
      clientId: client.id,
      developerId: developer.id,
      assignedAt: new Date(),
    },
  });
  console.log(`✅ Issue 3: ${issue3.id} (assigned)`);

  const demoIssues = [
    {
      id: "sample-issue-004",
      title: "Audit a bridge relayer for replay and signature risks",
      description: `## Security review\n\nReview the bridge relayer's message validation and signer rotation. Add a short threat model and tests for replayed messages, expired signatures, and incorrect chain identifiers.\n\n## Acceptance criteria\n- Verify signatures against the configured domain and chain\n- Reject reused message nonces\n- Add regression tests for each reported issue`,
      category: IssueCategory.AUDIT,
      status: IssueStatus.OPEN,
      bountyAmount: 1250,
      requiredSkills: ["Solidity", "Security", "EIP-712"],
      difficulty: "Hard",
      timeEstimate: "4-6 days",
      viewCount: 286,
      developerId: null,
    },
    {
      id: "sample-issue-005",
      title: "Build a responsive developer analytics dashboard",
      description: `## Design task\n\nCreate a responsive dashboard for developer activity with bounty history, earned rewards, reputation, and verified credentials. Include empty, loading, and error states.\n\nA design reference image is attached. Use the existing Tailwind tokens and accessible chart colors.`,
      category: IssueCategory.UI_UX,
      status: IssueStatus.OPEN,
      bountyAmount: 650,
      requiredSkills: ["React", "Next.js", "Data visualization"],
      difficulty: "Medium",
      timeEstimate: "3-4 days",
      viewCount: 192,
      developerId: null,
    },
    {
      id: "sample-issue-006",
      title: "Write an integration guide for the TypeScript SDK",
      description: `Document the quickest path from API key to the first signed request. Include setup, environment configuration, a working example, error handling, and a troubleshooting section.\n\nThe guide should be reviewed by a developer unfamiliar with the SDK.`,
      category: IssueCategory.DOCUMENTATION,
      status: IssueStatus.OPEN,
      bountyAmount: 180,
      requiredSkills: ["Technical writing", "TypeScript", "API documentation"],
      difficulty: "Easy",
      timeEstimate: "1-2 days",
      viewCount: 74,
      developerId: null,
    },
    {
      id: "sample-issue-007",
      title: "Add contract tests for paused and expired escrow flows",
      description: `## Scope\n\nExtend the Hardhat test suite for escrow pause recovery and expired milestone claims. Keep each case isolated and assert both emitted events and final token balances.`,
      category: IssueCategory.SMART_CONTRACT,
      status: IssueStatus.IN_PROGRESS,
      bountyAmount: 420,
      requiredSkills: ["Solidity", "Hardhat", "Chai"],
      difficulty: "Medium",
      timeEstimate: "2-3 days",
      viewCount: 143,
      developerId: developer.id,
    },
    {
      id: "sample-issue-008",
      title: "Fix duplicate GraphQL requests in the marketplace filters",
      description: `The marketplace fires repeated requests while several filters change in quick succession. Cancel stale requests, keep pagination consistent, and show a useful loading state without clearing the current results.`,
      category: IssueCategory.BUG_FIX,
      status: IssueStatus.OPEN,
      bountyAmount: 320,
      requiredSkills: ["GraphQL", "React", "TypeScript"],
      difficulty: "Medium",
      timeEstimate: "2 days",
      viewCount: 118,
      developerId: null,
    },
  ];

  for (const sample of demoIssues) {
    await prisma.issue.upsert({
      where: { id: sample.id },
      update: {},
      create: {
        ...sample,
        tokenId: usdc.id,
        clientId: client.id,
        ...(sample.developerId ? { assignedAt: new Date() } : {}),
      },
    });
  }
  console.log(`✅ Added ${demoIssues.length} demo issues`);

  const demoAttachments = [
    { id: "sample-image-contract", issueId: "sample-issue-004", fileName: "bridge-security-review.svg", fileUrl: "/demo/bridge-security-review.svg", fileSize: 1540 },
    { id: "sample-image-dashboard", issueId: "sample-issue-005", fileName: "developer-dashboard-reference.svg", fileUrl: "/demo/developer-dashboard-reference.svg", fileSize: 1760 },
    { id: "sample-image-escrow", issueId: "sample-issue-007", fileName: "escrow-test-flow.svg", fileUrl: "/demo/escrow-test-flow.svg", fileSize: 1420 },
  ];

  for (const attachment of demoAttachments) {
    await prisma.attachment.upsert({
      where: { id: attachment.id },
      update: {},
      create: { ...attachment, fileMime: "image/svg+xml", uploaderId: client.id },
    });
  }
  console.log(`✅ Added ${demoAttachments.length} demo preview images`);

  const demoComments = [
    { id: "sample-comment-001", issueId: issue1.id, userId: developer.id, body: "I can reproduce this with a 6MB PNG on Safari. Is the 5MB limit expected to apply to SVG files too?" },
    { id: "sample-comment-002", issueId: issue1.id, userId: client.id, body: "Yes, please validate the same 5MB limit for all uploaded image formats." },
    { id: "sample-comment-003", issueId: "sample-issue-004", userId: developer.id, body: "I will include a replay test and check whether the chain ID is part of the signed domain." },
    { id: "sample-comment-004", issueId: "sample-issue-005", userId: client.id, body: "Please make the reputation and credential section visible without scrolling on desktop." },
    { id: "sample-comment-005", issueId: "sample-issue-007", userId: developer.id, body: "The paused-state cases are in progress; I will add balance assertions for both release and refund." },
  ];

  for (const comment of demoComments) {
    await prisma.issueComment.upsert({
      where: { id: comment.id },
      update: {},
      create: comment,
    });
  }
  console.log(`✅ Added ${demoComments.length} demo comments`);

  // -----------------------------------------------------------------------
  // 5. Sample Application
  // -----------------------------------------------------------------------
  await prisma.application.upsert({
    where: {
      issueId_developerId: {
        issueId: issue1.id,
        developerId: developer.id,
      },
    },
    update: {},
    create: {
      issueId: issue1.id,
      developerId: developer.id,
      message:
        "I have 3 years of React experience and have fixed similar upload issues before. I can deliver in 1 day.",
    },
  });
  console.log(`✅ Application created`);

  // -----------------------------------------------------------------------
  // 6. Sample Messages
  // -----------------------------------------------------------------------
  const messages = [
    {
      id: "sample-message-001",
      content: "Hi! I've been assigned to your task. Let me start investigating.",
      senderId: developer.id,
    },
    {
      id: "sample-message-002",
      content: "Great! Let me know if you need access to our staging environment.",
      senderId: client.id,
    },
    {
      id: "sample-message-003",
      content:
        "Found the issue — the FileReader callback doesn't check file.size before reading. Fix incoming.",
      senderId: developer.id,
    },
  ];

  for (const msg of messages) {
    await prisma.message.upsert({
      where: { id: msg.id },
      update: {},
      create: { ...msg, issueId: issue3.id },
    });
  }
  console.log(`✅ Sample messages created`);

  console.log("\n🎉 Database seeded successfully!");
  console.log(`
  Users created:
    - Admin:     ${admin.walletAddress}
    - Client:    ${client.walletAddress}
    - Developer: ${developer.walletAddress}
  
  Issues created:
    - ${issue1.id}: "${issue1.title}" (OPEN)
    - ${issue2.id}: "${issue2.title}" (OPEN)
    - ${issue3.id}: "${issue3.title}" (IN_PROGRESS)
    - ${demoIssues.length} additional sample bounties, ${demoAttachments.length} image previews, ${demoComments.length} discussion comments
  `);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
