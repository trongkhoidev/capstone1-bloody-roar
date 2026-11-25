# Plan: Slow page loads (web app)

Date: 2026-11-08. Scope: `apps/web`. Status: investigation done, nothing changed yet.

## What I measured (dev server on :4000, custom `server.ts`)

| Route | 1st hit | 2nd hit |
|---|---|---|
| `/` | 15.7s | 0.08s |
| `/guide` | 7.9s | 0.05s |
| `/dashboard` | 7.0s | 0.03s |
| `/issues/create` | **30.5s** | 0.02s |
| `/api/auth/session` | 2.9s | 0.004s |
| GraphQL `hello` | 0.009s | 0.004s |
| GraphQL `issues(first:20)` | 1.6s | not re-measured |

Warm SSR is fast. The slowness is (1) on-demand compile per route in dev, and (2) client-side request chains plus remote-DB latency after the page paints.

## Causes, ranked by impact

1. **Dev compiles each route on first click.** `bun run dev` runs `next dev` through a custom server (Next 14, webpack, `.next-dev` is 657 MB). Every unvisited route compiles on click. `/issues/create` is the worst.
   - `webpack` config in `next.config.mjs` adds Web3 fallbacks; `@thirdweb-dev/*` and `ethers@5` are heavy. Only `lib/auth.ts` imports thirdweb (server), but `lib/web3/*` is pulled into `issue-detail-view` and `connect-modal` client bundles.
2. **Remote database on every request.** `DATABASE_URL` points to Supabase pooler in `ap-northeast-2` (ping blocked, so I could not measure RTT; each query pays a network round trip). Pool is `connection_limit=5`. Prisma logs every query in dev.
3. **Auth is expensive and repeated.** `verifyJWT` (`lib/auth.ts`) does thirdweb `authenticate` plus 2 *sequential* DB queries (`session`, then `user`). It runs on SSR `guardRoute`, `/api/auth/session`, **every** GraphQL request, and the SSE route.
4. **Request waterfalls on the client.**
   - Page HTML → hydrate → `restoreSession()` (`providers.tsx`) → then each view's own GraphQL fetch.
   - `issue-detail-view.tsx` (1,355 lines) fires about 8 separate GraphQL calls from separate `useEffect`s (issue, reservation, applications, my-applications, submissions, unread count…), each paying `verifyJWT`.
   - `marketplace-view.tsx` fetches issues and stats client-side only, so first paint is a skeleton.
5. **Query weight.** `ISSUE_INCLUDE` always loads `token`, `client`, `developer`, attachments and a count for every list row, even where the list shows only some fields. `issues` also runs a separate `count()` and a cursor-check query.
6. **Smaller items.** Google Fonts `<link>` is render-blocking and not `next/font`. 28 of 52 components are `"use client"`, including the whole Navbar tree. Navbar `isMounted` gating causes layout shift.

## Plan (do in this order, verify after each step)

### Phase 0: baseline (30 min)
- Add timings to `docs/plan/` notes: `next build && bun run start`, then re-time the same routes. This separates real production cost from dev compile cost. **If prod is fast, causes 1 is mostly a dev-only problem.**
- Use `?connection_limit` env and a local Postgres (`LOCAL_DEV.md` already lists `localhost:5433`) to compare DB latency.

### Phase 1: quick wins
1. **Dev speed:** try `next dev --turbo` via `server.ts` (`next({ dev, turbo })` if supported on installed 14.2.x); otherwise warm routes after start with a small `scripts/warm.ts` that curls the main routes.
2. **Dynamic-import heavy client code:** `next/dynamic` for the connect modal, `lib/web3/*` consumers, and the issue-detail action panels. Check with `ANALYZE` (`@next/bundle-analyzer`).
3. **Merge the two auth queries:** one `prisma.session.findUnique({ where:{refreshHash}, include:{ user:true } })`, then compare wallet/ban in memory. Saves 1 DB round trip per request.
4. **Cache verified auth** per token for ~30 s in memory (invalidate on logout/revoke). Removes most per-request DB hits. Shortcut note: single-process only; use Redis if scaled out.
5. **Turn off Prisma `query` logging** in dev unless `DEBUG_PRISMA=1`.
6. Move fonts to `next/font/google` (Geist).

### Phase 2: remove waterfalls
1. **Seed the auth store from the server:** layout reads `getServerUser()` and passes it to `Providers`, so `restoreSession` no longer blocks the first render (keep it as a fallback).
2. **Issue detail:** one GraphQL query for issue + reservation + applications + submissions (fields already exist); fetch only the pieces needed for the viewer's role. Use `Promise.all` or a single document; keep unread count separate (it polls).
3. **Marketplace/dashboard:** fetch the first page in the server component and pass as `initialData` to react-query (`HydrationBoundary`), so HTML ships with content.
4. Set sensible `staleTime` (already 60 s) and `placeholderData` so back/forward navigation is instant.

### Phase 3: database
1. Slim list queries: use `select` instead of `include` on `issues`; drop `developer` and `attachments` from the list shape unless the card shows them.
2. Drop the separate cursor-check query or fold it into the main query; fetch `totalCount` only when requested in the selection.
3. `EXPLAIN` the `issues` filter/sort paths; add composite index such as `@@index([status, createdAt])` if the plan shows seq scans.
4. If still slow in prod: choose a Supabase region near users, or use the transaction pooler (6543) with `pgbouncer=true`.

### Phase 4: guardrails
- Log GraphQL `durationMs` (already in `logOperations`): alert on > 500 ms.
- Add a Playwright timing check for `/`, `/marketplace`, `/issues/[id]` in `ui-e2e` against a production build.

## Success targets (production build, warm server)
- Route navigation to usable content: under 1 s.
- Issue detail: at most 2 GraphQL requests on load.
- `/api/auth/session` and authed GraphQL overhead: under 20 ms with cache.

## Not checked yet
- Real production behavior (no build run).
- DB RTT from your machine (ICMP blocked); read real numbers from Prisma query logs.
- `AUTH_PRIVATE_KEY`/thirdweb `authenticate` CPU cost per call.
- `chat-room`, Socket.io and SSE load.

## Đo trước và sau ngày 2026-11-23

Dùng Playwright headless qua CLI để mở từng trang trên hai production build. Baseline là `9d5fc0d`. Cả hai dùng PostgreSQL local `bloody_e2e_plan_test`, `DEBUG_PRISMA=1`, cùng bounty `DISPUTED` và cùng các vai. RPC local trả chain ID và giờ block cho các resolver. Mỗi trang dùng một browser context mới. Đếm request GraphQL và câu SQL ghi trong log đến khi trang tải xong, chờ network idle và thêm 1,2 giây để thu lượt tải của các panel và badge. Số đo gồm xác thực, request ghi lượt xem và các lượt refresh từ Socket.io quan sát được trong cửa sổ đó. Cả bảy trang trả HTTP 200 và các response GraphQL đã đọc đều thành công.

| Trang | Vai | SQL trước → sau | GraphQL trước → sau | Ước tính Supabase nếu SQL chạy tuần tự, trước → sau |
|---|---|---:|---:|---:|
| `/` | Khách | 21 → 21 | 3 → 3 | 1.890 → 1.890 ms |
| `/marketplace` | Khách | 15 → 15 | 2 → 2 | 1.350 → 1.350 ms |
| `/dashboard` | Developer | 29 → 27 | 5 → 5 | 2.610 → 2.430 ms |
| `/issues/[id]` | Client | 91 → 59 | 14 → 9 | 8.190 → 5.310 ms |
| `/issues/[id]` | Developer | 87 → 56 | 12 → 9 | 7.830 → 5.040 ms |
| `/messages` | Developer | 35 → 34 | 5 → 5 | 3.150 → 3.060 ms |
| `/admin` | Admin | 29 → 24 | 7 → 7 | 2.610 → 2.160 ms |

Cột cuối lấy số câu SQL nhân 90 ms để ước tính trường hợp tuần tự hóa toàn bộ SQL. Các resolver và request chạy song song nên đây là cận trên theo mô hình RTT của kế hoạch. Phép đo chưa xác định số query nằm trên đường tới hạn hoặc thời gian tải thật trên Supabase.

Dữ liệu chính của bounty detail dùng hai query `IssueDetail` và `UnreadMessages`. Bảy request còn lại trong lượt đo sau sửa gồm ba panel của tab Overview, ba lượt gọi từ badge của thanh điều hướng và mutation ghi lượt xem chạy nền. Chạy lại riêng các thao tác qua GraphQL handler cũng cho thấy SQL giảm từ 58 xuống 42 ở client và từ 55 xuống 42 ở developer. Log của fixture `DISPUTED` cho thấy các lượt đọc đầu tiên trong `viewerCapabilities` đã chạy song song. Fixture này chưa cung cấp bằng chứng để đổi thứ tự các truy vấn phụ thuộc vào phán quyết hoặc delivery hash.
