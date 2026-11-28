# US-38 (S-604): client review screen

Branch `feat/US-38-client-review`, stacked on `feat/US-39-dev-submission-flow` (PR #55) because it reuses `TransactionStatus`. After #55 merges, merge `main` so the PR shows only US-38. Frontend only.

## Facts checked before coding

- `main` already has `prepareReleaseFunds(issueId, deliveryHash)` and throws `DELIVERY_CHANGED` (`release.module.ts:79`). The argument is `deliveryHash`, not `reviewedDeliveryHash` as the ticket says, so US-13 does not block this.
- The submissions query already returns `deliveryHash`.
- US-37 (panel split) is still To Do. Changes stay inside the existing Deliveries block.
- Fee: `PLATFORM_FEE_BPS` = 10%, paid by the client on top of the bounty. The ticket's 2.5% is outdated.
- `escrow:invalidate` only called `load()`, which does not refetch submissions, so a new version never reached the client's screen.

## Changes (`issue-detail-view.tsx`)

| Ticket item | Change |
| --- | --- |
| Full hash and the tests of that delivery | Each delivery shows `deliveryHash` in full above its own `TestRunPanel` |
| Disclaimer | "Automated checks are a signal, not a guarantee." under each test result |
| Confirm before release | "Release" opens a dialog: short hash, developer receives, platform fee (10%), paid from escrow. Only "Confirm release" calls `prepareReleaseFunds` |
| Send the reviewed hash | The dialog keeps the delivery it was opened for and sends that `deliveryHash` |
| New version | `DELIVERY_CHANGED`, or a newer delivery after `escrow:invalidate`, shows "The developer submitted a new version. Review it before releasing." and locks Release until "Open the new version" |
| Request changes | "Change requests are saved on Bloody-Roar only. Nothing is sent on-chain." |
| Transaction status | Release already goes through the shared `TransactionStatus` (US-39) |

The dialog reuses the `.modal` / `.mh` / `.mb` classes from `connect-modal.tsx` and `.kv` from the design system.

## Tests

- `client-review.test.tsx`, written first:
  - Full hashes, per-delivery checks, disclaimer.
  - Exact amounts for a 100 USDC bounty: developer 100, fee 10 (10%), paid from escrow 110.
  - Release sends the hash on screen.
  - Cancel sends nothing.
  - `DELIVERY_CHANGED` locks Release, then unlocks after "Open the new version" and releases the new hash.
  - A socket update locks Release.
  - Off-chain note for Request changes.
- Renamed "Approve delivery" to "Release" (plus "Confirm release") in `escrow-transaction-reuse`, `issue-checks-warning` and the E32 UI flow.
