# Bloody-Roar: Project Plan and Sprint Plan

| Item | Value |
|---|---|
| Project | Bloody-Roar: Decentralized Bounty Marketplace |
| Team | C1SE.25 (not confirmed, see section 7, item 6) |
| Course | CMU-SE 450, Capstone Project 1, International School, Duy Tan University (the registration form ticks CMU-SE 451, see section 7, item 9) |
| Mentor | Le Kim Hoang (Faculty Mentor) |
| Scrum Master | Nguyen Trong Khoi |
| Planned window | 18 Aug to 30 Oct 2026 (5 sprints of 14 days, then release). Re-baselined to milestones M0 to M6, 28 Sep to 15 Nov 2026 |
| Status date | 4 November 2026 (repository `main` at `255967d`, merged 3 Nov) |
| Baseline | Submitted proposal v1.1 (`docs/submit-document/C1SE25-Proposal_Bloody-Roar.docx`), sections 5 and 6 |
| Revised design | `docs/PROPOSAL.md` v2.0 |

## 0. How to read this document

The approved proposal is the baseline. The status columns describe what the repository shows on 4 November 2026. When the repository cannot show a status, the table says "Not verified" and does not guess.

Commit counts come from `main`. The commands are listed in `docs/management/TEAM_EVIDENCE.md`, section 8.

Sections 1 to 6 follow the order of the course project plan template: Introduction, Team Organization, Schedule, Development Process, Estimation Cost, and Project's Risk. Sections 7 to 9 hold the corrections, next actions and sources.

## 1. Introduction

### 1.1 Purpose

This document summarizes the project's objectives, the division of work, the milestones, the resources and budget, the schedule and the risks. It compares the plan with the repository. It does not replace the proposal.

### 1.2 Scope

**In the MVP** (`docs/PROPOSAL.md` section 5.1): a marketplace for issues and applications, wallet login, real-time chat per issue, escrow on Base Sepolia with release, refund, settlement and dispute, and tests with setup documentation.

**Out of the MVP** (`docs/PROPOSAL.md` section 5.2): mainnet and fiat payments, full eKYC, a native mobile app, automatic release when a pull request is merged, multi-agent AI, analytics and EAS reputation.

**Scope changes since the proposal**

| Change | Decision | Source |
|---|---|---|
| The automatic payout on PR merge is removed. The GitHub webhook only records PR status as evidence. | QĐ-29 | `BACKEND_EXECUTION_PLAN.md` section 2 |
| EAS reputation moves to v1.5. | Team plan | `docs/TEAM_PLAN.md` header |
| Docker sandbox moves to v2. | Team plan | `docs/TEAM_PLAN.md` section 1 |
| The admin drafts a ruling. The Arbiter Safe signs it. AI supports the decision and does not make it. | QĐ-25 | `BACKEND_EXECUTION_PLAN.md` section 2 |
| AI features are built after the money flow and may be cut. | QĐ-32 | `BACKEND_EXECUTION_PLAN.md` section 2 |
| The 2.5% platform fee applies to the developer's share in every settlement path. | QĐ-02 | `BACKEND_EXECUTION_PLAN.md` section 2 |

The proposal describes the 2.5% fee as applying to "successful escrows". Section 7, item 4, lists the wording fix.

### 1.3 Project overview

Two proposal documents exist, and they differ.

- **Submitted proposal v1.1** (`docs/submit-document/C1SE25-Proposal_Bloody-Roar.docx`). This is the baseline for this plan. It includes the AI modules, GitHub integration and an automatic payout on PR merge.
- **Revised proposal v2.0** (`docs/PROPOSAL.md`). The backlog and the escrow rules cite this version. AI is optional and may be cut, and the automatic payout is removed (QĐ-29).

Section 7, item 8, asks the team to choose one baseline before submission.

### 1.4 Deliverables

| Deliverable | Location | Status (4 Nov) |
|---|---|---|
| Proposal | `docs/PROPOSAL.md` (v2.0). Submitted v1.1 in `docs/submit-document/` | Both exist. Baseline not chosen (section 7, item 8) |
| Project plan and sprint plan | This file, and `docs/management/SPRINT_BACKLOG.md` | Written for 4 Nov |
| Management records | `docs/management/`: meeting minutes, team evidence, time log | Time log has no rows yet |
| Source code | Monorepo: `apps/web`, `apps/worker`, `apps/contracts`, `packages/` | On `main` |
| Technical documentation | `docs/LOCAL_DEV.md`, `docs/DEPLOY.md`, `docs/TESTING_GUIDE.md`, `docs/RUNBOOK.md` | Exists. API reference not verified |
| Demo video | Not in plan v2.0 | Decision needed (section 7, item 13) |
| Final report | Not in the repository | Not verified |

## 2. Team organization

### 2.1 Team information

| Full name | Position | Main area |
|---|---|---|
| Nguyen Trong Khoi | Scrum Master, Backend Lead and AI Engineer | Backend architecture, worker and Indexer, infrastructure |
| Nguyen Huu Tam Kien | Smart Contract Engineer | Escrow contract, Safe setup, contract review |
| Do Van Hieu | Backend Engineer, frontend support | GraphQL, Prisma, marketplace, backend integration |
| Doan Thi Ngoc Han | UI/UX Designer and QA Engineer | UX and UI, E2E scenarios, acceptance tests |
| Nguyen Thi Bao Tram | UI/UX Designer and Test Engineer | Frontend components, UI tests |

Student IDs and email addresses are in the course registration form. They are not in this repository because the repository is public.

### 2.2 Roles and responsibilities

| Role | Responsibility | Name |
|---|---|---|
| Mentor (product owner review) | Reviews scope, schedule and deliverables. The submitted proposal names the mentor as product owner for review. | Le Kim Hoang |
| Scrum Master | Runs the four Scrum meetings. Keeps the schedule and the risk register current. Records meetings in the minutes file. | Nguyen Trong Khoi |
| Smart contract owner | Writes and tests the escrow contract, sets up the Safes, and reviews changes that move money. | Nguyen Huu Tam Kien |
| Backend | Schema, GraphQL, authentication, Indexer and integration. | Nguyen Trong Khoi, Do Van Hieu |
| QA and test | Test plan, E2E scenarios, acceptance criteria and UI tests. | Doan Thi Ngoc Han, Nguyen Thi Bao Tram |
| All members | Analyze requirements, code and test, fix defects, and log their own hours. | All members |

### 2.3 Communication and reporting

| Type of communication | Methods, tools | Frequency | Information | People |
|---|---|---|---|---|
| Sprint planning | Team meeting. Channel not recorded in the repository | Every 14 days, at the start of a sprint | Sprint scope, owners and sizes (`docs/management/SPRINT_BACKLOG.md`) | Team |
| Daily update | Not recorded in the repository | Daily | What was done, what is next, blockers | Team |
| Sprint review | Team meeting with a demo of working flows | End of each sprint | Test and E2E evidence | Team, mentor |
| Retrospective | Team meeting | End of each sprint | What to keep, change or drop. Decisions go into the decision log in `docs/management/MEETING_MINUTES.md` | Team |
| Mentor reporting | Not recorded in the repository | [TBD] | Progress against this plan | Mentor, Scrum Master |
| Task and code tracking | GitHub issues, pull requests and commits on `main`. Plan files in `docs/` | Continuous | Work items, reviews, evidence | Team |

## 3. Schedule

### 3.1 Planned vs. actual

| Sprint | Planned dates | Planned scope (proposal section 5) | Commits on `main` in window | Status (4 Nov) | Evidence |
|---|---|---|---|---|---|
| 0. Foundation | 18–31 Aug | Bun monorepo, Prisma schema, Next.js custom server, Hardhat, design system | 22 | Done for the core scaffold. Design system partly done. | Prisma schema, `server.ts`, Hardhat config and escrow contract file first committed 19 Aug (`97e5a26`). First design files committed 25 Oct (`5a0692a`). |
| 1. Auth and marketplace | 1–14 Sep | Thirdweb SIWE login, issue CRUD, apply and assign, escrow contract with 14+ tests | 10 | Partly done. Auth and marketplace merged. Escrow lifecycle late. | Merges #1, #2, #3 and #5 (24–26 Aug), #6 (15 Sep). Escrow test suite: 35 passing on 4 Nov. |
| 2. Escrow, chat and AI | 15–28 Sep | On-chain escrow E2E, Socket.io chat, AI Guard, AI test generation, model router | 14 | Late | Chat components first committed 13 Sep (`725aabf`). On-chain flows reached `main` in late October. |
| 3. Dispute and GitHub | 29 Sep–12 Oct | 5-agent debate, GitHub OAuth, webhook auto-payout, notifications, analytics | 11 | Late. Scope changed. | Auto-payout removed by decision QĐ-29. Dispute paths S7 and S8 are in the 3 Nov E2E report. |
| 4. Polish and deploy | 13–26 Oct | CI/CD, EAS reputation, contract audit, UI polish, production deploy | 6 | Late. EAS moved to v1.5. | `.github/workflows` first committed 27 Oct (`fc1c2b1`). Base Sepolia deployment is claimed in commit `88474a7` (31 Oct). Not verified here. |
| Release and defense | 27–30 Oct | Release and defense | 216 (27–30 Oct) | Open. The planned end date has passed. | 78 more commits from 31 Oct to 3 Nov. |

**Activity pattern.** Sprints 0 to 4 produced 63 commits on `main`. The release window alone produced 216 of 357 (about 60%), all dated 27–30 October. No commits reached `main` between 6 and 24 October, a gap of 19 days. The repository does not record the reason. The team should give the actual reason at the sprint review.

### 3.2 Milestone status against the re-baselined plan

The team re-baselined the schedule in `docs/plan/BACKEND_EXECUTION_PLAN.md`. The last full audit in the repository is dated 27 Oct. Evidence after that date is limited to the 3 Nov E2E report.

| Milestone | Planned window | Status at 27 Oct (audit) | Later evidence (to 4 Nov) |
|---|---|---|---|
| M0. Foundation and debt cleanup | 28 Sep–4 Oct | Mostly open | Not verified |
| M1. Data model, contract deploy, plumbing | 5–11 Oct | Not started. The new models were not yet in the schema. | Prisma schema has 31 models on 4 Nov. Not verified against M1 criteria. |
| M2. Indexer and funding flow | 12–18 Oct | Not started. No worker app. | `apps/worker` first committed 27 Oct. Scenarios S1 and S3 (funding, release, reservation expiry) reported PASS on a local chain on 3 Nov. |
| M3. Delivery, release, timeout, claim, settlement | 19–25 Oct | Not started | Scenarios S2, S4, S5 and S6 reported PASS on a local chain on 3 Nov. |
| M4. Dispute, ruling, Safe | 26 Oct–1 Nov | Not started | Scenarios S7 and S8 reported PASS on a local chain on 3 Nov. Safe signing on testnet not verified. |
| M5. Operations and acceptance | 2–8 Nov | In progress | Open |
| M6. AI v1 (may be cut) | 9–15 Nov | Not started | The 27 Oct audit proposed cutting it. |

### 3.3 Detailed schedule by milestone

| No. | Task | Starting day | Ending day | Effort (BE tasks by size) | Assign to |
|---|---|---|---|---|---|
| 1 | M0. Foundation and debt cleanup | 28/09/2026 | 04/10/2026 | 10 tasks: 6 S, 4 M | Khoi, Kien, Hieu, Han |
| 2 | M1. Data model, contract deploy, plumbing | 05/10/2026 | 11/10/2026 | 13 tasks: 5 S, 8 M | Hieu, Khoi, Kien, Han |
| 3 | M2. Indexer and funding flow | 12/10/2026 | 18/10/2026 | 17 tasks: 5 S, 10 M, 2 L | Khoi, Hieu, Kien, Han |
| 4 | M3. Delivery, release, timeout, claim, settlement | 19/10/2026 | 25/10/2026 | 16 tasks: 8 S, 8 M | Hieu, Khoi, Han |
| 5 | M4. Dispute, ruling, Safe | 26/10/2026 | 01/11/2026 | 10 tasks: 5 S, 5 M | Hieu, Kien, Khoi, Han |
| 6 | M5. Operations and acceptance | 02/11/2026 | 08/11/2026 | 11 tasks: 5 S, 6 M | Khoi, Han, Tram, Kien, Hieu |
| 7 | M6. AI v1 (may be cut) | 09/11/2026 | 15/11/2026 | Not sized | Not assigned in the plan |
| | **Total** | | | **77 tasks: 34 S, 41 M, 2 L** | |

Size rules come from `docs/plan/BACKEND_REMAINING_TASKS.md`: S is up to 1 day, M is 1 to 3 days, and L is more than 3 days. That file estimates 35 to 50 person-days for the remaining backend without AI (audit of 27 Sep). The counts above include only the BE-xx IDs in each milestone. BUG and AI items are not counted. The team has no hour estimate per milestone.

## 4. Development process

The team uses Scrum with two-week sprints. The Scrum Master runs the four meetings listed in section 2.3.

Working rules:

- **Branches.** Feature branches use the `feat/`, `fix/`, `docs/` and `chore/` prefixes. `docs/TEAM_PLAN.md` section 9 describes a `develop` branch. In practice, the seven pull requests merged so far went directly into `main`. Section 7, item 11, asks the team to choose one rule.
- **Commit messages.** `<type>(<scope>): <description>`, as in `docs/TEAM_PLAN.md` section 9.
- **Review.** Changes that move money need a second reviewer (`docs/PROPOSAL.md` section 11). Git history does not show who reviewed past commits.
- **Pull request content.** Each pull request states its scope, its test evidence and its remaining limits (`docs/PROPOSAL.md` section 11).
- **Definition of done.** `docs/plan/BACKEND_EXECUTION_PLAN.md` section 1.

## 5. Estimation cost

### 5.1 Resources

| Full name | Role | Rate (USD/hour) |
|---|---|---|
| Nguyen Trong Khoi | Scrum Master, Backend Lead | 2 |
| Nguyen Huu Tam Kien | Smart Contract Engineer | 2 |
| Do Van Hieu | Backend Engineer | 2 |
| Doan Thi Ngoc Han | UI/UX Designer and QA | 2 |
| Nguyen Thi Bao Tram | UI/UX Designer and Test | 2 |

The rate is a budgeting figure from the submitted proposal, section 6.1.

### 5.2 Cost effort estimation

| Description | Amount | Unit |
|---|---|---|
| Number of members | 5 | Person |
| Working hours per day, per member | 3 | Hours |
| Duration | 10 | Weeks (70 calendar days) |
| Planned hours | 1,050 | Hours (5 × 3 × 70) |
| Labour cost | USD 2,100 | 1,050 × USD 2 |
| Cloud and AI | USD 150 | As submitted |
| **Total** | **USD 2,250** | |

**Basis problem.** The proposal labels 70 as "working days", but 70 is the number of calendar days in 10 weeks. With five working days per week (50 days), the plan becomes 750 hours, USD 1,500 labour and USD 1,650 total. The team must choose one basis before submission. This document does not change the approved figure.

**Actual, 4 Nov 2026**

| Item | Value |
|---|---|
| Hours logged | 0. `docs/management/time-log.csv` has no rows. See `docs/management/TEAM_EVIDENCE.md` section 6 |
| Cloud and AI spend | [TBD: from provider invoices] |
| Total | [TBD] |

## 6. Project's risks

### 6.1 Rating legend

| Code | Meaning |
|---|---|
| L | Low |
| M | Medium |
| H | High |
| E | Extreme (used for seriousness only) |
| NA | Not assessed |

Level is the seriousness (impact) of the risk. Likelihood is its probability. The codes come from the probability and impact ratings in the submitted proposal, section 6.3.

### 6.2 Project risk

| Risk | Definition | Level | Likelihood | Mitigation strategy and status (4 Nov) |
|---|---|---|---|---|
| Smart contract vulnerability | A reentrancy, access-control or accounting error in the escrow contract | H | L | Partly mitigated. 35 Hardhat tests pass (4 Nov). Foundry fuzz and invariant tests were not run (27 Oct audit). No external audit. Next: run invariant tests and a static analyzer (QĐ-01 names slither) and save the results under `docs/`. |
| AI hallucination or unfair arbitration | The AI gives a wrong or biased dispute recommendation | H | M | Mitigated by design. The admin drafts the ruling and the Arbiter Safe signs it (QĐ-25). AI debate is the first feature to cut (QĐ-32). Keep the human approval step in the demo. |
| Third-party outage or rate limit | The RPC, storage or AI provider fails or limits requests | M | M | Open. The 27 Oct audit found that the RPC variable in `.env` has a different name from the one the app reads. Confirm the name in the deploy environment. |
| Schedule and scope | The work takes longer than planned | M | H | Occurred. The planned end date of 30 Oct has passed. About 60% of commits landed on 27–30 Oct. Scope cuts are listed in section 1.2. Next: set a new release date and freeze scope. |
| AI Guard failure | Secrets in chat or in file names are not masked | H | L | Partly mitigated. Code on `main` scans message content and file names. Audit hashes use HMAC (`13cd062`). Not tested for this document. Next: add a test for a secret inside a file name. Until that test exists, treat likelihood as M. |
| Loss or concentration of a team member | A member leaves, or the work sits with one person | M | L | Occurred as concentration. 329 of 357 commits (92%) on `main` come from one person's git identities. Contract deploy, Safes and money review depend on the smart-contract engineer (`docs/plan/BACKEND_STATUS_2026-10-27.md`). Next: pair review on money-path changes and write handover notes. |

## 7. Corrections before submission

| # | Where | Problem | Suggested fix |
|---|---|---|---|
| 1 | Proposal cover and revision history | The cover says 6 Sep 2026. Revision history v1.0 says 23 Aug 2026. | Use one date for the document. Record v1.1 in the history. |
| 2 | Proposal section 6.1 | "70 days" is labelled as working days. | Choose calendar or working days. Recompute and tell the mentor. |
| 3 | Proposal section 5, Sprint 0 | "17 models" for the Prisma schema. The registration form says "17 models / 16 enums". | The schema has 31 models and 19 enums on 4 Nov. Update the figure or state the change. |
| 4 | Proposal section 7, Economic row | "2.5% fee on successful escrows". | Match QĐ-02: 2.5% on the developer's share in every settlement path. |
| 5 | AI Usage Disclosure | Lists ChatGPT, Cursor, Copilot, Claude and Groq/Gemini. The repository also refers to Codex, agy (Antigravity) and OpenCode (`AGENTS.md`, `docs/plan/parallel/reports/CODEX.md`, `AGY_PROMPT_*` files). | Confirm which tools the team used and add them. The statement says that non-disclosure may be academic misconduct. |
| 6 | File names | Two course forms are named `C2SE12`. The disclosure statement names the team as C1SE.25. | Confirm the team code and rename the files. |
| 7 | Team roles | `TEAM_PLAN.md` gives the escrow contract to the smart-contract engineer. On `main`, 2 of 19 commits touching `apps/contracts` come from an identity that is probably that member (see `TEAM_EVIDENCE.md` section 3). | Confirm the identity mapping. Record pairing or review on contract changes. |
| 8 | Two proposal versions | The submitted v1.1 and the revised v2.0 (`docs/PROPOSAL.md`) differ in scope: AI, GitHub auto-payout and the escrow flow. | Choose one baseline for submission. If v2.0 becomes the baseline, record the change with its decision ID. |
| 9 | Course code | The registration form ticks CMU-SE 451. This plan and the proposal say CMU-SE 450. | Confirm the code with the mentor and correct the documents. |
| 10 | Survey figures | The submitted proposal, section 4, cites market and survey figures: a Statista market size, an Upwork survey and a GitHub Security Survey. `docs/documentation_bloody-roar.md` section 1.2 gives a 10–20% platform fee. The repository holds no source for any of them. | Find each source and state its year, or remove the figure. |
| 14 | Competitor payment models | `PROPOSAL.md` section 4.5 does not describe how Algora, OnlyDust and Superteam Earn hold and pay money. The repository's documents only show their interface patterns (`docs/plan/UI_REDESIGN_SPEC.md` section 1.2). | Study each product's payment model from its own documentation and add a row per product. |
| 11 | Git rule | `docs/TEAM_PLAN.md` section 9 uses a `develop` branch. Merged pull requests target `main`. | Pick one rule and update `docs/TEAM_PLAN.md` section 9. |
| 12 | Supervisor email | The email is in `Capstone_Proposal_Final.md`, section 3, and is now in `PROPOSAL.md`. | Confirm it with the mentor before submission. |
| 13 | Demo video | The course deliverables list a demo video. Plan v2.0 does not include one. | Decide whether the demo is a live demo, a recorded video, or both. Add it to the plan if needed. |

## 8. Next actions

| # | Action | Suggested owner (from `TEAM_PLAN.md`) | Due |
|---|---|---|---|
| 1 | Decide the MVP scope and a new release date | Scrum Master | [TBD] |
| 2 | Run Foundry invariant tests and a static analyzer. Save the results under `docs/`. | Smart-contract engineer | [TBD] |
| 3 | Add a test for AI Guard on FILE messages with a secret in the file name | Backend lead | [TBD] |
| 4 | Recheck the GitHub OAuth flow (BUG-1 in the 27 Oct audit) and add a test | Backend engineer | [TBD] |
| 5 | Fill actual hours and attendance from time logs and calendars | Each member | [TBD] |
| 6 | Confirm the git identity mapping in `TEAM_EVIDENCE.md` section 2 | Each member | [TBD] |
| 7 | Apply the corrections in section 7 and update the AI disclosure | Scrum Master | [TBD] |
| 8 | Choose the baseline proposal and record the change (item 8) | Scrum Master | [TBD] |
| 9 | Confirm the course code and team code (items 6 and 9) | Scrum Master | [TBD] |
| 10 | Find sources for the survey figures or remove them (item 10) | Scrum Master | [TBD] |
| 11 | Choose one Git rule for `main` and `develop` (item 11) | Scrum Master | [TBD] |
| 12 | Confirm the supervisor's email with the mentor (item 12) | Scrum Master | [TBD] |
| 13 | Study how Algora, OnlyDust and Superteam Earn hold and pay money (item 14) | Scrum Master | [TBD] |

## 9. Sources

- `docs/submit-document/C1SE25-Proposal_Bloody-Roar.docx` (v1.1)
- `docs/submit-document/0-CAPSTONE PROJECT REGISTRATION FORM-C1SE25.pdf` (team roles, course, supervisor)
- `docs/submit-document/0-CAPSTONE PROJECT REGISTRATION FORM-C2SE12.docx`
- `docs/submit-document/2-AI USAGE DISCLOSURE STATEMENT (CMU)-C2SE12.docx`
- `docs/PROPOSAL.md` (v2.0)
- `docs/TEAM_PLAN.md`
- `docs/plan/BACKEND_EXECUTION_PLAN.md`
- `docs/plan/BACKEND_REMAINING_TASKS.md` (task sizes)
- `docs/plan/BACKEND_STATUS_2026-10-27.md`
- `docs/plan/ROLE_FLOW_E2E_2026-11-03.md`
- `docs/management/TEAM_EVIDENCE.md`
- `docs/management/MEETING_MINUTES.md`
- `docs/management/SPRINT_BACKLOG.md`
- `Capstone_Proposal_Final.md` (section 3, supervisor)
- `docs/RESEARCH.md` (sections 3 and 4, identity and anti-Sybil options)
- `docs/documentation_bloody-roar.md` (section 1.2, how marketplaces hold money)
- `docs/plan/UI_REDESIGN_SPEC.md` (section 1.2, marketplace patterns)
- Structure only: `Captone2_ODWai-1/2.Project Plan/ProjectPlan_Cap2_Team17_DOWai_v1.1.docx`. The content of that sample was not reused.
