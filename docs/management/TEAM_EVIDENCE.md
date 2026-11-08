# Team Evidence: C1SE.25 (Bloody-Roar)

| Item | Value |
|---|---|
| Status date | 4 November 2026 |
| Repository state | `main` at `255967d` (merge of PR #21, 3 Nov 2026) |
| Scope | Git history of `main`, the E2E report, and the contract test run on 4 Nov |

Every number here comes from the commands in section 8. Nothing is estimated. Where the repository has no record, the table says so.

## 1. Summary

- 357 commits on `main`, dated 19 Aug to 3 Nov 2026.
- Seven pull request merges are on `main`: #1, #2, #3, #5, #6, #20 and #21.
- 329 of 357 commits (92%) come from one git identity. Section 2 explains the mapping.
- Contract test suite: 35 passing (run on 4 Nov 2026).
- Role-flow E2E scenarios S1 to S10: reported PASS on 3 Nov (`docs/plan/ROLE_FLOW_E2E_2026-11-03.md`). Not re-run for this document.
- Hours logged: none yet. Members fill `time-log.csv`, and section 6 shows the totals.

## 2. Contribution by member

| Member (proposal role) | Git author name(s) on `main` | Commits | Share | Mapping confidence |
|---|---|---|---|---|
| Nguyen Trong Khoi (Scrum Master, Backend Lead) | `trongkhoi`, `Nguyễn Trọng Khôi`, `Kiho` (same GitHub account) | 329 | 92.2% | High. Name and GitHub account match the proposal. |
| Nguyen Huu Tam Kien (Smart Contract Engineer) | `MrSufferer` | 12 | 3.4% | Medium. The name differs from the proposal. The identity authored the docs and escrow PRs #10 and #11 described in the repository. To confirm with the member. |
| Do Van Hieu (Backend Engineer) | `KudoDo221b` | 13 | 3.6% | Medium. The name and email differ from the proposal. To confirm with the member. |
| Doan Thi Ngoc Han (UI/UX Designer and QA) | `han` | 1 | 0.3% | High. Email matches the proposal. |
| Nguyen Thi Bao Tram (UI/UX Designer and Tester) | `baotram9128` | 2 | 0.6% | High. Email matches the proposal. |
| **Total** | | **357** | 100% (rounded) | |

**Limits of this table.** A commit count measures commits, not effort. One large commit can hold more work than many small ones. Pair work, meetings, design sessions and review comments do not appear in git. Use this table as a starting point for the team's own accounting.

## 3. Contract work on `main`

Commits on `main` that touch `apps/contracts`, by git identity:

| Identity | Commits |
|---|---|
| `trongkhoi` | 13 |
| `MrSufferer` | 2 |
| `KudoDo221b` | 2 |
| `han` | 1 |
| `baotram9128` | 1 |
| **Total** | **19** |

The smart-contract engineer owns the contract in `TEAM_PLAN.md`. Git attributes two of these 19 commits to the identity that is probably that member.

## 4. Activity by sprint window

Commits on `main` by date window.

| Window | Commits | Note |
|---|---|---|
| 18–31 Aug (Sprint 0) | 22 | First commit 19 Aug |
| 1–14 Sep (Sprint 1) | 10 | |
| 15–28 Sep (Sprint 2) | 14 | 12 of them on 19 Sep |
| 29 Sep–12 Oct (Sprint 3) | 11 | |
| 13–26 Oct (Sprint 4) | 6 | All on 25–26 Oct |
| 27–30 Oct (release window) | 216 | 80 on 27 Oct, 50 on 29 Oct, 74 on 30 Oct, 12 on 28 Oct |
| 31 Oct–3 Nov | 78 | 63 on 31 Oct |
| **Total** | **357** | |

**Gap.** No commits reached `main` from 6 Oct to 24 Oct (19 days). Git cannot say why. The team should record the reason, for example work on another machine or branch, or work not yet pushed.

## 5. Evidence by deliverable

| Deliverable | Evidence | Status |
|---|---|---|
| Monorepo, Prisma schema, Next.js server, Hardhat config | Added 19 Aug 2026 (`97e5a26`) | Verified (git history) |
| Marketplace and auth | Merged PRs #1, #2, #3, #5 (24–26 Aug) and #6 (15 Sep) | Verified (git history) |
| Escrow contract tests | 35 passing | Verified on 4 Nov (`bun run contracts:test`) |
| Chat | Chat components added 13 Sep (`725aabf`) | Verified (git history). Live behaviour not tested here. |
| Worker app | `apps/worker` added 27 Oct (`107e05c`) | Verified (git history) |
| CI workflows | `.github/workflows` added 27 Oct (`fc1c2b1`) | Verified (git history). Run results not checked. |
| Role-flow E2E scenarios S1–S10 | Script added 3 Nov (`5284044`). Report says all ten PASS. | Reported. Not re-run. |
| Base Sepolia escrow deployment | Commit `88474a7` (31 Oct) says "deploy escrow to base sepolia". Deployment manifest is not in the repository. | Claimed. Not verified. |
| Demo data | Generator commits `6246c33` (150 bounties), `cc8530e` (500 comments), `664db54` (wave 1 profile updates). | Generated demo records. Not real users or transactions. See `docs/demo/DEMO_DATA_REPORT.md`. |

## 6. Hours and effort

The proposal plans 1,050 hours. That is a plan, not a record.

Hours come only from `docs/management/time-log.csv`. Each member enters their own sessions from their own records. One row per session: date (YYYY-MM-DD), member id, hours, evidence (commit hash, PR number or doc path, no commas, may be empty), and activity. Member ids: `khoi`, `kien`, `hieu`, `han`, `tram`.

The script checks every row. If any row is invalid, it prints the line numbers and writes nothing:

```bash
bun docs/management/summarize-time-log.mjs          # print the summary
bun docs/management/summarize-time-log.mjs --write  # also update the table below
```

The table is generated from the CSV. Nothing in it is estimated.

<!-- time-summary:start -->
No entries recorded yet.
<!-- time-summary:end -->

Confirmation: each member checks their own rows against their records. Record the check here: [TBD, one line per member: name, date, method].

## 7. Items the team must confirm

1. **Identity mapping** in section 2, for three members.
2. **AI tools used.** The AI usage disclosure lists ChatGPT, Cursor, GitHub Copilot, Claude and Groq/Gemini. The repository also refers to Codex, agy and OpenCode (`AGENTS.md`, `docs/plan/parallel/reports/CODEX.md`, `AGY_PROMPT_*` files). Confirm which tools were used and update the disclosure before the defense.
3. **The gap from 6 to 24 Oct.** Record the reason.
4. **The burst of 216 commits from 27 to 30 Oct.** Confirm who made which changes. Check that AI assistance matches the disclosed shares (Backend 25%, Frontend 30%, Testing 30%, Documentation 40%, Smart Contracts 20%).

## 8. Reproduce these numbers

Run from the repository root:

```bash
# Commits per git identity on main
git log main --format='%an' | sort | uniq -c | sort -rn

# Commits per day on main
git log main --format='%ad' --date=short | sort | uniq -c

# Pull request merges on main
git log main --merges --format='%ad %s' --date=short | grep -i "pull request"

# Commits touching the contracts, by identity
git log main --format='%an' -- apps/contracts | sort | uniq -c | sort -rn

# Date each path was first added
git log main --diff-filter=A --format='%ad %h' --date=short -- .github/workflows apps/worker

# Hours from the time log (checks rows; --write updates section 6)
bun docs/management/summarize-time-log.mjs

# Contract test suite
bun run contracts:test
```
