import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createNotificationIdempotent } from "@bloody-roar/database";
import { executableCases, submissionPatch, testBundleSha256 } from "@bloody-roar/shared/test-runner";
import { sensitiveSourceFile } from "@bloody-roar/shared/source-privacy";
import { readAttachment } from "../storage";
import { runInSandbox } from "../runner/sandbox";
import { notifyNotificationCreated } from "../indexer/notify";
import type { Job } from "../runtime/scheduler";

export const testRunsJob: Job = {
  name: "test-runs", everyMs: 5_000,
  async run({ db, config, now, log }) {
    if (!config.testRunnerEnabled) return;
    // Allow the five-minute install and ten-minute test timeout, plus five minutes for recovery.
    await db.testRun.updateMany({ where: { status: "RUNNING", startedAt: { lt: new Date(now().getTime() - 20 * 60_000) } }, data: { status: "ERROR", log: "worker lost", finishedAt: now() } });
    const run = await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM test_runs WHERE status = 'QUEUED' ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1`;
      return rows[0] ? tx.testRun.update({ where: { id: rows[0].id }, data: { status: "RUNNING", startedAt: now() } }) : null;
    });
    if (!run) return;
    const temp = await mkdtemp(path.join(tmpdir(), "br-patch-"));
    try {
      const source = await db.sourceSnapshot.findUnique({ where: { issueId: run.issueId } });
      const cases = await executableCases(db, run.issueId, run.kind === "SUBMISSION");
      if (!source?.storagePath || !source.framework || source.status !== "READY") throw new Error("Source is not ready");
      if (!cases.length || testBundleSha256(cases) !== run.bundleSha256) throw new Error("Criteria changed");
      if (createHash("sha256").update(await readFile(source.storagePath)).digest("hex") !== source.sha256) throw new Error("Source checksum mismatch");
      let patchPath: string | undefined;
      if (run.kind === "SUBMISSION") {
        const submission = await db.submission.findUnique({ where: { id: run.submissionId ?? "" } });
        if (!submission || submission.status !== "DRAFT" || submission.issueId !== run.issueId) throw new Error("Draft changed");
        const patch = await submissionPatch(db, submission);
        if (!patch || patch.sha256 !== run.patchSha256) throw new Error("No patch file");
        const bytes = await readAttachment(patch.fileUrl);
        if (createHash("sha256").update(bytes).digest("hex") !== run.patchSha256) throw new Error("Patch checksum mismatch");
        const additions = Buffer.from(bytes).toString("utf8").split(/\r?\n/)
          .filter((line) => line.startsWith("+") && !line.startsWith("+++ ")).map((line) => line.slice(1))
          .filter((line) => sensitiveSourceFile("", line) && /["'][\w+/=-]{16,}["']|[:=]\s*[\w+/=-]{16,}\s*$/.test(line));
        if (additions.length) {
          log.warn({ runId: run.id, code: "PATCH_CONTAINS_SECRET", pattern: "source-privacy:credential-assignment" }, "patch rejected");
          throw new Error("PATCH_CONTAINS_SECRET source-privacy:credential-assignment");
        }
        patchPath = path.join(temp, "submission.patch"); await writeFile(patchPath, bytes);
      }
      const result = await runInSandbox({ snapshotPath: source.storagePath, ...(patchPath ? { patchPath } : {}), files: cases.map((c) => ({ id: c.id, path: c.testFilePath ?? "", code: c.testCode! })), framework: source.framework, installCommand: source.installCommand ?? "" });
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM issues WHERE id = ${run.issueId} FOR UPDATE`;
        const currentSource = await tx.sourceSnapshot.findUnique({ where: { issueId: run.issueId } });
        const currentCases = await executableCases(tx, run.issueId, run.kind === "SUBMISSION");
        if (currentSource?.sha256 !== source.sha256 || testBundleSha256(currentCases) !== run.bundleSha256) throw new Error("Criteria or source changed");
        const changed = await tx.testRun.updateMany({ where: { id: run.id, status: "RUNNING" }, data: { status: result.status.toUpperCase() as "PASSED" | "FAILED" | "ERROR" | "TIMEOUT", results: result.results, log: result.log, finishedAt: now() } });
        if (!changed.count) return;
        if (run.kind === "BASE_CHECK") {
          for (const item of cases) {
            const status = result.status === "error" || result.status === "timeout" ? null : result.results.find((r) => r.testCaseId === item.id && r.message !== "No result")?.status ?? null;
            await tx.testCase.update({ where: { id: item.id }, data: { baseStatus: status } });
          }
        }
        const issue = await tx.issue.findUniqueOrThrow({ where: { id: run.issueId }, select: { clientId: true, developerId: true } });
        const userId = run.kind === "BASE_CHECK" ? issue.clientId : issue.developerId;
        if (userId) {
          const notification = await createNotificationIdempotent(tx, { userId, type: "TEST_RUN_FINISHED", title: "Test run finished", body: `${run.kind}: ${result.status}`, link: `/issues/${run.issueId}`, dedupeKey: `test-run:${run.id}`, data: { issueId: run.issueId, testRunId: run.id } });
          if (notification) await notifyNotificationCreated(tx, { userId, id: notification.id });
        }
      });
    } catch (error) {
      await db.testRun.updateMany({ where: { id: run.id, status: "RUNNING" }, data: { status: "ERROR", log: String(error instanceof Error ? error.message : error).slice(-20_000), finishedAt: now() } });
    } finally { await rm(temp, { recursive: true, force: true }); }
  },
};
