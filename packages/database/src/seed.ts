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
      content: "Hi! I've been assigned to your task. Let me start investigating.",
      senderId: developer.id,
    },
    {
      content: "Great! Let me know if you need access to our staging environment.",
      senderId: client.id,
    },
    {
      content:
        "Found the issue — the FileReader callback doesn't check file.size before reading. Fix incoming.",
      senderId: developer.id,
    },
  ];

  for (const msg of messages) {
    await prisma.message.create({
      data: {
        ...msg,
        issueId: issue3.id,
      },
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
  `);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
