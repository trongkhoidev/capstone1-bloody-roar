# Escrow integration

`apps/contracts/contracts/BloodyRoarEscrow.sol` defines the escrow protocol.
The participant ABI is exported from `packages/shared/src/escrow-abi.ts`.
The E2E script compares every exported signature with the compiled artifact.

## Setup

Generate Prisma/Pothos types with `bun run db:generate`, then apply the Prisma
migrations to your development database with `bun run db:migrate`. The
`20261001190000_escrow_contract_alignment` migration adds the on-chain phases,
terms, settlement fields and dispute deadlines. It preserves existing records;
old 30-day timeout dates are cleared because they do not describe this contract.
The `20261001200000_escrow_event_identity` migration replaces global transaction
hash uniqueness with `(chainId, contract, txHash, logIndex)` so a Safe batch can
confirm multiple escrow events. Legacy rows without an event cursor require
chain reconciliation before new confirmations; migrations do not migrate
funds or recover history from an old deployment.

Configure `BASE_SEPOLIA_RPC_URL`, `ESCROW_CONTRACT_ADDRESS_BASE_SEPOLIA`,
`ESCROW_CHAIN_ID=84532` and `ESCROW_MIN_CONFIRMATIONS=3`.
Local tests can override `ESCROW_RPC_URL`, `ESCROW_CONTRACT_ADDRESS` and
`ESCROW_CHAIN_ID=31337` together. Base Sepolia deployments require the official
six-decimal USDC token and the three distinct Safe roles documented in
`apps/contracts/SECURITY.md`.

## Lifecycle

1. The client approves the contract's immutable USDC token and calls
   `deposit(issueId, developer, amount, deliveryDeadline, termsHash)`.
   `depositToEscrow` confirms the transaction against the assigned participants,
   bounty, chain and immutable token. Terms, roles and dates come from the chain.
2. The developer calls `submitWork(issueId, deliveryHash)` before the delivery
   deadline, then confirms action `WORK`. Submission descriptions and PR records
   in the app are separate from this on-chain commitment.
3. The client calls `releaseFunds`. A missed delivery permits a full refund
   after the deadline. Delivered work permits release after the delivery deadline
   plus seven days through `claimReviewTimeout`.
4. Either participant may propose a settlement in basis points (0–10000 client
   share), revoke their own proposal, or accept the counterparty's proposal.
   A 10000-bps settlement is a mutual full refund. There is no `mutualCancel` or
   fixed 30-day developer claim in this protocol.
5. A resolution records allocations in `claimable(address)`. The recipient or
   any caller then calls `claim(recipient)` to transfer those funds. Claims
   aggregate a recipient's allocations across escrows; they cannot be assigned
   to a single issue. Read the authenticated wallet's live aggregate through
   `escrowClaimableBalance`.

`Escrow.phase` mirrors the contract. `Escrow.status` remains the marketplace
result (`AWAITING_DELIVERY`, `DISPUTED`, `COMPLETED` or `CANCELLED`). A resolved
full refund maps to `CANCELLED`; other resolutions map to `COMPLETED`.
`developerPayout`, `clientRefund`, `platformFeeAmount` and `resolvedAt` describe
allocation. `releasedAt` is not set by allocation and should not be used as proof
of withdrawal. Fees are floor-rounded from the developer's gross allocation.

## GraphQL confirmations

Send the wallet transaction first, wait for the configured confirmation depth,
then submit its hash to GraphQL. The server checks trusted contract logs and
canonical block data before writing a serializable DB transaction. Repeating a
recorded event is idempotent. Confirm events in chain order, including events
within one Safe batch. The server checks intervening contract logs and rejects
a later event until earlier events have been confirmed, so a later settlement
cannot hide an unconfirmed dispute. Use an RPC supporting historical log queries.

`confirmEscrowTransaction(input: { issueId, txHash, action, commitmentHash?, clientBps? })`
supports these actions:

| Action | Contract call | Additional confirmation input |
| --- | --- | --- |
| `WORK` | `submitWork` | `commitmentHash`: delivery hash |
| `PROPOSE_SETTLEMENT` | `proposeSettlement` | `clientBps` |
| `REVOKE_SETTLEMENT` | `revokeSettlement` | — |
| `ACCEPT_SETTLEMENT` | `acceptSettlement` | — |
| `MISSED_DELIVERY_REFUND` | `claimMissedDeliveryRefund` | — |
| `REVIEW_TIMEOUT` | `claimReviewTimeout` | — |
| `COUNTERPARTY_EVIDENCE` | `submitCounterpartyEvidence` | `commitmentHash`: evidence hash |
| `INITIAL_RULING` | `postInitialRuling` | `clientBps`, `commitmentHash`: decision hash |
| `CHALLENGE` | `challengeRuling` | — |
| `FINAL_RULING` | `postFinalRuling` | `clientBps`, `commitmentHash`: decision hash |
| `FINALIZE_RULING` | `finalizeRuling` | — |
| `ARBITER_TIMEOUT_SPLIT` | `finalizeArbiterTimeoutSplit` | — |

`releaseFunds(input: { issueId, txHash })` confirms a release allocation.
The compatibility mutation `cancelEscrow` confirms an already resolved full
refund, never an approval or pending settlement.

`raiseDispute` requires `issueId`, `reason`, `txHash` and a nonzero
`evidenceManifestHash`. The contract gives the counterparty 72 hours to submit
evidence. The initial ruling has a seven-day challenge window. Only a party
losing principal can challenge once; the final ruling then has a 24-hour notice
period. An arbiter stalling for 30 days permits a 50/50 fallback allocation.

`proposeDisputeResolution` confirms an initial or final ruling and additionally
accepts `clientRatio` (percentage with at most two decimals), `note`, `txHash`
and `decisionHash`. `challengeDisputeResolution` requires `issueId` and `txHash`.
Both update DB state only after a verified receipt. Rulings bind the event's
arbiter to the role snapshotted at deposit and support an outer Safe transaction.
AI dispute analysis remains advisory.

The current dispute/admin forms confirm supplied transaction hashes. Wallet
transactions must be sent through the contract or arbiter Safe before using
these forms.

## Local verification

Compile and run the contract tests from `apps/contracts` with `bun run compile`
and `bun run test`. Start a local Hardhat node and an isolated PostgreSQL database,
apply all migrations to that database, then run `bun run test:escrow` from
`apps/web` with `DATABASE_URL`, `DIRECT_URL` and optional `E2E_RPC_URL` pointing
to those local services. On WSL, `E2E_LOCAL_DATABASE_HOST` can identify the local
Linux database host when the script runs on Windows.

The E2E deploys the current compiled contract and checks deposits, submitted work,
allocation versus claim, idempotency, full/split settlements, evidence, initial
and final rulings, challenge, unchallenged rulings, arbiter timeout splits,
permissionless finalization, dispute/settlement confirmation ordering,
multi-escrow Safe-shaped batches, refund/review timeout
and rejection of an issue using a different token. It cleans up only its own
test records. It refuses a nonlocal chain or database by default.
