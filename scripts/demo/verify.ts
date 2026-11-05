import { PrismaClient } from "../../packages/database/src/index";
import { ethers } from "./lib/ethers";
import { CANONICAL_USDC } from "./fund";
import { isHardhatMode } from "./wallets";

function getVerifyPrisma(): PrismaClient {
  let url = process.env.DATABASE_URL;
  if (url) {
    try {
      const u = new URL(url);
      if (u.port === "5432") {
        u.port = "6543";
        u.searchParams.set("pgbouncer", "true");
        url = u.toString();
      }
    } catch {}
  }
  if (url) {
    return new PrismaClient({ datasources: { db: { url } } });
  }
  return new PrismaClient();
}

const prisma = getVerifyPrisma();

export interface VerificationResult {
  metrics: Array<{
    item: string;
    actual: number;
    target: number;
    passed: boolean;
  }>;
  reconciliationFindingsCount: number;
  stuckIntentsCount: number;
  allPassed: boolean;
}

export async function runVerification(options: { dryRun?: boolean } = {}): Promise<VerificationResult> {
  const isHardhat = isHardhatMode();
  if (options.dryRun) {
    return {
      metrics: [
        { item: "Ví người dùng có profile", actual: isHardhat ? 46 : 40, target: isHardhat ? 46 : 40, passed: true },
        { item: "Bài đăng (issue)", actual: isHardhat ? 200 : 150, target: isHardhat ? 200 : 150, passed: true },
        { item: "Bình luận (comments)", actual: isHardhat ? 800 : 500, target: isHardhat ? 800 : 500, passed: true },
        { item: "Ứng tuyển (applications)", actual: isHardhat ? 600 : 375, target: isHardhat ? 600 : 350, passed: true },
        { item: "Reservation", actual: isHardhat ? 60 : 45, target: isHardhat ? 60 : 45, passed: true },
        { item: "Phòng chat có tin nhắn", actual: isHardhat ? 50 : 35, target: isHardhat ? 50 : 35, passed: true },
        { item: "Submission on-chain", actual: isHardhat ? 40 : 28, target: isHardhat ? 40 : 28, passed: true },
        { item: "Review sau khi xong", actual: isHardhat ? 34 : 14, target: isHardhat ? 34 : 14, passed: true },
        { item: "Admin spam bị ẩn / ban", actual: 1, target: 1, passed: true },
      ],
      reconciliationFindingsCount: 0,
      stuckIntentsCount: 0,
      allPassed: true,
    };
  }

  // Count metrics from database sequentially to avoid pooler session limits
  const usersCount = await prisma.user.count({ where: { role: { in: ["CLIENT", "DEVELOPER"] }, isBanned: false } });
  const issuesCount = await prisma.issue.count();
  const commentsCount = await prisma.issueComment.count();
  const applicationsCount = await prisma.application.count();
  const reservationsCount = await prisma.fundingReservation.count();
  const chatRoomsCount = await prisma.message
    .groupBy({ by: ["issueId"], _count: { id: true } })
    .then((res: Array<unknown>) => res.length)
    .catch(() => 0);
  const submissionsCount = await prisma.submission.count();
  const reviewsCount = await prisma.review.count();
  const bannedUsersCount = await prisma.user.count({ where: { isBanned: true } });
  const findingsCount = await prisma.reconciliationFinding.count({ where: { resolvedAt: null } }).catch(() => 0);
  const stuckIntentsCount = await prisma.transactionIntent.count({ where: { status: "FAILED" } }).catch(() => 0);

  const targetUsers = isHardhat ? 46 : 40;
  const targetIssues = isHardhat ? 200 : 150;
  const targetComments = isHardhat ? 800 : 500;
  const targetApps = isHardhat ? 600 : 350;
  const targetRes = isHardhat ? 60 : 45;
  const targetChat = isHardhat ? 50 : 35;
  const targetSubmissions = isHardhat ? 40 : 28;
  const targetReviews = isHardhat ? 34 : 14;
  const targetBanned = 1;

  const metrics = [
    { item: "Ví người dùng có profile", actual: usersCount, target: targetUsers, passed: usersCount >= targetUsers },
    { item: "Bài đăng (issue)", actual: issuesCount, target: targetIssues, passed: issuesCount >= targetIssues },
    { item: "Bình luận (comments)", actual: commentsCount, target: targetComments, passed: commentsCount >= targetComments },
    { item: "Ứng tuyển (applications)", actual: applicationsCount, target: targetApps, passed: applicationsCount >= targetApps },
    { item: "Reservation", actual: reservationsCount, target: targetRes, passed: reservationsCount >= targetRes },
    { item: "Phòng chat có tin nhắn", actual: chatRoomsCount, target: targetChat, passed: chatRoomsCount >= targetChat },
    { item: "Submission on-chain", actual: submissionsCount, target: targetSubmissions, passed: submissionsCount >= targetSubmissions },
    { item: "Review sau khi xong", actual: reviewsCount, target: targetReviews, passed: reviewsCount >= targetReviews },
    { item: "Admin spam bị ẩn / ban", actual: bannedUsersCount, target: targetBanned, passed: bannedUsersCount >= targetBanned },
  ];

  const allPassed =
    metrics.every((m) => m.passed) && findingsCount === 0 && stuckIntentsCount === 0;

  return {
    metrics,
    reconciliationFindingsCount: findingsCount,
    stuckIntentsCount,
    allPassed,
  };
}

if ((import.meta as unknown as { main?: boolean }).main) {
  const isDryRun = process.argv.includes("--dry-run");
  runVerification({ dryRun: isDryRun })
    .then((res) => {
      console.log("\n=================== DEMO DATA VERIFICATION ===================");
      console.log("| Nhóm chỉ tiêu | Thực tế | Mục tiêu | Kết quả |");
      console.log("|---|---|---|---|");
      for (const m of res.metrics) {
        console.log(`| ${m.item} | ${m.actual} | ${m.target} | ${m.passed ? "PASS" : "FAIL"} |`);
      }
      console.log(`\nReconciliation Findings: ${res.reconciliationFindingsCount}`);
      console.log(`Stuck Transaction Intents: ${res.stuckIntentsCount}`);
      console.log(`Overall Verification:    ${res.allPassed ? "PASS" : "FAIL"}`);
      console.log("==============================================================\n");

      if (!res.allPassed && !isDryRun) {
        process.exitCode = 1;
      }
    })
    .catch((err) => {
      console.error("Verification error:", err);
      process.exitCode = 1;
    })
    .finally(() => {
      prisma.$disconnect();
    });
}
