# US-39 (S-605): developer submission flow

Branch `feat/US-39-dev-submission-flow` from `origin/main`. Frontend only: no API, schema or contract change.

## What the code does today

| Ticket item | Current code | Gap |
| --- | --- | --- |
| U-2 raw ids | `TestRunPanel` prints `testCaseId: passed` and `SUBMISSION: PASSED` | Show the criterion title and plain status text |
| W-5 polling | `TestRunPanel` polls every 5 s forever | Poll only while the latest run is `QUEUED` or `RUNNING` |
| U-3 stale pass | `issue-detail-view.tsx` already resets `draftId` and `testsPassed` when any input changes | Also reset on every save; Prepare is enabled only by a `PASSED` run of the current draft |
| U-4 silent stop | `awaitChain` polls 30 × 4 s, then hides the banner without a word | Shared transaction status reads the intent status from `myTransactions` and keeps showing it |
| Four steps | One "Submit for review" button saves, prepares and signs | Upload → Run tests → Prepare → Sign, with a "cannot edit after signing" warning |

## Changes

1. `components/issues/test-run-panel.tsx`: titles from `testCases(issueId)`, status labels, poll only while active.
2. New `components/escrow/transaction-status.tsx`: polls `myTransactions`, maps `IntentStatus` to five states (waiting for signature, sent, waiting for safe block, confirmed, failed). `EXPIRED` and `DROPPED` count as failed and show `failureReason`.
3. `issue-detail-view.tsx`: four-step delivery form using `.stepper`; Prepare calls `prepareSubmitWork`; Sign calls `sendPreparedCalls`. Submit, deposit and release show the shared transaction status.
4. `ui-e2e/e32-ui-flow.test.ts`: click "Prepare submission" before "Submit for review".

## Tests (written first)

- `test-run-panel.test.tsx`: titles, labels, no polling after a finished run.
- `transaction-status.test.tsx`: each status label, polling continues past two minutes until a final state, failure reason shown.
- `submission-steps.test.tsx`: Prepare locked until tests pass; editing after a pass locks it again; Sign sends the prepared call.

- `escrow-transaction-reuse.test.tsx`: funding and release both show the shared status; a release still unconfirmed after 130 s keeps showing "Sent".

## U-4 reproduction

Ran the same test against a temporary copy of `origin/main`'s `issue-detail-view.tsx`: "Waiting for chain confirmation" shows right after Approve delivery and is gone after 130 s while the release is still unconfirmed. The copy was deleted afterwards.

## Risks

- US-37 (panel split) is still To Do and touches the same file. Keep the delivery changes inside the existing delivery block so the split can move it as one piece.
- The US-158 branch also edits `issue-detail-view.tsx` (header and sidebar only); expect a small merge.
