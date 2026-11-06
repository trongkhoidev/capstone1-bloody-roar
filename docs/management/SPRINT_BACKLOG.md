# Sprint Backlog: Estimate, Actual, Burn-down and Availability

| Item | Value |
|---|---|
| Team | C1SE.25 (Bloody-Roar) |
| Status date | 4 November 2026 (repository `main` at `255967d`) |
| Template | Team17 sprint backlog workbook, `Captone2_ODWai-1/7.Sprint Backlog/SprintBacklog1_V1.2.xlsx`. Its sheets are Estimate, Actual, Burn_down and Team Availability. This file keeps the same four parts. |
| Task source | `docs/plan/BACKEND_EXECUTION_PLAN.md` section 4 (milestones M0 to M6). Sizes come from `docs/plan/BACKEND_REMAINING_TASKS.md` |
| Hours source | `docs/management/time-log.csv`. It has no rows yet |

## 1. Team availability

The planned capacity comes from the submitted proposal, section 6.1: 3 hours per member per day. A 14-day sprint gives 42 hours per member. Actual availability has not been recorded.

| Member | Role | Planned hours per day | Planned hours per sprint (14 days) | Status (on time, late, early, unfinished) |
|---|---|---|---|---|
| Nguyen Trong Khoi | Scrum Master, Backend Lead | 3 | 42 | Not recorded |
| Nguyen Huu Tam Kien | Smart Contract Engineer | 3 | 42 | Not recorded |
| Do Van Hieu | Backend Engineer | 3 | 42 | Not recorded |
| Doan Thi Ngoc Han | UI/UX Designer and QA | 3 | 42 | Not recorded |
| Nguyen Thi Bao Tram | UI/UX Designer and Test | 3 | 42 | Not recorded |

## 2. Estimate: backend work by milestone

The counts are the BE-xx tasks in each milestone table of `BACKEND_EXECUTION_PLAN.md` section 4, grouped by the size that `BACKEND_REMAINING_TASKS.md` gives them. That file gives no hours per task, so this section uses counts.

| Milestone | Week | Dates | BE tasks | S | M | L | Owners named in plan |
|---|---|---|---|---|---|---|---|
| M0. Foundation and debt cleanup | 1 | 28/09 – 04/10 | 10 | 6 | 4 | 0 | Khoi, Kien, Hieu, Han |
| M1. Data model, contract deploy, plumbing | 2 | 05/10 – 11/10 | 13 | 5 | 8 | 0 | Hieu, Khoi, Kien, Han |
| M2. Indexer and funding flow | 3 | 12/10 – 18/10 | 17 | 5 | 10 | 2 | Khoi, Hieu, Kien, Han |
| M3. Delivery, release, timeout, claim, settlement | 4 | 19/10 – 25/10 | 16 | 8 | 8 | 0 | Hieu, Khoi, Han |
| M4. Dispute, ruling, Safe | 5 | 26/10 – 01/11 | 10 | 5 | 5 | 0 | Hieu, Kien, Khoi, Han |
| M5. Operations and acceptance | 6 | 02/11 – 08/11 | 11 | 5 | 6 | 0 | Khoi, Han, Tram, Kien, Hieu |
| M6. AI v1 (may be cut) | 7 | 09/11 – 15/11 | 0 | – | – | – | Not in plan |
| **Total** | | | **77** | **34** | **41** | **2** | |

Size rule: S is up to 1 day, M is 1 to 3 days, and L is more than 3 days. `BACKEND_REMAINING_TASKS.md` estimates 35 to 50 person-days for the remaining backend without AI, as of 27 Sep 2026. That total covers all the tasks in the file, not only the 77 above. Sizes are not converted to hours here.

## 3. Actual: milestone results

| Milestone | Planned dates | Hours logged | Evidence on `main` (as of 4 Nov) |
|---|---|---|---|
| M0 | 28/09 – 04/10 | No rows yet | Not verified. The 27 Oct audit says mostly open. |
| M1 | 05/10 – 11/10 | No rows yet | Prisma schema has 31 models. Not verified against M1 criteria. |
| M2 | 12/10 – 18/10 | No rows yet | `apps/worker` first committed 27 Oct. Scenarios S1 and S3 reported PASS on 3 Nov. |
| M3 | 19/10 – 25/10 | No rows yet | Scenarios S2, S4, S5 and S6 reported PASS on 3 Nov. |
| M4 | 26/10 – 01/11 | No rows yet | Scenarios S7 and S8 reported PASS on 3 Nov. Safe signing on testnet not verified. |
| M5 | 02/11 – 08/11 | No rows yet | In progress. |
| M6 | 09/11 – 15/11 | No rows yet | Not started. |

Milestone status comes from `docs/PROJECT_SPRINT_PLAN.md` section 3.2. Hours are not inferred from commits. `docs/management/TEAM_EVIDENCE.md` section 6 says the same.

## 4. Burn-down

A burn-down needs one value per day: the number of open BE tasks and the hours logged so far. No daily values are recorded yet.

| Date | Open BE tasks (end of day) | Hours logged to date | Note |
|---|---|---|---|
| – | – | – | No daily values recorded |

How to record it:

1. Each member adds one row to `docs/management/time-log.csv` for each work session. Then run `bun docs/management/summarize-time-log.mjs --write` to update section 6 of `TEAM_EVIDENCE.md`.
2. At the end of each working day, the Scrum Master adds a row to the table above.
3. At the end of each milestone, compare the open count with the sizes in section 2.

## 5. Rules

- Estimates are sizes (S, M, L), not hours. Hours come only from the time log.
- A task is done when its pull request is merged and its acceptance criteria are met (`docs/plan/BACKEND_EXECUTION_PLAN.md` section 1).
- Each person records their own hours from their own records. Do not rebuild hours from memory or from commits.

## 6. Items to confirm

- The Scrum Master confirms that the sizes in section 2 still hold. They date from 27 Sep 2026.
- Each member fills in section 1 at the start of the next sprint.
