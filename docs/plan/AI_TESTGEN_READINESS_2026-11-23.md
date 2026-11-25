# EP-7 AI sinh test · rà soát trước khi làm Đợt 1

Ngày 23/11/2026. Đối chiếu ba nguồn với code trên `main` (9d5fc0d) và Jira:
- `AI_TESTGEN_DESIGN_2026-11-22.md` (thiết kế ba tầng A/B/C)
- Artifact "BloodyRoar Testgen Pipeline" (https://claude.ai/artifact/3DDaUgtNukE9cVpYH1a2T2), bản mới hơn, chia luồng F0–F8
- `AI_TESTGEN_PLAN_2026-11-22.md` (phần "luồng hiện tại")

**Lấy artifact làm bản chuẩn.** File design cũ hơn: chưa có F3 (quan sát code thật, khuôn `__BR_EXPECT__`) và F6 (bản sửa thay thế), ngân sách cũng khác (8 lời gọi / 4 sandbox, so với 6 / 4 ở Đợt 1 trong artifact).

---

## 1. Chỗ kế hoạch lệch với code hiện tại

| # | Kế hoạch nói | Thực tế | Ảnh hưởng |
|---|---|---|---|
| 1 | `fileTree` nằm ở PR #28, chưa vào main | #28 merge 22/11. `SourceSnapshot.fileTree` đã có (migration `20261118090000_source_snapshot_file_tree`), US-35 Done | F0 chỉ còn thêm `sourceFiles`. Bớt khoảng 0,5 ngày |
| 2 | `generateTestCases` ở `ai.module.ts:157` | `ai.module.ts:139` | Chỉ là số dòng |
| 3 | `baseStatus` ghi ở `jobs/test-runs.ts:50` | `jobs/test-runs.ts:59` | Chỉ là số dòng |
| 4 | US-44, US-45, US-48 đã làm | Code nằm ở 3 PR **chồng nhau, chưa merge**: #29 (US-44) ← #30 (US-45) ← #31 (US-48). Trên `main` chưa có `focusFiles` hay `<repo_source>` | Phải merge theo thứ tự 29 → 30 → 31 trước khi bắt đầu |
| 5 | Mở lại US-46 | Jira vẫn để **Done**, code vòng sửa không có ở đâu | Mở lại ticket |
| 6 | "Brief đi vào `termsHash`, cần đọc lại" | `reservationTermsHash` (`escrow/select.module.ts:87`) băm `descriptionSha256`, tiêu chí và sha256 của `testFilePath + testCode`. Không có brief | Phải thêm `briefSha256` vào `computeTermsHash` (`packages/shared/src/escrow/hashing.ts`) và sửa `test-case-terms.db.test.ts`, `escrow-reservation.test.ts`. Reservation cũ giữ hash cũ |
| 7 | Chuyển `model-router.ts`, `guard/`, `hash.ts` sang `packages/shared` "chỉ dùng fetch và Prisma" | `hash.ts` import `../lib/logger` của web. `guard/scanner.ts` dùng `@scure/bip39` | Shared phải thêm `@scure/bip39`, logger truyền vào hoặc dùng `pino` (worker đã có) |
| 8 | Worker gọi model | `apps/worker/src/config.ts` kiểm env bằng tay, chưa có `GROQ_*`, `OPENAI_*`, `AI_HASH_KEY` | Thêm vào `loadConfig` và `.env.example` của worker |
| 9 | `aiRateLimit` đổi sang DB | Đúng là đang ở bộ nhớ (`lib/rate-limit.ts`) | Có bảng `TestGenRun` thì chỉ cần đếm run theo issue trong 24 giờ, không cần store mới |

## 2. Chỗ artifact tự mâu thuẫn hoặc còn hở

1. **Ngân sách sandbox Đợt 1 không đủ nếu chạy tuần tự.** F3 cần kết quả quan sát trước khi điền `expected`. Nhưng F5 bước 2 lại gom test quan sát và test cuối vào cùng một lần chạy. Ví dụ oreka chạy tách (sandbox 3 rồi sandbox 4) và tốn 6 lần, trong khi trần Đợt 1 là 4.
   **Đề xuất:** khuôn đã có `__BR_EXPECT__`, nên server điền cả `actual` lẫn `expected` từ cùng một khuôn và chạy chung một lô. Quan sát đỏ thì bỏ kết quả test cuối và trả `NEEDS_INFO`. Như vậy: lô 1 (quan sát + cuối), sửa 1, sửa 2, chạy lại = 4.
2. **Đọc `BR_OBSERVE` từ stdout chưa chắc làm được.** Reporter JSON của vitest không giữ console theo từng test. pytest junit chỉ có `system-out` khi bật cấu hình.
   **Đề xuất:** ở Đợt 1, ví dụ `BUG` bắt buộc có `actual`. Ví dụ không có `actual` thì bỏ qua F3, đi thẳng F4. Nhánh in ra log để Đợt 2.
3. **Trạng thái `CANDIDATE` trên `TestCase` có thể bỏ.** `runInSandbox` nhận `files: {id, path, code}[]`, không đọc DB. Ứng viên giữ trong `TestGenRun.candidates Json`. Khi `DONE`, ghi `TestCase` trong một transaction (xóa draft AI chưa duyệt như `ai.module.ts:183`). Không cần enum mới, không phải lọc query `testCases`.
4. **Thời gian.** Mỗi lần sandbox cài lại dependency (timeout cài 5 phút). 4 lần chạy có thể chạm trần 20 phút. Đo trên repo mẫu đầu tiên trước khi làm UI.
5. **Ví dụ oreka cần runner `foundry`**, nằm ngoài Đợt 1 (`SMART_CONTRACT` là `SPEC_ONLY`). Demo Đợt 1 nên dùng repo vitest hoặc pytest.

## 3. Thứ tự làm Đợt 1

Điều kiện đầu vào:
- [ ] Merge #29 → #30 → #31 vào `main`
- [ ] Mở lại US-46 trên Jira, tạo ticket mới (danh sách ở mục 4)
- [ ] Tạo nhánh mới từ `main`. Nhánh `feat/platform-fee-10` đang có thay đổi chưa commit không liên quan (thirdweb, test e2e), đừng làm chồng lên

| Bước | Việc | File chính | Kiểm bằng | Ngày |
|---|---|---|---|---|
| 1 | `classifyFailure(framework, message, newApis)` + cổng Approve theo loại lỗi. Base check thường cũng ghi `baseFailureKind` | `packages/shared/src/test-runner.ts`, `apps/worker/src/jobs/test-runs.ts:59`, `ai.module.ts:268`, migration `TestCase.baseFailureKind` | Unit test với message thật lấy từ `apps/worker/test/sandbox.test.ts`; test `Cannot find module` không Approve được | 1 |
| 2 | `sourceFiles` trong snapshot (≤ 20 KB/file, ≤ 1 MB tổng, lọc `sensitiveSourceFile`), ghi cùng transaction với `READY` | `apps/worker/src/jobs/source-snapshot.ts:82`, migration | `apps/worker/test/source-snapshot.test.ts`: file có secret không vào, file 25 KB bị bỏ | 0,5 |
| 3 | Zod `Brief` + `checkBrief` + `saveIssueBrief` + `briefSha256` trong `termsHash` | `packages/shared/src/testgen/brief.ts`, `ai.module.ts`, `escrow/hashing.ts`, migration `Issue.brief`, `Issue.briefHash` | Thiếu ví dụ → errors; file ngoài `fileTree` → errors; tên hàm lạ → warnings; người ngoài bị từ chối | 2 |
| 4 | Chuyển `model-router`, `guard`, `hash` sang `packages/shared/src/ai`, web import lại; env AI cho worker | như mục 1, dòng 7–8 | `bun run typecheck`, test guard hiện có vẫn xanh | 1 |
| 5 | Bảng `TestGenRun` + job `testgen` (`FOR UPDATE SKIP LOCKED` như `test-runs.ts:20`), mutation `startTestGeneration`, query `testGenRun`, giới hạn 5 run/issue/ngày | `apps/worker/src/jobs/testgen.ts`, `jobs/index.ts:15` | DB test: hai worker không lấy cùng run; brief đổi giữa chừng → `CANCELLED` | 1 |
| 6 | F3 + F4: khuôn `__BR_EXPECT__`, kế hoạch + `checkPlan`, sinh, kiểm tĩnh | `packages/shared/src/testgen/*.ts` (hàm thuần), job ở bước 5 | Unit test kiểm tĩnh (`.skip`, thiếu assertion, gọi mạng, hằng xuất hiện ≠ 1 lần) | 2 |
| 7 | F5: chạy lô, phân loại, sửa 2 vòng, chạy lại, bảng phủ | job ở bước 5 | Chạy thật trên 1 repo vitest + 1 repo pytest, ghi thời gian từng lần sandbox | 1 |
| 8 | F8 UI: tiến trình, bằng chứng, bảng phủ, form brief (chỉ `BUG` nếu trễ) | `components/issues/TestCasePanel` | Playwright CLI | 1 |
| | | | **Tổng** | **9,5** |

Bước 1 làm trước vì độc lập, nhỏ, và sửa ngay lỗ hổng H-2 cho cả test viết tay. Sau mỗi bước: `bun run typecheck && bun run lint`.

## 4. Ticket Jira cần chốt (chưa tạo)

- Mở lại **US-46** (Done nhưng không có code).
- Sửa **US-44**: thêm brief theo loại bounty, cổng cứng.
- Tạo mới: "classifyFailure + cổng Approve theo loại lỗi", "sourceFiles trong snapshot", "Job TESTGEN (TestGenRun)", "Quan sát code thật + khuôn `__BR_EXPECT__`", "UI tiến trình, bằng chứng, bảng phủ".
- Đợt 2 (để sau): F2, F6, F7, câu hỏi đúng/sai, US-47 thêm chỉ số theo bước.

## 5. Quyết định

**Đã chốt ngày 23/11** ở `AI_TESTGEN_TOKEN_UX_2026-11-23.md` mục 9: R1 có, R2 có, R3 có. Repo demo: dùng 1 repo vitest + 1 repo pytest nhỏ, chọn khi làm US-47. Danh sách dưới giữ lại làm lịch sử.

1. Gom quan sát + test cuối một lô (mục 2.1)? Đề xuất: **có**.
2. Đợt 1 bắt buộc `actual` cho ví dụ BUG, bỏ nhánh `BR_OBSERVE` (mục 2.2)? Đề xuất: **có**.
3. Bỏ `TestCase.status = CANDIDATE`, giữ ứng viên trong `TestGenRun` (mục 2.3)? Đề xuất: **có**.
4. Repo mẫu để demo và đo thời gian: một repo vitest, một repo pytest. Chọn repo nào?
