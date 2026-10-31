# Kế hoạch đợt M: bỏ dữ liệu giả, dọn bảng legacy, đóng dự án

Thư mục: `/Users/admin/repos/capstone1-wt/integration`, nhánh `be/integration`. Ngày lập: 2026-10-31.

Đợt L đã xong và được review: L1–L5 đúng đặc tả, gate exit 0. File này là đợt cuối. Sau đợt M, toàn bộ phần logic coi như hoàn tất.

**Quy tắc làm việc giữ nguyên mục 3 của `docs/plan/parallel/AGY_FINISH.md`** (biến môi trường 3.1, gate 3.2, được phép 3.3, cấm 3.4, vòng làm 3.5, tự quyết 3.6, khi kẹt và khi dừng 3.7). Đọc lại mục 3 đó trước khi bắt đầu. Mã mục đợt này dùng tiền tố `M`. Bảng trạng thái trong `reports/CODEX.md` đặt tên `M0–M6`.

Riêng M4 có tạo migration, được phép theo 3.3. Chỉ chạy migration trên `bloody_codex_test` và `bloody_codex_local`.

---

## 1. Kết quả review đợt L

Đã kiểm diff `97912c7..550781d`.

**Đúng đặc tả, không cần sửa:**
- L2 `cancelIssue` chỉ cho hủy khi `OPEN`. FE chỉ hiện nút hủy khi `isClient && issue.status === "OPEN"`. E10 kiểm thêm việc client không hủy được bài đã nạp.
- L3 đã xóa query `escrow` và không còn code nào đọc bảng `escrows`.
- L4 job `contract-config` đọc 7 getter rồi upsert. `pending*` rỗng được ghi thành `null`. Màn admin có hiển thị.
- L5 kiểm người gọi trước khi kiểm pha. Mọi số ngày đều lấy từ hằng số chung.
- L1:
  - Guard production, host và tên DB đều có.
  - Không còn escrow giả, không còn bài `IN_PROGRESS`.
  - Token lấy từ DB.
  - Có gọi `recalcReputation`.
  - Có test chạy hai lần.

**Còn thiếu, xử lý ở đợt M:**

| Mã | Vấn đề | Mức |
|---|---|---|
| M1 | Frontend vẫn hiện dữ liệu giả | Cao |
| M2 | Seed demo dùng ví không ai đăng nhập được | Trung bình |
| M3 | Test E21 `contractConfig` không đặt timeout | Thấp |
| M4 | Bảng legacy `escrows` và `transactions` vẫn còn trong schema | Trung bình |
| M5 | Tài liệu và việc bàn giao cho người dùng | – |
| M6 | Gate cuối | – |

Chi tiết M1: marketplace và trang chủ khởi tạo bằng `MOCK_ISSUES`. Khi API lỗi thì quay lại `MOCK_ISSUES`. Trang chủ còn giữ dữ liệu giả khi DB chưa có bài nào. Số liệu "184,320", "1942", "$128,450" được viết cứng. Bảng "Recent Escrow Activity" là chữ cố định. Trang chi tiết có `demoMode`, và phần bình luận có `SAMPLE_COMMENTS`. Người dùng thật vì vậy nhìn thấy bài, số tiền và hoạt động không tồn tại.

---

## 2. Đặc tả từng mục

### M0. Kiểm mốc

1. `git log -1` là `550781d` hoặc mới hơn. `git status` chỉ có file docs mới của đợt này.
2. Commit file này và `AGY_PROMPT_M.md`: `docs(plan): add m-series finish plan`.

### M1. Bỏ toàn bộ dữ liệu giả ở frontend

**Nguyên tắc:** chỉ hiển thị dữ liệu thật từ API.
- Đang tải thì hiện skeleton có sẵn (`MarketplaceSkeleton`, `TaskSkeleton`).
- Rỗng thì hiện trạng thái rỗng có sẵn (`MarketplaceEmpty`).
- Lỗi thì hiện thông báo lỗi kèm nút thử lại.

Không đổi khung hay màu. Chỉ thay nguồn dữ liệu và bỏ những khối không có nguồn dữ liệu thật.

**File và cách sửa:**

1. `apps/web/src/components/marketplace/marketplace-view.tsx`:
   - Bỏ import `MOCK_ISSUES`.
   - State ban đầu: `issues = []`, `totalCount = 0`. Stats ban đầu là `null`. Phần hiển thị stats in `—` khi còn `null`.
   - Trong `catch` của `fetchPage`, bỏ nhánh gán `MOCK_ISSUES`. Chỉ `setRequestError(...)`, `setIssues([])` khi không phải `append`, và `setHasNextPage(false)`.
   - Bỏ giá trị `"demo"` khỏi type `DataSource`. Mọi chỗ so sánh `dataSource !== "live"` hoặc `dataSource === "demo"` đổi cho phù hợp:
     - Đếm số bài luôn dùng `totalCount`.
     - Khối lỗi hiện khi `requestError` có giá trị. Trong khối có nút "Thử lại" gọi lại `fetchPage(null, false)`.
   - Stats lấy từ `STATS_QUERY` (`marketplaceStats`). Lỗi thì giữ `null`.
2. `apps/web/src/components/home/home-page-view.tsx`:
   - Bỏ import `MOCK_ISSUES`.
   - State ban đầu: `issues = []`, `openBountiesCount = null`, `escrowTotal = null`, `activeDevelopers = null`. Hiển thị `—` khi `null`.
   - `.then` của `ISSUES_QUERY`: luôn gán kết quả, kể cả mảng rỗng. Bỏ điều kiện `!res?.issues?.edges?.length`.
   - `.then` của `STATS_QUERY`: luôn gán, kể cả khi giá trị bằng `0`. Bỏ các `if (stats.x)`. Không có pool USDC thì `escrowTotal = "0"`.
   - `.catch`: để `null`, không dùng dữ liệu giả.
   - Danh sách bài rỗng thì hiện một dòng "Chưa có bài toán nào." (thêm key i18n `noIssuesYet`, có cả vi và en).
3. `apps/web/src/components/marketplace/right-rail.tsx`:
   - Thêm prop `stats: { bountyPool: Array<{ symbol: string; formatted: string }> } | null`. `marketplace-view.tsx` truyền stats xuống.
   - "Tổng Escrow Đã Khóa": thay `$128,450` bằng tổng pool từ prop. Định dạng: `<số> <symbol>` cho từng token, nối bằng ` · `. `null` thì hiện `—`.
   - "Recent Escrow Activity": bỏ hằng `RECENT_ACTIVITIES`. Thay bằng 3 bài `COMPLETED` mới nhất, lấy bằng `ISSUES_QUERY` sẵn có với `{ status: "COMPLETED", first: 3 }`. Query do `marketplace-view.tsx` gọi rồi truyền xuống qua prop `recentCompleted`, để right-rail không tự gọi API. Mỗi dòng hiện: icon 💰, chữ `Hoàn thành: <title>` (cắt 60 ký tự), thời gian tương đối theo `createdAt`. Dùng hàm format thời gian có sẵn trong repo (tìm `grep -rn "phút trước\|formatDistance\|timeAgo" apps/web/src`). Không có bài nào thì hiện "Chưa có hoạt động."
   - `POPULAR_TAGS` giữ nguyên. Đó là phím lọc tĩnh, không phải dữ liệu giả.
4. `apps/web/src/components/marketplace/issue-detail-view.tsx`:
   - Bỏ import `MOCK_ISSUES`, state `demoMode` và nhánh tìm `demoIssue` (~dòng 122–140).
   - Không tìm thấy bài thì dùng trạng thái "không tìm thấy" mà trang đang có. Nếu chưa có thì hiện `setError("Không tìm thấy bài toán.")`.
   - Xóa mọi `demoMode` trong điều kiện (`disabled={isWorking || demoMode}` thành `disabled={isWorking}`, `!demoMode && ...` thành `...`), cùng khối banner `{demoMode && (...)}` ở ~dòng 498.
5. `apps/web/src/components/marketplace/issue-comments.tsx`:
   - Bỏ `SAMPLE_COMMENTS`, prop `demoMode`, dòng banner `demoComments`.
   - Nơi gọi `<IssueComments ... demoMode={...} />` bỏ prop này.
   - Xóa key i18n `demoComments` nếu không còn ai dùng.
6. Xóa file `apps/web/src/components/marketplace/mock-issues.ts`.
   - Type `IssueItem` nằm ở `issue-card.tsx`, không bị ảnh hưởng.
   - Sửa mọi import còn trỏ tới file đã xóa (`grep -rn "mock-issues" apps/web/src`).

**Test:**
- `apps/web/src/test/no-mock-data.test.ts` (vitest). Đọc mọi file `.ts`/`.tsx` trong `apps/web/src/components` và `apps/web/src/app`. Kiểm không file nào chứa các chuỗi: `MOCK_ISSUES`, `SAMPLE_COMMENTS`, `RECENT_ACTIVITIES`, `demoMode`, `mock-issues`, `184,320`, `128,450`.
- `fe-operations.test.ts` tự kiểm các query mới.
- E32 (UI) phải vẫn pass. Trang chi tiết bài giờ không còn nhánh demo.

Commit: `fix(m1): show only live data on marketplace, home and issue pages`.

### M2. Seed demo dùng ví Hardhat khi chạy local

**Vấn đề:** `seed-demo.ts` tạo user với ví `0x1111…`, `0x2222…`, `0x…dead`. Không ai có private key của các ví này, nên khi thử bằng MetaMask không đăng nhập được thành chủ bài hay developer của dữ liệu demo.

**Quyết định:** khi `chainId === 31337`, gán user seed vào tài khoản mặc định của Hardhat. Các địa chỉ này là địa chỉ công khai, giống nhau trên mọi máy, đã đối chiếu với `tests/e2e/.run/hardhat.log`. Với chain khác thì giữ địa chỉ hiện tại.

| Vai trò seed | Tài khoản | Địa chỉ |
|---|---|---|
| Admin | #1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| Client 1 | #2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` |
| Developer 1 | #3 | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` |
| Developer 2 | #4 | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` |
| Client 2 | #7 | `0x14dC79964da2C08b23698B3D3cc7Ca32193d9955` |
| Developer 3 | #8 | `0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f` |
| Client 3 | #9 | `0xa0Ee7A142d267C1f36714E4a8F75612F20a79720` |
| Developer 4 | giữ địa chỉ hiện tại | (chỉ để hiển thị) |

Không dùng #0 (owner), #5 (arbiter), #6 (nhận phí), để giữ vai trò on-chain tách bạch.

**Sửa:**
- Đặt bảng trên thành hằng `HARDHAT_DEMO_WALLETS` trong `seed-demo.ts`.
- Chọn ví bằng `chainId === 31337 ? HARDHAT_DEMO_WALLETS.<role> : <địa chỉ cũ>`.
- Ghi vào DB ở dạng chữ thường, như mọi chỗ khác trong repo.
- Upsert theo `walletAddress` như hiện tại.
- `docs/LOCAL_DEV.md`: thêm bảng vai trò → số tài khoản Hardhat cho người thử bằng MetaMask. Không ghi private key; ghi rằng key lấy từ output của `hardhat node`.
- Admin: thêm một dòng nhắc rằng muốn vào `/admin` thì `ADMIN_WALLETS` trong `.env` phải chứa địa chỉ #1. **Không sửa `.env`.**

**Test:** sửa `packages/database/test/seed-demo.test.ts`:
- Với chainId 31337, user client 1 có ví `0x3c44…93bc` (chữ thường).
- Không có user nào trùng ví #0, #5, #6.

Commit: `feat(m2): seed local demo users on hardhat accounts so they can sign in`.

### M3. Timeout cho test E21 `contractConfig`

`tests/e2e/e21-admin.test.ts`, test thứ hai gọi `waitFor(..., 60_000)` nhưng không truyền timeout cho `test`. Mặc định của bun test là 5 giây, nên test chỉ pass nhờ worker đã chạy job từ trước. **Sửa:** thêm `, 90_000` làm tham số thứ ba của `test(...)`. Xóa dòng trống thừa ở cuối file.

Commit: `fix(test): give the e21 contract config check its own timeout`.

### M4. Xóa bảng legacy `escrows` và `transactions`

**Đã kiểm:**
- Không còn code nào đọc hay ghi `prisma.escrow` hoặc `prisma.transaction`.
- Cột `Dispute.escrowId` không được dùng ở đâu.
- Không có field GraphQL nào trỏ tới hai model này.
- Escrow thật nằm on-chain và trong `EscrowProjection`.

**Sửa `packages/database/prisma/schema.prisma`:**
1. Xóa `model Escrow` cùng comment legacy đặt ở L3, và `model Transaction`.
2. Xóa các field quan hệ trỏ tới chúng:
   - `Token.escrows`
   - `Issue.escrow`
   - `User.escrowsAsClient` và `User.escrowsAsDev` (dòng 271–272)
   - `Dispute.escrowId` và `Dispute.escrow` (~dòng 623–624)
   - mọi field khác mà `prisma validate` báo lỗi sau khi xóa hai model

   Field `transactions Transaction[]` (dòng 485) nằm trong chính `model Escrow`, nên đi theo model đó.
3. Xóa các enum chỉ hai model này dùng: `EscrowStatus`, `TransactionType`, `TransactionStatus`. Kiểm từng enum bằng `grep -n "<Enum>" packages/database/prisma/schema.prisma`, và `grep -rn "<Enum>" apps packages tests --include=*.ts` (bỏ qua file generated). **Không xóa** `EscrowPhase` và `EscrowResolutionKind`; hai enum này vẫn đang được dùng.

**Migration:**
- Tạo bằng `bun run --cwd packages/database prisma migrate dev --name drop_legacy_escrow_tables --create-only`, chạy với `DATABASE_URL` trỏ `bloody_codex_test` (snippet 3.1, gán `DATABASE_URL=$TEST_DATABASE_URL` trong cùng lệnh).
- Đọc file SQL sinh ra. Chỉ được có `DROP TABLE`, `DROP COLUMN`, `DROP TYPE` và `DROP INDEX`/`DROP CONSTRAINT` liên quan. Có bất kỳ thứ gì khác thì dừng mục này và ghi "Bị chặn".
- Áp lên `bloody_codex_test` bằng `migrate deploy`, rồi lên `bloody_codex_local` bằng `migrate deploy`.
- Chạy `bun run db:generate` để sinh lại Prisma client và `apps/web/src/graphql/generated/pothos-types.ts`.

**Sửa code:** typecheck sẽ chỉ ra mọi chỗ còn tham chiếu. Thường gặp:
- `include` hoặc `select` có `escrow`.
- Fake DB trong test có key `escrow` hoặc `transaction`.
- `escrow-bridge.ts` chỉ dùng `payload.escrowId` từ socket, không liên quan tới model; giữ nguyên.

**Kiểm:** gate đầy đủ.

Commit: `refactor(m4): drop legacy escrow and transaction tables`.

**Bàn giao cho người dùng (ghi vào M5):** trước khi `migrate deploy` lên DB thật, phải backup. Migration này xóa dữ liệu của hai bảng, và dữ liệu đó không có code nào dùng.

### M5. Tài liệu

1. `docs/LOCAL_DEV.md`: cập nhật theo M2 (bảng tài khoản).
2. `docs/plan/parallel/DECISIONS.md`: thêm các mục:
   - `## BỔ SUNG M1 — frontend chỉ hiện dữ liệu thật`
   - `## BỔ SUNG M2 — ví demo là tài khoản Hardhat`
   - `## BỔ SUNG M4 — xóa bảng legacy`
   - Các BỔ SUNG khác phát sinh.
3. `docs/plan/parallel/reports/CODEX.md`, thêm mục `## Việc người dùng tự làm`:
   - Backup DB thật trước khi `migrate deploy` (vì có M4).
   - Thêm địa chỉ Hardhat #1 vào `ADMIN_WALLETS` của `.env` local nếu muốn vào màn admin.
   - Thử một lượt bằng MetaMask theo `docs/LOCAL_DEV.md` để xem giao diện.
   - Xóa các worktree a1–a5.
   - Push, mở PR, deploy.

Commit chung với M6.

### M6. Gate cuối

1. Chạy gate 3.2 của `AGY_FINISH.md`. Phải exit 0.
2. Chạy thêm `bun run test:e2e:local` thêm 2 lần nữa (tổng 3 lần liên tiếp). Cả 3 phải pass.
3. `reports/CODEX.md`:
   - Dòng đầu: `HOÀN TẤT <ngày giờ> (đợt M; gate exit 0; E1–E32 pass 3 lần liên tiếp)`.
   - Thêm bảng M0–M6 kèm hash.
   - Mục "Bị chặn" trống.
4. Commit `docs(report): final status after m-series`.

---

## 3. Định nghĩa xong

1. Gate exit 0. E2E pass 3 lần liên tiếp, mỗi lần in `E2E scenarios passed (E1–E32)`.
2. `git status` sạch.
3. Các lệnh sau không in gì:
   ```bash
   grep -rnE "MOCK_ISSUES|SAMPLE_COMMENTS|RECENT_ACTIVITIES|demoMode|mock-issues" apps/web/src
   ls apps/web/src/components/marketplace/mock-issues.ts 2>/dev/null
   grep -nE "^model (Escrow|Transaction) |^enum (EscrowStatus|TransactionType|TransactionStatus) " packages/database/prisma/schema.prisma
   grep -rnE "\.(escrow|transaction)\.(find|create|update|upsert|delete|count)" apps packages tests --include=*.ts
   ```
4. `grep -n "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc" -i packages/database/src/seed-demo.ts` có kết quả.
5. Có một thư mục migration mới tên chứa `drop_legacy_escrow_tables`.
6. `reports/CODEX.md` có dòng `HOÀN TẤT` của đợt M và mục "Việc người dùng tự làm".

Khi xong, in đúng ba phần:
1. Các mục M đã xong, kèm hash.
2. Kết quả gate từng lệnh, và kết quả 3 lần E2E.
3. "Bị chặn" và các mục `BỔ SUNG` mới.

---

## 4. Ngoài phạm vi (cố ý không làm)

- **Attestation (EAS):** cần schema EAS và ví attester trên chain thật. Query trả mảng rỗng là đúng với trạng thái hiện tại.
- **Bảng tin hoạt động công khai đầy đủ:** chưa có nguồn dữ liệu công khai. M1 dùng 3 bài vừa hoàn thành là đủ.
- **Đổi `clientIp`:** production chạy sau proxy có `x-forwarded-for`.
