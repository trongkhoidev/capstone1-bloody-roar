# Meeting Minutes: C1SE.25

## Read this first

The repository holds no meeting records. This file contains three things:

1. A template for each real meeting.
2. Open items carried over from the repository, to bring to the next meeting.
3. A decision log. Each decision has its source. The repository does not record the meeting where it was agreed.

Fill one record per real meeting from the team's calendar and notes. Write "not recorded" for any field without a source. Do not rebuild attendance or discussion from memory.

## 1. Meeting record template

Copy this block for each meeting.

| Field | Entry |
|---|---|
| Meeting ID | `MM-YYYY-MM-DD-NN` |
| Date, time, duration | [fill from calendar] |
| Type | Sprint planning / Sprint review / Daily / Retrospective / Ad hoc |
| Location or channel | [fill] |
| Run by (Scrum Master or delegate) | [fill] |
| Attendees (present / absent) | [fill from the attendance record] |
| Agenda | [list items] |
| Discussion summary | [fill from notes] |
| Decisions (ID, text, owner) | [fill] |
| Action items (owner, due date, status) | [fill] |
| Evidence | Commit hash, PR number or document path |

## 2. Open items to bring to the next meeting

| # | Item | Source | Status on 4 Nov |
|---|---|---|---|
| 1 | Cut MVP scope. Candidates: M6 (AI), BE-68, BE-69 (GitHub webhook dedupe), BE-70 (PR as evidence). Reduce BE-12 to `submitReview`. | `BACKEND_STATUS_2026-10-27.md` §7.1 | Not verified. Decide. |
| 2 | Decide when to retire the old escrow module that accepts a transaction hash. | §7.2 | Not verified. Check the code before deciding. |
| 3 | Decide how to split the remaining backend work. The audit estimates about 8 weeks for one person, or about 5 weeks if Hiếu takes phase 4 and Hân writes the tests for BE-74 and BE-81. | §7.3 | Not verified. |
| 4 | Deploy escrow to Base Sepolia. Create three 2-of-3 Safes with nine test wallets. Verify on BaseScan. Record `deployBlock` in the manifest. | §6, QĐ-07 | Commit `88474a7` (31 Oct) says the escrow was deployed. Manifest and verification not verified. |
| 5 | Set the RPC variable the app actually reads, and check it in the deploy environment. | §6 | Not verified |
| 6 | Set the new release date and the defense date. | Proposal §6.2 | Open |
| 7 | Update the AI usage disclosure. Codex, agy and OpenCode are referenced in the repository. | `AGENTS.md`; `docs/plan/parallel/reports/CODEX.md` | Open |
| 8 | Resolve the proposal corrections. | `docs/PROJECT_SPRINT_PLAN.md` §6 | Open |

## 3. Decision log (recorded in the repository)

Source: `docs/plan/BACKEND_EXECUTION_PLAN.md` §2. The file was first committed on 29 Sep 2026 (`b5d000e`). Check `git log` before citing a decision, because later edits may have changed the wording.

| ID | Decision | Meeting date |
|---|---|---|
| QĐ-01 | Freeze the contract logic at commit `c538e0c` as v1.0. Change it only if a real bug turns up. | Not recorded |
| QĐ-02 | Keep the 2.5% fee on the developer's share in every outcome. Full refunds to the client carry no fee. | Not recorded |
| QĐ-03 | Keep all contract timing: review 7 days after the delivery deadline, evidence 72 hours, challenge 7 days, final notice 24 hours, arbiter stall 30 days. | Not recorded |
| QĐ-04 | Keep pull payments: a `claimable` balance and a `claim()` call. | Not recorded |
| QĐ-05 | Keep `escrowId` as a string. The backend generates `escrowKey` and stores its hash before deposit. | Not recorded |
| QĐ-06 | Only the party that receives less than the full principal may challenge a ruling, and only once. | Not recorded |
| QĐ-07 | Set up three separate 2-of-3 Safes on Base Sepolia (Owner, Arbiter, Fee recipient) with nine test wallets. The smart-contract engineer leads. | Not recorded |
| QĐ-08 | Create the `apps/worker` workspace for the indexer, deadline scheduler, reconciler and AI jobs. | Not recorded |
| QĐ-09 | Use viem in the backend. Thirdweb and ethers v5 stay on the frontend wallet side. | Not recorded |
| QĐ-10 | No Redis. Use a Postgres job table with `FOR UPDATE SKIP LOCKED` and `LISTEN/NOTIFY`. | Not recorded |
| QĐ-11 | Finality: fold only logs up to the `safe` block tag. | Not recorded |
| QĐ-12 | Each on-chain action is a `prepareX` mutation that returns the encoded call. | Not recorded |
| QĐ-13 | The backend computes what each viewer may do (`viewerCapabilities`, `availableActions`). | Not recorded |
| QĐ-14 | Money uses a `TokenAmount` type. Basis points for ratios. Remove every `Float` that touches money. | Not recorded |
| QĐ-15 | Document hashes use keccak256 over RFC 8785 canonical JSON. | Not recorded |
| QĐ-16 | Selecting a developer creates a 24-hour funding reservation. Other applications stay pending. | Not recorded |
| QĐ-17 | A late deposit or one with mismatched terms is handled by a stated rule. Chain state is the truth. | Not recorded |
| QĐ-18 | The EIP-712 signature is made at the funding step, not at posting, because the developer is not known at posting. | Not recorded |
| QĐ-19 | `deliveryDeadline` is an absolute date and time that the client sets. | Not recorded |
| QĐ-20 | `termsHash` covers a fixed set of fields. At least one acceptance criterion must be approved first. | Not recorded |
| QĐ-21 | Remove the Client and Developer role check. One account can post and apply, limited per issue. | Not recorded |
| QĐ-22 | Submission flow: draft, manifest, `deliveryHash`, then `submitWork` on-chain. Older submissions are superseded. | Not recorded |
| QĐ-23 | Add `AWAITING_FUNDING` to `IssueStatus`. Terminal state is `COMPLETED` with an `outcome` field. | Not recorded |
| QĐ-24 | Chat policy by phase. Admin reads chat only during a dispute. | Not recorded |
| QĐ-25 | Disputes: the worker creates the record. The admin drafts the ruling. The Arbiter Safe signs it. | Not recorded |
| QĐ-26 | Evidence manifests list each file's hash and a chat range. | Not recorded |
| QĐ-27 | The worker creates notifications with an idempotent key. Email is out of scope. | Not recorded |
| QĐ-28 | Storage: one private Supabase bucket with an S3-compatible API. The worker verifies file hashes. | Not recorded |
| QĐ-29 | GitHub: fix the OAuth flow. The webhook only records PR status. No automatic payout. | Not recorded |
| QĐ-30 | Admin bootstrap through the `ADMIN_WALLETS` variable and a `grant-admin` CLI. | Not recorded |
| QĐ-31 | Merge `origin/main` before anything else, keeping this branch's code on conflicts. | Not recorded |
| QĐ-32 | AI comes after the money flow and may be cut. Security gaps in AI Guard must be fixed in week 1. | Not recorded |
