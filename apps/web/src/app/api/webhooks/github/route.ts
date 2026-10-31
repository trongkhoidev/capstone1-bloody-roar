import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createNotificationIdempotent, PRState } from "@bloody-roar/database";
import { prisma } from "@bloody-roar/database";

export const dynamic = "force-dynamic";

type GitHubPullRequestEvent = {
  action?: string;
  repository?: { html_url?: string };
  pull_request?: { html_url?: string; number?: number; state?: string; merged?: boolean; merged_at?: string | null; head?: { sha?: string } };
};

function verifySignature(raw: Buffer, signature: string | null, secret: string) {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`);
  const actual = Buffer.from(signature);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export async function POST(request: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "GitHub webhook is not configured" }, { status: 503 });
  const raw = Buffer.from(await request.arrayBuffer());
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), secret)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }
  // GitHub redelivers payloads; the delivery id makes a repeat a no-op. GitHub sends no timestamp header, so there is no clock-skew check.
  const deliveryId = request.headers.get("x-github-delivery");
  if (!deliveryId) return NextResponse.json({ error: "Missing delivery id" }, { status: 400 });
  const { count } = await prisma.githubWebhookDelivery.createMany({ data: [{ deliveryId }], skipDuplicates: true });
  if (count === 0) return NextResponse.json({ duplicate: true });
  try {
    if (request.headers.get("x-github-event") !== "pull_request") return NextResponse.json({ received: true, ignored: true });

    let event: GitHubPullRequestEvent;
    try { event = JSON.parse(raw.toString("utf8")) as GitHubPullRequestEvent; }
    catch { return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 }); }

    const pr = event.pull_request;
    const prUrl = pr?.html_url;
    const repoUrl = event.repository?.html_url?.replace(/\/$/, "");
    if (!prUrl || !repoUrl || !Number.isInteger(pr?.number)) return NextResponse.json({ error: "Pull request payload is incomplete" }, { status: 400 });

    const action = event.action;
    if (!["opened", "synchronize", "reopened", "closed"].includes(action ?? "")) return NextResponse.json({ received: true, ignored: true });
    const prState = action === "closed" ? (pr.merged ? PRState.MERGED : PRState.CLOSED) : PRState.OPEN;
    const submission = await prisma.submission.findFirst({
      where: { pullRequestUrl: { equals: prUrl, mode: "insensitive" } },
      orderBy: { submittedAt: "desc" },
      select: { id: true, issue: { select: { id: true, title: true, clientId: true, githubRepo: true } } },
    });
    const normalizeRepo = (value: string | null | undefined) => {
      if (!value) return null;
      try {
        const parsed = new URL(value);
        return `${parsed.hostname}${parsed.pathname.replace(/\.git\/?$/, "").replace(/\/$/, "")}`.toLowerCase();
      } catch { return null; }
    };
    if (!submission || normalizeRepo(submission.issue.githubRepo) !== normalizeRepo(repoUrl)) {
      return NextResponse.json({ received: true, matched: false });
    }

    await prisma.submission.update({
      where: { id: submission.id },
      data: {
        prNumber: pr!.number!,
        prState,
        ...(prState === PRState.MERGED && pr?.merged_at ? { mergedAt: new Date(pr.merged_at) } : {}),
      },
    });

    // Tells the client to confirm the work on the platform; nothing here touches funds.
    if (prState === PRState.MERGED) {
      await createNotificationIdempotent(prisma, {
        userId: submission.issue.clientId,
        type: "PR_MERGED",
        title: "Pull request đã được merge",
        body: `PR #${pr!.number} của bài ${submission.issue.title} đã merge. Kiểm tra và xác nhận trên hệ thống.`,
        link: `/issues/${submission.issue.id}`,
        data: { issueId: submission.issue.id, prUrl },
        dedupeKey: `pr-merged:${submission.issue.id}:${pr!.number}`,
      });
    }

    return NextResponse.json({ received: true, matched: true, prState });
  } catch (error) {
    // Forget the delivery so GitHub's redelivery is processed instead of reported as a duplicate.
    await prisma.githubWebhookDelivery.delete({ where: { deliveryId } }).catch(() => undefined);
    throw error;
  }
}
