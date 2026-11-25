# AGENTS.md

Shared rules for Claude Code, Codex, agy and OpenCode. Claude-only notes live in `CLAUDE.md`.

Bloody-Roar is a bounty marketplace: clients post issues, developers apply and deliver, payment goes through a USDC escrow contract on Base Sepolia (`chainId 84532`, local Hardhat `31337`). AI features are advisory only.

- Bun only. Never use `npm`, `pnpm` or `npx`; ask before `bun add`.
- Workspaces: `apps/web` (Next.js + `server.ts`, GraphQL Yoga, port 4000), `apps/worker` (indexer, reconciler, jobs), `apps/contracts` (Hardhat, Foundry for fuzz), `packages/database` (Prisma), `packages/shared`. Full-stack E2E lives in `tests/e2e`, plans and specs in `docs/`.
- Dependencies point one way: `web` and `worker` may import `database` and `shared`. Never import `web` from `worker` or the reverse.
- After changing `BloodyRoarEscrow.sol`, run `bun run contracts:compile`, then `bun run apps/contracts/scripts/export-abi.ts`. Do not edit `packages/shared/src/escrow/abi.ts` by hand.
- After changing `schema.prisma`, run `bun run db:generate`. Ask before `db:migrate`, `db:push` or `db:reset` against anything but a local `_test` database. Never hand-edit an applied migration.
- The default branch is `main`. Never commit to `main`; base new branches and worktrees on `main` or `origin/main`. Commit or push only when asked.
- Ask before deploying contracts or changing `ESCROW_ADDRESS`. A changed contract ABI is a one-way door.
- Ask before any production command: `db:migrate:prod`, `db:seed:prod`, `deploy:base-sepolia`, force-push.
- Never read, print or commit real secrets or `.env` values (`.env`, `.env.bak`, `demo-wallets/`, `~/.jira.env`). New env vars go into `.env.example` with a placeholder.

## Branches and Commits

- Branch: `feat/US-N-short-name` or `fix/US-N-short-name`, using the Jira story number.
- Commit: `type(scope): subject (US-N)`, for example `fix(worker): keep build dirs out of fileTree (US-35)`. Scopes: `web`, `worker`, `db`, `contracts`, `shared`, `e2e`, `docs`.
- No AI or co-author attribution lines.

## Style Guide

- Shortest working diff. Reuse helpers in `apps/web` and `packages/` before writing new ones; no unrequested abstractions.
- Find code with CodeGraph first (`codegraph_explore` or `codegraph explore "<symbols>"`), then grep.
- No code comments unless asked.
- Keep things in one function unless composable or reusable.
- Avoid `try`/`catch` and the `any` type where possible.
- Rely on type inference; annotate only exports or where it adds clarity.
- Use Bun APIs when possible, like `Bun.file()`.
- UI in `apps/web` follows `.agents/rules/claude-design-rules.md` and the screens in `docs/claude-design/`.

## Testing

- Write the failing test first, then the fix.
- Avoid mocks; test real behaviour against a local database whose name ends in `_test`. Do not copy logic into tests.
- Money paths (fee, payout, reuse price) need a test that checks exact amounts.
- `apps/web`: `bun run test` (Vitest). `apps/worker`: `bun run test`. `packages/database`: `bun run test`. Contracts: `bun run contracts:test`, fuzz with `bun run --cwd apps/contracts test:fuzz`.
- Backend E2E: `bun run test:e2e:backend` from the repo root, with `TEST_DATABASE_URL` set to a local database whose name ends in `_test`.
- Test from the CLI only (Vitest, Playwright, `bun test`, `curl`). Do not drive a real browser through screenshots or clicks.
- Manual local stack (Postgres on `localhost:5433`, Hardhat node, web on `:4010`): `docs/LOCAL_DEV.md`.

## Before Finishing

- Run `bun run typecheck` and `bun run lint` from the repo root, plus the tests for the area you touched.
- Say what you ran and what you skipped.

## Jira

- Site `trongkhoidev.atlassian.net`, project `US` (old `KAN-xx` keys are stale).
- Use the Atlassian MCP when available, otherwise REST with creds from `~/.jira.env`:
  `curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" "$JIRA_BASE_URL/rest/api/3/search/jql?jql=project=US"`

## Undoing AI Changes

When I ask you to undo an AI-written change, and the mistake isn't obvious or already covered here, suggest an AGENTS.md edit to prevent the same problem. Always ask permission before making the edit.
