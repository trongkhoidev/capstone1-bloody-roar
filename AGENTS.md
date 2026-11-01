# Capstone1 (BloodyRoar) — AGENTS.md

Shared instructions for **Claude Code**, **Codex**, **agy**, and **OpenCode**.

---

## 1. Project Overview & Architecture

Monorepo powered by **Bun** (`bun.lock`):

```
capstone1/
├── apps/
│   ├── web/            # Next.js web application (port 4000)
│   └── contracts/      # Smart contracts (Hardhat / Foundry / Solidity)
├── packages/
│   └── database/       # Database schema & migrations (Drizzle / Prisma)
└── docs/               # Architecture docs & proposals
```

---

## 2. Key Commands (Bun only)

```bash
# Web Application
bun run dev                     # Start web dev server (port 4000)
bun run build                   # Build web app
bun run lint                    # Lint web app
bun run typecheck               # Typecheck web app
bun run test:e2e:backend        # Backend E2E tests

# Database
bun run db:generate             # Generate migrations from schema
bun run db:migrate              # Apply migrations
bun run db:studio               # Open DB studio GUI

# Smart Contracts
bun run contracts:compile       # Compile contracts
bun run contracts:test          # Run contract tests
bun run contracts:deploy        # Deploy to local network
```

---

## 3. Token Optimization & Code Efficiency (Ponytail & Codegraph)

- **Code Navigation**: This repo has `.codegraph/`. Use `codegraph_explore` or `codegraph explore` first to trace symbols and call paths before grepping.
- **Pack Context**: For large reviews, run `repomix --compress` to extract clean AST context with minimal tokens.
- **Ponytail Ladder of Laziness**:
  1. Does this feature need to exist? (Strict YAGNI).
  2. Does a helper/util already exist in `apps/web` or `packages/`? Reuse it.
  3. Standard library or framework built-ins? Use them.
  4. Write the **Shortest Working Diff**. Avoid unnecessary wrappers, unrequested boilerplate, and bloated abstractions.
- **Verification Gate**: Always run `bun run typecheck` and `bun run lint` before finishing any task.
