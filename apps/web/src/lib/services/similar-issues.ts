import { z } from "zod";
import { createNotificationIdempotent, type PrismaClient } from "@bloody-roar/database";
import { completeAI, isAIConfigured, parseAIJson } from "../../ai/model-router";
import { scanAndMask } from "../../ai/guard/scanner";
import { rateLimit } from "../rate-limit";
import { createLogger } from "../logger";

const log = createLogger("similar-issues");

export const SIMILARITY_MIN_SCORE = 0.8;
const MAX_CANDIDATES = 5;

const MatchesSchema = z.object({
  matches: z.array(z.object({ issueId: z.string(), score: z.number().min(0).max(1), reason: z.string() })),
});

type Candidate = { id: string; title: string; description: string; developerId: string };

export async function findSimilarCandidates(db: PrismaClient, issue: { id: string; title: string; description: string; clientId: string; requiredSkills: string[] }) {
  if (!issue.requiredSkills.length) return [];
  return db.$queryRaw<Candidate[]>`
    WITH q AS (
      SELECT to_tsquery('simple', array_to_string(ARRAY(
        SELECT quote_literal(word) FROM unnest(tsvector_to_array(to_tsvector('english', ${`${issue.title} ${issue.description.slice(0, 2000)}`}))) AS word
      ), ' | ')) AS query
    )
    SELECT i.id, i.title, i.description, i."developerId"
    FROM issues i, q
    WHERE i.status = 'COMPLETED' AND i."developerId" IS NOT NULL AND i.id <> ${issue.id}
      AND i."clientId" <> ${issue.clientId} AND i."developerId" <> ${issue.clientId}
      AND i."hiddenAt" IS NULL
      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = i."developerId" AND u."isBanned")
      AND i."requiredSkills" && ${issue.requiredSkills}::text[]
      AND to_tsvector('english', i.title || ' ' || i.description) @@ q.query
    ORDER BY ts_rank(to_tsvector('english', i.title || ' ' || i.description), q.query) DESC, i.id
    LIMIT ${MAX_CANDIDATES}`;
}

export async function detectSimilarIssues(
  db: PrismaClient,
  issueId: string,
  user: { id: string; role: string },
  complete: typeof completeAI = completeAI,
) {
  const issue = await db.issue.findUnique({ where: { id: issueId }, select: { id: true, title: true, description: true, clientId: true, requiredSkills: true } });
  if (!issue) return;
  const candidates = await findSimilarCandidates(db, issue);
  if (!candidates.length || !isAIConfigured("SIMILARITY")) return;
  if (!rateLimit(`similar:${user.id}`, { limit: 20, windowMs: 3_600_000 }).ok) {
    log.debug({ issueId }, "Similarity rate limit reached");
    return;
  }

  const content = scanAndMask(JSON.stringify({
    newIssue: { title: issue.title, description: issue.description },
    candidates: candidates.map((c) => ({ issueId: c.id, title: c.title, description: c.description })),
  })).content;
  const completion = await complete({ task: "SIMILARITY", issueId: issue.id, jsonMode: true, maxTokens: 800, messages: [
    { role: "system", content: 'Decide which candidate issues describe the same problem as newIssue, so the earlier fix could be reused. Return JSON only: {"matches":[{"issueId":string,"score":number between 0 and 1,"reason":string}]}. Omit unrelated candidates.' },
    { role: "user", content },
  ] });
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const matches = MatchesSchema.parse(parseAIJson(completion.text)).matches
    .filter((m) => m.score >= SIMILARITY_MIN_SCORE && byId.has(m.issueId));

  for (const match of matches) {
    const old = byId.get(match.issueId)!;
    await db.issueSimilarity.createMany({ data: [{ issueId: issue.id, similarIssueId: old.id, developerId: old.developerId, score: match.score }], skipDuplicates: true });
    await createNotificationIdempotent(db, {
      userId: old.developerId,
      type: "SIMILAR_ISSUE_POSTED",
      title: "Similar issue posted",
      body: `A new bounty looks like an issue you fixed: "${old.title}".`,
      link: `/issues/${issue.id}`,
      data: { issueId: issue.id },
      dedupeKey: `similar:${issue.id}:${old.id}`,
    });
  }
}

export function detectSimilarIssuesInBackground(db: PrismaClient, issueId: string, user: { id: string; role: string }) {
  void detectSimilarIssues(db, issueId, user).catch((error) => log.warn({ error, issueId }, "Similar issue detection skipped"));
}
