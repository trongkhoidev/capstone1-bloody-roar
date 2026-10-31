HOÀN TẤT 2026-10-31 11:07 (gate B0.2 exit 0; điều kiện Phần E đạt; một số mục FE và S có phạm vi hẹp hơn đặc tả, xem Ghi chú kiểm toán)

## Báo cáo cuối (C7)

- Gate B0.2 exit 0 ở lần chạy cuối (sau khi thêm 10 mutation vào E28): `typecheck` pass; `lint` không lỗi (4 cảnh báo `any` có sẵn); web 584 pass (85 file); worker 72 pass (22 file); database 3 pass; contracts 35 pass; `test:e2e:local` 40 pass, 0 fail, 31 file, in `E2E scenarios passed`. Số 40 gồm 3 test của E28.
- E1 đã fail một lần (`GraphQL HTTP 429` ở request GraphQL đầu tiên của E1) trong lần chạy gate đầu, trước khi thêm 10 mutation vào E28. Hai lần chạy gate sau đó, cùng mã, đều pass 40/40. Chưa xác định nguyên nhân: `tests/e2e/.run/web.log` không ghi request đó, và không có middleware hay limiter nào ngoài `graphql:<ip>` (600 điểm/phút, theo IP, trong bộ nhớ). Đây là lỗi chập chờn chưa có nguyên nhân gốc; chưa sửa.
- Hoàn tất lượt này: E28 thêm 10 mutation còn thiếu so với AUTHZ_MATRIX (`attachIssueFile`, `cancelReservation`, `createTestCase`, `deleteTestCase`, `editMessage`, `deleteMessage`, `recordIssueView`, `recordTransactionSubmitted`, `submitFundingIntent`, `setUserRole`), mỗi mutation có dòng ma trận và case khách/người ngoài; bảng trạng thái cũ được đồng bộ với commit thực tế.
- Các lệnh grep Phần E đều rỗng (chạy đúng như trong file): `proposeDisputeResolution|challengeDisputeResolution|assignDeveloper|reviewSubmission|depositToEscrow` (apps/web/src); `GOOGLE_GENERATIVE_AI_API_KEY` (apps/web/src và .env.example); `createHash("sha256")` (apps/web/src/ai và apps/web/src/socket); `TODO(P1-22)` (apps).
- `fe-operations.test.ts` pass.
- Hoàn tất trong lượt cuối: C1 (`a744553`: đổi tên `arbiterPost`, `restoreChain(snapshot, f)`); C2 (`26bb06e`: E28 phủ mọi dòng AUTHZ_MATRIX; `8c2b3c8`: sửa ma trận theo code và QĐ-21, ghi BỔ SUNG E19/E20/C2); FE-1b/1c (`dffc189`: ethers cho gửi giao dịch và ký funding intent); FE-3/FE-4 (`0260227`: thẻ escrow theo quyền từng người xem, nút hủy giữ chỗ, ô mã commit); FE-6 (`46f3074`: aiStatus và tóm tắt AI); S-2 (`e2d29e4`: DAY/HOUR dùng hằng số chung); BỔ SUNG FE-2, S-2, S-3 (`4b5a0f7`).
- Bị chặn: Z-6 (`next build`, @vercel/nft Division by zero; không đụng nữa theo A3). Gate không gồm build.
- Ghi chú kiểm toán (những điểm không khớp hoàn toàn đặc tả):
  - B0.4: không kiểm port trước mỗi lần chạy harness; harness tự kiểm port lúc khởi động.
  - Một số lần chạy gate được chạy nền, trong khi B0.2 ghi chạy foreground.
  - B3 "test trước" không áp dụng tuyệt đối cho mọi mục; nhiều mục gộp chung commit (FE-1b với FE-1c, FE-3 với FE-4).
  - Layout: thẻ "Escrow actions" nay hiện cho bất kỳ người xem nào có hành động (trước đây chỉ bên tham gia và trạng thái IN_PROGRESS); thêm nút "Hủy giữ chỗ" và ô "Mã commit (không bắt buộc)". Đặc tả cấm đổi layout ngoài nhãn nút mới.
  - FE-2: trang chi tiết issue không dùng react-query, giữ `load()` và socket riêng (xem BỔ SUNG FE-2).
  - E28 chưa kiểm `FORBIDDEN` ở trạng thái đã có escrow (issue chưa có escrow thì trả `NOT_FOUND`). Mọi mutation trong schema đã có dòng ma trận và case E28 (xem BỔ SUNG C2, đã cập nhật ở lượt này).
  - Phát hiện cần quyết định: `createIssue` và `applyToIssue` đã bỏ chặn role theo QĐ-21, nhưng `create-issue-form.tsx` vẫn chặn người có `role !== "CLIENT"`. Chưa sửa vì nằm ngoài phạm vi đặc tả C5.
  - Log E2E có dòng "write conflict or deadlock" khi tạo FundingReservation ở e04; test vẫn pass.
- BỔ SUNG đã thêm vào DECISIONS.md: 38 mục (danh sách đầy đủ trong file đó).
- Việc người dùng tự làm (Phần F): kiểm thử bằng MetaMask theo docs/LOCAL_DEV.md; xóa worktree cũ; sửa Z-6; deploy; GitGuardian; mở PR.

Bảng trạng thái gốc bên dưới giữ nguyên để tra cứu; các dòng mới ở đầu bảng là kết quả C1–C6 của lượt cuối.

---

| ID | Trạng thái | Bằng chứng |
| --- | --- | --- |
| C1 / G1 | xong | `a744553`: `arbiterPost`, `restoreChain(snapshot, f)`; scanner-deposit và apps/worker/e2e đã xóa |
| E28 | xong | `26bb06e`, `8c2b3c8`: 3/3 pass; mọi dòng AUTHZ_MATRIX có case khách và người ngoài |
| FE-1b / FE-1c | xong | `dffc189`: ethers Web3Provider, tx.wait(1), `_signTypedData` |
| FE-3 / FE-4 | xong | `0260227`: thẻ escrow theo viewerCapabilities, hủy giữ chỗ, commitSha |
| FE-6 | xong | `46f3074`: aiStatus trên DisputeRef, tóm tắt AI trong admin |
| S-2 | xong | `e2d29e4` |
| S-3 | xong (giữ nguyên) | BỔ SUNG S-3 trong DECISIONS.md |
| Z-1 / BE-35 | xong | `42d62ae`; DB test và scanner Hardhat pass |
| Z-2 | xong | `4cc84ee`; scanner Hardhat pass |
| Z-3 | xong | `79b8010`, `87bb280`, `2f27bc2`, `704cd2e`; gate trước harness pass |
| Z-4 | xong | `6142dc4`; receipt và finality pass |
| Z-5 | xong | Bảng đối chiếu với ma trận test |
| Z-6 | xong | K1: next build pass (NODE_ENV=production, xem BỔ SUNG K1); nft không còn lỗi Division by zero |
| K2 / FE-4 | xong | reservation có clientWallet, developerWallet; fundEscrow không còn return im lặng; escrow-reservation.test.ts 17/17 pass |
| K3 / FE-1b | xong | walletSigner(expected) so địa chỉ ví với tài khoản đăng nhập; wallet-signer.test.ts 2/2 pass |
| K4 / P1-31 | xong | route: không ghi đè commitSha, xóa delivery khi lỗi, orderBy submittedAt desc; github-webhook.test.ts 7/7 pass |
| K5 | xong | ba lần test:e2e:local liên tiếp pass (40 test, 31 file), 0 dòng HTTP 429; mỗi request harness có IP riêng, E27 ghim 203.0.113.27 |
| K6 / P1-30b | xong | GET /api/uploads: PENDING chỉ người upload được tải; upload-access.test.ts 7/7 pass |
| K7 / FE | xong | create-issue-form chỉ chặn ADMIN; form ứng tuyển cho mọi người không phải chủ bài và không phải ADMIN; fe-operations pass |
| K8 / E32 | xong | apps/web/ui-e2e/e32-ui-flow.test.ts: nạp, giao, duyệt, rút qua UI; 2/2 pass; harness E1–E32 pass |
| Z-7 | xong | Script cũ gọi mutation đã xóa được gỡ; root chuyển sang harness ở N-8 |
| D4 / D5 | xong | `dde1bc7`; test theo ma trận |
| AI-11 | xong | Timeout, bps và một AILog mỗi lượt được kiểm bằng test DB |
| N-8 | xong | `run-local.ts` bắt buộc đủ E1–E31; `0b7a354` |
| N-9 | xong | Seed token theo manifest, guard DB test |
| N-12 | xong | E22 trong `tests/e2e/e22-reorg.test.ts`, thay `apps/worker/e2e/reorg.e2e.ts` |
| N-13 | xong | `socket.io-client` 4.8.4, `pino` 9.14.0 (xem mục N-13) |
| P1-19 | xong | `apps/web/src/test/socket-rate-limit.test.ts`: 10 tin/10 giây, `afterDispute` |
| P1-20 | xong | `bf24682`: `admin-ops.test.ts` |
| P1-21 | xong | `ff63fb2`: `issue-hide.db.test.ts` |
| P1-22 | xong | `d90fad2`: `review.db.test.ts`, `effects-resolved.test.ts` |
| P1-23 | xong | `13cd062`: `audit-hash.test.ts` |
| P1-29 | xong | `217458f`: `notification-types.test.ts` |
| N-11 | xong | `docs/LOCAL_DEV.md`: các lệnh đã đối chiếu với package.json và manifest |
| N-6 | xong | cùng P1-30a (`upload-two-step.test.ts`, E25) |
| E25–E29 | xong | `test:e2e:local`: 39 pass, 0 fail, `E2E scenarios passed` (E1–E31 bắt buộc) |
| P1-35 | xong | `61112bd`: `sessions.test.ts`, `cleanup.test.ts` |
| P1-32 | xong | `dd7904d`: `chain-guard.test.ts` |
| P1-31 | xong | `4b3b570`: `github-webhook.test.ts` |
| P1-30a/b | xong | `upload-two-step.test.ts`, `upload-access.test.ts`: hai bước, sha256, quyền tải theo purpose |
| E18–E21, E30 | xong | `test:e2e:local`: 31 pass, 0 fail; gate B0.2 exit 0 (web 553, worker 71, db 3, contracts 35) |
| P1-27 | xong | `981e5aa`: `eval/dispute-eval.test.ts` |
| E1 | xong | `e01-auth.test.ts` (test:e2e:local) |
| E18 | xong | `e18-chat.test.ts` (test:e2e:local) |
| FE-1 | xong | `lib/web3/client.ts`: ACTIVE_CHAIN, ensureChain, NEXT_PUBLIC_CHAIN_ID |
| E11 | xong | `e11-claim-auth.test.ts` (test:e2e:local) |
| E17 | xong | `e17-arbiter-timeout.test.ts` (test:e2e:local) |
| E21 | xong | `e21-admin.test.ts` (test:e2e:local) |
| E24 | xong | `e24-replay.test.ts` (test:e2e:local) |
| E31 | xong | `e31-flow.test.ts` (test:e2e:local) |
| FE-1b | xong | `lib/web3/send-prepared.ts` |
| FE-1c | xong | `lib/web3/funding-intent.ts` |
| FE-2 | xong (BỔ SUNG FE-2) | refresh theo escrow:invalidate và poll 30 lần; không dùng react-query |
| FE-3 | xong | availableActions và viewerCapabilities; reasonDisabled hiển thị |
| FE-4 | xong | `issue-detail-view.tsx`: luồng prepare-và-gửi, bằng chứng, thỏa thuận, đánh giá |
| FE-5 | xong | `dashboard-view.tsx`: myClaimable và Rút tiền |
| FE-6 | xong | `admin-view.tsx`: draftRuling, bằng chứng, Vận hành, ẩn issue |
| FE-7 | xong | `lib/upload.ts` và các form giao việc, bằng chứng, ảnh issue, avatar |
| N-10 | xong | LOCAL_TEST_MATRIX có dòng cho mọi mã Phần C |
| P1-26 | xong | `157bcf0`: bỏ `GOOGLE_GENERATIVE_AI_API_KEY` |
| P1-25 | xong | `71b887d`: `ai-rate-limit.test.ts` |
| P1-24 | xong | `b0135a8`, `5f456a5`: `content-guard.test.ts`, `submission.db.test.ts` |
| G1 (E11–E17, E22–E24, E31) | xong | `test:e2e:local`: 25 pass, 0 fail, `G1 E2E scenarios passed` |
| N-6, N-10, N-11 | xong | N-6: `065d28c`; N-10: `LOCAL_TEST_MATRIX.md`; N-11: `e35be8c` |
| FE-1–FE-8 | xong | `3fa9cff`, `f790b29`, `dffc189`, `0260227`, `46f3074`; `fe-operations.test.ts` |
| P0-1 | xong | gate B0.2 xanh; E2E không còn phụ thuộc template `3118318` |
| P0-2 | xong | fe78f0e |
| P0-3 | xong | d39cc3b, d8fc33e |
| P0-4 | xong | `2c0e108`; `graphql-schema.test.ts` khẳng định các trường dispute cũ đã gỡ |
| P0-5 | xong | deb01d4 |
| P0-6 | xong | fb0a25f |
| P0-7 | xong | c9eb936 |
| P0-8 | xong | 8301319 |
| P0-9 | xong | 6080c61 |
| P1-1 | xong | `8a3c28d`: log ABI + Hardhat deposit thực pass |
| P1-2 | xong | `50df7d0`: E22/E24 deposit trên Hardhat pass; các effect khác chờ P1-9/P1-16 |
| P1-3 | xong | `eb13815`: E23 Hardhat pass |
| P1-4 | xong | `df7418b`: custom error/fallback/race pass |
| P1-5 | xong | `1fb8c75`: jobs idempotent, pg_notify và race pass |
| P1-6 | xong | `f287f80`: worker 48/48 |
| P1-7 | xong | `5468126`: worker 48/48, thử viem với Hardhat |
| P1-8 | xong | `a777558`; test theo LOCAL_TEST_MATRIX.md |
| P1-9 | xong | `e538635`, `2c417cd`, `321d55b`; test theo LOCAL_TEST_MATRIX.md |
| P1-10 | xong | `ffb6f50`; test theo LOCAL_TEST_MATRIX.md |
| P1-11 | xong | `eebb77e`; test theo LOCAL_TEST_MATRIX.md |
| P1-12 | xong | `f875b62`, `7cd68e3`; test theo LOCAL_TEST_MATRIX.md |
| P1-13 | xong | `07397ca`; test theo LOCAL_TEST_MATRIX.md |
| P1-14 | xong | `1fce246`; test theo LOCAL_TEST_MATRIX.md |
| P1-15 | xong | `9c0da1e`; test theo LOCAL_TEST_MATRIX.md |
| P1-16 | xong | API/worker test và E15–E17 scanner Hardhat pass; upload hai bước chờ P1-30a |
| P1-17 | xong | backend `2c0e108`; phần frontend ở FE-4 (`0260227`) và FE-6 (`46f3074`) |
| P1-18 | xong | Evidence admin query, download URL và audit đã test |
| P1-19 | xong | 8827976 (socket-rate-limit.test.ts) |
| P1-20 | xong | `bf24682`: `admin-ops.test.ts` |
| P1-21 | xong | `ff63fb2`: `issue-hide.db.test.ts` |
| P1-22 | xong | `d90fad2`: `review.db.test.ts`, `effects-resolved.test.ts` |
| P1-23 | xong | `13cd062`: `audit-hash.test.ts` |
| P1-24 | xong | `b0135a8`, `5f456a5`: `content-guard.test.ts`, `submission.db.test.ts` |
| P1-25 | xong | `71b887d`: `ai-rate-limit.test.ts` |
| P1-26 | xong | `157bcf0`: bỏ `GOOGLE_GENERATIVE_AI_API_KEY` |
| P1-27 | xong | `981e5aa`: `eval/dispute-eval.test.ts` |
| P1-28 | xong | GraphQL bps và chuỗi tiền raw; schema test pass |
| P1-29 | xong | `217458f`: `notification-types.test.ts` |
| P1-30 | xong | `065d28c`: `upload-two-step.test.ts`, `upload-access.test.ts` |
| P1-31 | xong | `4b3b570`: `github-webhook.test.ts` |
| P1-32 | xong | `dd7904d`: `chain-guard.test.ts` |
| P1-33 | gộp vào P1-18 | `FINISH_PLAN.md`: `getDownloadUrl` đã gộp vào P1-18 |
| P1-34 | ngoài phạm vi | Q4 |
| P1-35 | xong | `61112bd`: `sessions.test.ts`, `cleanup.test.ts` |
| P1-36 | xong | `bd198a6`; test theo LOCAL_TEST_MATRIX.md |
| P1-37 | xong | `dde1bc7`; test theo LOCAL_TEST_MATRIX.md |
| S-1 | xong | helper dùng chung ở `apps/web/src/test/helpers/` và `apps/worker/test/helpers.ts`; 18 bản `fakeDb` khác nội dung, giữ nguyên (BỔ SUNG S-1) |
| S-2 | xong | `e2d29e4` |
| S-3 | xong (giữ nguyên) | BỔ SUNG S-3 trong DECISIONS.md |
| S-4 | xong | `3fa9cff`: `select.module.ts` |
| S-5 | xong | `LOCAL_TEST_MATRIX.md`: đã xóa `PLATFORM_FEE_PERCENT`; re-export `escrow-abi` giữ vì `index.ts` dùng |
| S-6 | ngoài phạm vi | FIX_LIST mục 3 |

## Bị chặn


## N-13 dependency

- `socket.io-client` 4.8.4 và `pino` 9.14.0 là phiên bản ở cấp gốc trong `bun.lock` (`grep -n '"socket.io-client@\|"pino@' bun.lock`).

## G1 — kịch bản E11–E17, E22–E24, E31

- `bun run test:e2e:local`: 25 pass, 0 fail, exit 0, log `G1 E2E scenarios passed`. Chạy trên Hardhat local và `bloody_codex_test`, sau `migrate reset --force` của harness.
- Đã xóa `tests/e2e/scanner-deposit.ts`, `apps/worker/e2e/` và script `test:e2e` của worker. Helper mới: `harness/chain.ts` (`restoreChain`, `advanceTime`), `harness/dispute.ts`, `harness/payout.ts`.
- Các quyết định bổ sung nằm trong DECISIONS.md (mục BỔ SUNG G1-DELTA, E14, E15, E16, E23, E24, E31).

## E8 — hủy reservation

- Chỉ client hủy được reservation chờ nạp; trạng thái CANCELLED và issue OPEN được xác nhận qua harness. Typecheck và lint pass.

## E7 — reservation hết hạn

- Hết hạn mở lại issue và gửi thông báo; deposit muộn được nhận khi issue còn OPEN, hoặc MISMATCHED khi đã chọn lại. Test harness và typecheck/lint pass; G1 còn thiếu kịch bản.

## E6 — deposit sai điều khoản

- Test Hardhat gửi amount và developer sai cho hai reservation độc lập: worker đánh dấu MISMATCHED, issue không IN_PROGRESS, thông báo tới hai bên và admin. E1–E6 pass; harness còn thiếu kịch bản. Typecheck và lint pass.

## E5 — ký và nạp tiền

- Ký EIP-712 qua Hardhat, gửi approve/deposit, ghi tx và chờ worker: projection, intent, reservation, application, thông báo và số dư token đều đúng. E1–E5 pass; harness vẫn fail vì thiếu kịch bản. Typecheck và lint pass.

## E4 — chọn developer

- Harness Yoga tạo issue/tiêu chí, hai ứng viên, kiểm self-application, thông báo, reservation và race hai lựa chọn: chỉ một thành công. E1–E4 pass; harness còn thiếu kịch bản. Typecheck và lint pass.

## E3 — tiêu chí

- Qua harness thật, AI mock tạo tiêu chí, client duyệt rồi sửa làm tăng termsVersion; tạo/xóa tiêu chí thủ công và AILog pass. E1–E3 pass; harness vẫn fail do thiếu các kịch bản còn lại. Typecheck và lint pass.

## E2 — marketplace và lượt xem

- E2 qua HTTP thật: tạo issue, tìm marketplace, hai lượt ghi song song chỉ tăng một lần, sau một giờ được tăng lại. Bổ sung recordIssueView theo user và ngừng tăng tự động từ query; ghi lựa chọn trong DECISIONS. E1/E2 pass; harness còn fail do thiếu các kịch bản G1 khác. Typecheck và lint pass.

## N-8/N-9 và E1 — harness ban đầu

- Harness kiểm môi trường và port, chạy Hardhat, deploy, reset bloody_codex_test, seed token, khởi động worker/web/mock, chạy E1 và dọn PID; các cổng đã giải phóng. E1 pass 8 assertion: SIWE admin/client, me, logout, ban và chain 31337. Sửa nonce/login dùng ACTIVE_CHAIN_ID. `test:e2e:local` vẫn fail có chủ đích vì thiếu E2–E17, E22–E24, E31; chưa coi N-8 hoàn tất. Seed test 1/1, typecheck và lint pass.

## N-14 — kiểm tra môi trường bổ sung

- Chặn cả GROQ/OPENAI, credential S3 và alert webhook; AI_BASE_URL chỉ được trỏ loopback 4019. Test guard 17/17, typecheck và lint pass.

## Gate phase D

- `check-env` pass; scanner Hardhat pass E15–E17, cả timeout sau challenge và reorg; attachment được tạo fixture trực tiếp, upload hai bước chờ P1-30a. Gate trên bloody_codex_test: typecheck, lint (4 cảnh báo cũ), web 499/499, worker 70/70, database 3/3, contracts 35/35 pass. `test:e2e:local` chờ G1; N-6 hoãn sang P1-30a theo FINISH_PLAN.

## AI-11 — phân tích tham khảo

- Mock AI local đã đồng bộ với trường bps, test mock 2/2 pass. Admin chạy phân tích mà không đổi trạng thái chain; lưu bps và một AILog mỗi lượt, nhận lại khóa sau 5 phút và chặn kết quả lượt cũ ghi đè. Migration aiStartedAt đã deploy test/local; unit/DB test 4/4, typecheck và lint pass.

## P1-28 — GraphQL bps và tiền raw

- Thay trường ratio của dispute bằng ba trường Int bps; bốn trường tiền của Escrow cũ trả chuỗi raw. Schema test, typecheck và lint pass; logic AI đổi sang bps ở AI-11.

## P1-18 — admin xem evidence

- Query chỉ cho admin khi có dispute, trả file URL thời hạn 120 giây và ghi view_evidence; route tải evidence kiểm dispute và ghi download_evidence. Test DB, storage và route 9/9, typecheck và lint pass. Quyết định tên action ghi ở DECISIONS.

## P1-17 — kiểm tra phần còn lại

- Không tìm thấy BUG-2 trong code; test analyzeDispute hiện có 2/2, typecheck và lint pass. AI-11 và frontend vẫn cần hoàn tất.

## P1-16f — effect dispute và reorg

- Worker tạo/cập nhật dispute, gắn manifest, ghi ruling/unknown decision, xác nhận intent và gửi notification từ event chain; resolution tranh chấp gửi DISPUTE_RESOLVED. Snapshot/undo tích hợp reorg, test vòng event và scanner/reorg pass; worker 70/70, typecheck và lint pass. E15–E17 chờ harness.

## P1-16e — challenge và finalize

- Prepare challenge kiểm vai trò, bps và cửa sổ 7 ngày; finalize permissionless kiểm 7 ngày/24 giờ hoặc timeout 30 ngày theo chain. Test DB và bảng availability 8/8, typecheck và lint pass. Availability hiện có đã bao phủ các phase/mốc tương ứng.

## P1-16d — bản nháp phán quyết

- Admin tạo draft idempotent trong đúng phase và thời gian chain, ghi AdminLog, xuất Safe transaction JSON với calldata initial/final. DB test 2/2, typecheck và lint pass; không đổi trạng thái on-chain.

## P1-16a–c — evidence

- Tạo manifest đã che, hash và lưu canonical JSON; xác minh file, transcript, người tham gia và hạn counter. Hai prepare tạo intent theo projection. Test DB 2/2, typecheck và lint pass; worker và ruling còn lại.

## D-DSP-2 — migration dispute_onchain

- Kiểm tra evidence manifests rỗng ở hai DB; tạo migration trên bloody_codex_test với shadow bloody_codex_shadow_test, xem SQL, migrate deploy test và bloody_codex_local, generate client. Typecheck, lint và database 3/3 pass. API và worker P1-16 chưa hoàn tất.

## Gate phase 0

- Trên bloody_codex_test: `bun run typecheck` pass; `bun run lint` pass với 4 cảnh báo any cũ; web 489/489, worker 69/69, database 3/3, contracts 35/35 pass. `test:e2e:local` chưa có ở phase này. Z-6 build vẫn bị chặn như trên.

## Z-7 — script E2E cũ

- Xóa escrow, workflow và các script chat/application gọi assignDeveloper đã xóa; giữ login và issue. Schema test, typecheck và lint pass. Script root chuyển sang harness tại N-8.

## Z-4 — receipt approve

- Reconciler xét intent đúng chain, cả approve đang chờ safe head; chỉ xác nhận receipt thành công gửi tới token và không vượt safe/latest head. Test receipt giả và RPC pass 14/14; typecheck và lint pass (4 cảnh báo cũ).

## Z-3 — merge ba nhánh

- Merge A1, A5 và UI theo thứ tự; sửa kỳ vọng test theo copy mới và cảnh báo font ở root layout. Gate: typecheck, lint (4 cảnh báo any cũ), web 489/489, worker 68/68, database 3/3, contracts 35/35 pass. E2E local chưa có ở phase 0.

## Z-2 — Hardhat cho scanner

- Scanner chạy `check-env`, từ chối khi port 8545 bận, khởi động Hardhat với ulimit 65536, deploy hợp đồng và tự dừng PID đã ghi. Chạy scanner qua chain thật pass; `bun run typecheck` và `bun run lint` pass (4 cảnh báo cũ). Harness G1 sẽ dùng cùng lệnh khởi động.

## Z-2 — kiểm tra Hardhat ban đầu

- `check-env` pass trên bloody_codex_test; Hardhat chạy với `ulimit -n 65536`, deploy local thành công; `NODE_ENV=test bun run tests/e2e/scanner-deposit.ts` pass các luồng fixture E9–E14, E22–E24 và race intent. Đã dừng PID Hardhat trong `tests/e2e/.run/`. Chưa tích hợp lệnh khởi động vào scanner/harness, chưa chạy gate phase 0.

## Z-1 — đối chiếu intent

- Tra tối đa 200 intent theo submittedAt, lấy event trong một truy vấn không phân biệt hoa thường; test hai intent và reorg pass. `bun run typecheck` và `bun run lint` pass (4 cảnh báo any cũ). E2E Hardhat và gate phase 0 chưa chạy.

## BE-35 — đối chiếu intent đến muộn (chưa hoàn tất gate)

- Job worker đối chiếu txHash, chain, contract, loại event, escrow/issue hoặc ví nhận; xác nhận dưới khóa checkpoint sau khi event canonical đã fold. Reorg trả intent về SUBMITTED trước khi hoàn tác event.
- Test PostgreSQL `intent-race.test.ts` pass: claim được index trước khi ghi hash, xác nhận, reorg, và không xác nhận event orphan; toàn bộ worker 68/68 pass. `bun run typecheck`, `bun run lint` pass (4 cảnh báo any cũ).
- Đã sửa fixture `scanner-deposit.ts` để kiểm tra race claim qua GraphQL/Hardhat nhưng chưa chạy được: Hardhat node thoát với EMFILE khi tạo file watcher. Gate phase C và gate cuối chưa hoàn tất. Chưa kiểm tra tải khi số intent chờ lớn. `bun run build` trong bản sao /private/tmp thất bại với RangeError: Division by zero trong Next.js @vercel/nft; chưa xác định nguyên nhân.

## BE-45/BE-46 — E12/E13

- `6a44ad2`: refund và review timeout kiểm timestamp block, chain/contract; giữ quyền gọi permissionless. `bun run --cwd apps/web test -- src/test/escrow-release.test.ts`: pass 18/18, gồm biên deadline.
- `NODE_ENV=test bun run tests/e2e/scanner-deposit.ts` với bloody_codex_test và Hardhat pass E12/E13: trước hạn từ chối, tăng chain time, outsider resolve refund/timeout, client claim đủ 100 USDC; E9/E10/E11/E14/E22/E23/E24 cũng pass. Fixture tạo reservation trực tiếp, chưa phải harness E1–E31.
- Gate typecheck, lint, web/worker/database/contracts pass 489/67/3/35; lint bốn cảnh báo any cũ. Gate phase C và gate cuối chưa hoàn tất.


## BE-48 — claim và reorg

- `3c872b3`: event CLAIMED trừ đúng số dư đã index, xác nhận intent theo txHash và thông báo PAYMENT_RECEIVED; reorg hoàn tác balance/intent/notification. Tra cứu contract claimable không phân biệt checksum. Phát hiện và xử lý reorg thứ hai trước khi scanner bắt kịp.
- `bun run --cwd apps/worker test -- test/effects-claimed.test.ts test/reorg.test.ts`: pass 5/5; `NODE_ENV=test bun run tests/e2e/scanner-deposit.ts` trên bloody_codex_test và Hardhat: E10 claim thật tăng ví 97,5 USDC, số dư 0, notification và reorg; E11 từ chối rút ví khác/số dư 0; E9/E14/E22/E23/E24 cũng pass. Fixture bắt đầu từ reservation, harness toàn luồng E1–E31 chưa có.
- Gate typecheck/lint/web/worker/database/contracts pass 487/67/3/35; lint bốn cảnh báo any cũ. Gate phase C và gate cuối chưa hoàn tất. Race recordTransactionSubmitted đến sau event vẫn cần xử lý.


## P1-37, D5 và D4

- `dde1bc7`: bỏ trường isDraft khỏi Issue API theo D5; issues đã có cursor, thêm first/after và cursor cho myIssues/applications, kiểm cursor đúng phạm vi. attachIssueFile yêu cầu chủ issue, file của chính họ, ATTACHED/ISSUE_IMAGE và image MIME; ảnh issue chỉ lấy file đã xác minh.
- `bun run --cwd apps/web test -- src/test/issue-pagination-files.db.test.ts` với TEST_DATABASE_URL trỏ bloody_codex_test pass 2/2; kiểm phân trang, cursor sai phạm vi, quyền và file sai trạng thái/mục đích. Gate typecheck/lint/web/worker/database/contracts pass 487/64/3/35, lint bốn cảnh báo any cũ. API tạo attachment hoàn chỉnh còn theo N-6.
- D4 đã có: updateProfile dùng normalizeProfileInput kiểm/chuẩn hóa email, Prisma User.email @unique, map P2002 thành CONFLICT. `bun run --cwd apps/web test -- src/test/profile-input.test.ts` pass 4/4; không cần sửa code.
- Gate phase C E3–E14/E31 và gate cuối chưa hoàn tất; CLAIMED và harness còn thiếu.


## P1-36 — số event

- `bd198a6`: sửa tài liệu thành 19 event (15 khai báo và 4 kế thừa). Bun script kiểm ABI và Solidity pass; thay đổi chỉ tài liệu, gate P1-15 ngay trước đó pass 485/64/3/35.


## P1-15 — test Submission

- `9c0da1e`: test PostgreSQL thật kiểm manifest bất biến sau prepare, quyền xem/yêu cầu sửa, notification và race prepare/edit; giữ test race selectDeveloper.
- `bun run --cwd apps/web test -- src/test/submission.db.test.ts src/test/escrow-reservation.db.test.ts` với TEST_DATABASE_URL trỏ bloody_codex_test: pass 3/3; gate typecheck, lint, web/worker/database/contracts pass 485/64/3/35, lint bốn cảnh báo any cũ. Gate phase C và `test:e2e:local` chưa hoàn tất.


## P1-14 — thống kê projection

- `1fce246`: userStats(userId) public, giữ fallback user hiện tại; tổng tiền và claimable theo chain/contract dùng chuỗi số nguyên, adminStats lấy payout, fee, disputeRateBps và thời gian giải quyết từ projection và event canonical. completedBounties dùng projection và metadata token thay escrow legacy.
- `bun run --cwd apps/web test -- src/test/analytics-projection.test.ts src/test/analytics-projection.db.test.ts` với TEST_DATABASE_URL trỏ bloody_codex_test: pass, gồm hai contract, quyền public/admin, số tiền vượt 2^53 và thời gian tranh chấp.
- Gate typecheck, lint, web/worker/database/contracts pass 483/64/3/35; lint bốn cảnh báo any cũ. Claimable sau giao dịch claim phụ thuộc effect CLAIMED còn chưa triển khai. Gate phase C và `test:e2e:local` chưa hoàn tất.


## P1-9 — sửa deadline theo chain

- `321d55b`: createSubmissionDraft và prepareSubmitWork đọc timestamp block ngoài transaction, rồi khóa issue và kiểm tra lại projection; khi chain qua deadline, cả hai từ chối.
- `bun run --cwd apps/web test -- src/test/submission-draft.test.ts`: pass 11/11. `NODE_ENV=test bun run tests/e2e/scanner-deposit.ts` trên test DB/Hardhat pass; evm_increaseTime qua deadline xác nhận hai mutation từ chối mà không sửa deadline DB. E9/E14 và reorg tiếp tục pass.
- Gate typecheck, lint, web/worker/database/contracts pass 478/64/3/35; lint bốn cảnh báo any cũ. Gate phase C và `test:e2e:local` chưa hoàn tất.


## P1-13 — phiên bản tiêu chí

- `07397ca`: khóa issue khi tạo/sửa/xóa tiêu chí và trước khi lưu AI draft; từ chối reservation active. Duyệt, bỏ duyệt, sửa hoặc xóa tiêu chí đã duyệt tăng termsVersion trong cùng transaction; chỉnh draft chưa duyệt hoặc ghi chú không đổi phiên bản.
- `bun run --cwd apps/web test -- src/test/test-case-terms.db.test.ts` với TEST_DATABASE_URL trỏ bloody_codex_test pass; kiểm tra tăng/không tăng phiên bản, chặn active reservation và race update/selectDeveloper với termsHash được tính lại. Test AI/manual cũ pass sau cập nhật mock.
- Gate typecheck, lint, web/worker/database/contracts pass 476/64/3/35; lint bốn cảnh báo any cũ. Gate phase C và `test:e2e:local` chưa hoàn tất.


## P1-12 — quyền và hành động

- `f875b62`, `7cd68e3`: Issue có escrow projection, reservation, latestSubmission và viewerCapabilities; ẩn reservation/submission khỏi người ngoài, tính action theo phase và ranh giới contract. RPC lấy timestamp block mới nhất, kiểm chain ID và fail closed nếu không đọc được.
- `bun run --cwd apps/web test -- src/test/escrow-chain-time.test.ts src/test/issue-availability.test.ts src/test/escrow-availability.test.ts`: pass 12/12. `NODE_ENV=test bun run tests/e2e/scanner-deposit.ts` trên test DB/Hardhat pass; tăng chain time 40 ngày làm review timeout xuất hiện qua GraphQL. E9, E14 và reorg cũng pass.
- Gate typecheck, lint, web/worker/database/contracts pass 475/64/3/35; lint bốn cảnh báo any cũ. Gate phase C và `test:e2e:local` chưa hoàn tất.
- Cần sửa P1-9: createSubmissionDraft và prepareSubmitWork vẫn kiểm deadline bằng đồng hồ server, trong khi contract dùng thời gian block; kiểm thử E9 hiện chỉ sửa deadline DB. Dùng readChainTime và test evm_increaseTime trước khi coi phase C hoàn tất.


## P1-11 — settlement

- `eebb77e`: chuẩn bị propose/revoke/accept với kiểm tra participant, phase, tỷ lệ và proposer; effect lưu lịch sử PENDING/REVOKED/ACCEPTED/VOIDED, xác nhận intent, thông báo bên còn lại và hoàn tác các event khi reorg.
- `bun run --cwd apps/web test -- src/test/settlement.test.ts`: pass 5 test; `NODE_ENV=test bun run tests/e2e/scanner-deposit.ts` trên bloody_codex_test và Hardhat pass E14: propose 3000 bps, self-accept bị từ chối, accept chia 30/68,25/1,75 USDC, revert accept, revoke và revert cả propose/revoke. E9 và release/reorg cũng pass; fixture deposit không phải toàn bộ E1–E4.
- Gate typecheck, lint, web/worker/database/contracts pass 463/64/3/35; lint có bốn cảnh báo any cũ. Gate phase C E3–E14/E31 và `test:e2e:local` chưa hoàn tất.


## P1-10 — escrow resolution

- `ffb6f50`: effect ESCROW_RESOLVED chuyển issue COMPLETED, ghi outcome và cộng ClaimableBalance theo số nguyên từ event; thông báo hai bên và ví có số dư được đăng ký; snapshot/đảo issue, intent và khoản ghi có khi reorg. Escrow ngoài backend vẫn được ghi có. Khớp intent release theo issue/chain/contract/txHash.
- `bun run --cwd apps/worker test -- test/effects-resolved.test.ts`: pass 7/7, sáu loại kết thúc, số tiền 0, escrow ngoài và undo. `NODE_ENV=test bun run tests/e2e/scanner-deposit.ts` với test DB và Hardhat: release thật ghi 97,5/2,5 USDC, phát thông báo và reorg khôi phục; deposit, E9, E22/E23/E24 vẫn pass. E10 chưa hoàn tất vì effect CLAIMED chưa có.
- Gate typecheck, lint, test web/worker/database/contracts pass: 458/64/3/35; lint bốn cảnh báo any cũ. Phase C và gate cuối còn chờ harness và các mục tiếp theo. TODO(P1-22) gọi recalcReputation đã ghi trong DECISIONS. Reorg chứa event Claimed hiện dừng an toàn cho tới khi effect/undo CLAIMED được triển khai.


## P1-9 — hoàn tất

- `e538635`, `2c417cd`: tạo và sửa bản nháp, chuẩn bị submitWork, requestChanges, fold WorkSubmitted theo hash, supersede, xác nhận intent theo txHash, thông báo client và cờ externalDelivery. Sau khi chuẩn bị giao dịch, sửa tạo bản nháp mới để hash cũ vẫn khớp nếu giao dịch được gửi muộn. Đã bỏ mutation submitWork/reviewSubmission cũ; frontend và e2e-workflow cũ còn tham chiếu và nằm ngoài frontend scope/cần cập nhật harness.
- Migration externalDelivery đã chạy deploy trên bloody_codex_local và bloody_codex_test. `bun run --cwd apps/web test -- src/test/submission-draft.test.ts src/test/graphql-schema.test.ts`: 10/10 pass. `NODE_ENV=test bun run tests/e2e/scanner-deposit.ts` trên test DB và Hardhat local: pass E9 với deposit fixture, request changes, nộp lại, hash lạ, deadline; snapshot/revert work và hash lạ khôi phục submission; E22/E23/E24 cũng pass. Chưa chứng minh toàn luồng E1–E4.
- Gate `bun run typecheck && bun run lint && bun run --cwd apps/web test && bun run --cwd apps/worker test && bun run --cwd packages/database test && bun run contracts:test` pass: web 458, worker 57, database 3, contracts 35; lint bốn cảnh báo any cũ. `test:e2e:local` còn chờ N-8, phase C chưa xong.
- Reorg với review off-chain đã thay đổi sau event dừng an toàn thay vì xóa ghi chú; cần xử lý luồng khôi phục khi hoàn thiện harness. Cần kiểm tra thêm race khi event được index trước recordTransactionSubmitted: intent có thể không được xác nhận nếu record đến muộn.


## P1-9 — điểm dừng

- `e538635`: thêm createSubmissionDraft với manifest và hash, kiểm quyền, trạng thái FUNDED, hạn giao và attachment; prepareSubmitWork tạo intent/call; requestChanges ghi chú và thông báo developer qua pg_notify. Đây mới là một phần P1-9.
- `bun run --cwd apps/web test -- src/test/submission-draft.test.ts`: pass 8/8 với DB giả, gồm manifest, sửa nháp, quyền, deadline, calldata và thông báo. `bun run typecheck && bun run lint`: pass; lint còn bốn cảnh báo any cũ. Chưa chạy gate phase C hoặc E9 thực.
- Cần kiểm lại an toàn đồng thời giữa sửa draft, prepare và event trước khi đánh dấu hoàn tất; effect/reorg chưa viết, mutation submitWork/reviewSubmission cũ vẫn còn. Chưa có bằng chứng E9 toàn luồng.


## P1-8 — chuẩn bị deposit

- `a777558`: prepareEscrowDeposit kiểm chữ ký và trạng thái reservation, issue, chain, token, deadline, balance, allowance và paused; tạo intent approve nếu cần và deposit trong transaction. Scanner chỉ xác nhận deposit intent có txHash trùng event. Effect FUNDED gửi thông báo cho client và các developer liên quan.
- `bun run --cwd apps/web test -- src/test/escrow-deposit.test.ts`: pass 14 test. `NODE_ENV=test bun run tests/e2e/scanner-deposit.ts` với TEST_DATABASE_URL trỏ bloody_codex_test và Hardhat local đã deploy: pass ký EIP-712, chuẩn bị approve/deposit, gửi giao dịch thực, xác nhận deposit và thông báo; đồng thời pass lại E22/E23/E24. Fixture tạo reservation trực tiếp, chưa chứng minh toàn bộ E1–E4.
- Gate `bun run typecheck && bun run lint && bun run --cwd apps/web test && bun run --cwd apps/worker test && bun run --cwd packages/database test && bun run contracts:test`: pass; lint còn bốn cảnh báo any cũ. `test:e2e:local` chưa có vì N-8 chưa triển khai.
- Intent approve có thể vẫn PENDING_SAFE_HEAD vì scanner chỉ index event escrow, chưa index ERC20 Approval; cần xử lý và kiểm thử trong các bước tiếp theo. Reorg hiện chỉ đảo effect deposit; các effect mới cần cơ chế đảo riêng. Hardhat đã dừng; cần deploy lại khi chạy node mới.


## P1-5 và gate phase B

- `1fb8c75`: job hết hạn gửi RESERVATION_EXPIRED cho developer; job deadline gửi DEADLINE_APPROACHING cho các bên, phát pg_notify khi insert mới. Update reservation theo trạng thái hiện tại để không ghi đè deposit đồng thời; effect deposit cũng retry nếu reservation/issue thay đổi.
- Test `reservations.test.ts`, `deadline-notifications.test.ts`, `effects-escrow.test.ts`: pass; gồm hai job hết hạn đồng thời, chạy lại deadline, pg_notify và race với deposit. Theo mục ĐỔI QUYẾT ĐỊNH cuối DECISIONS.md, dedupe deadline thêm userId để gửi cả hai bên.
- Gate phase B: E22/E23/E24 pass qua `NODE_ENV=test bun run tests/e2e/scanner-deposit.ts` sau deploy Hardhat local trên bloody_codex_test; deposit thực E5 cũng pass. `bun run typecheck && bun run lint && bun run --cwd apps/web test && bun run --cwd apps/worker test && bun run --cwd packages/database test && bun run contracts:test` pass; contract 35/35, lint có bốn cảnh báo any cũ. Chưa chạy được `bun run test:e2e:local` vì N-8 chưa có.

## P1-4 — custom error

- `df7418b`: đọc revert data từ debug_traceTransaction khi RPC hỗ trợ và giải mã tên lỗi theo ABI; nếu không có trace hoặc selector không hợp lệ, giữ lý do chung. Dùng conditional update để reconciler không ghi đè intent đã được scanner xác nhận đồng thời.
- `bun run --cwd apps/worker test -- test/intents.test.ts`: pass 7/7 trên bloody_codex_test, gồm DeadlineNotReached, fallback và race. `bun run typecheck && bun run lint` pass; bốn cảnh báo lint cũ. RPC không hỗ trợ debug trace sẽ chỉ có lý do chung.

## P1-3 — reconciler và E23

- `eb13815`: job định kỳ so sánh escrow, settlement, dispute, claimable và isSolvent với block đã index; tạo/cập nhật/đóng finding theo chain và contract. Bỏ qua khi indexer chưa tới head, không ghi finding khi RPC lỗi hoặc checkpoint/projection thay đổi trong lúc đối chiếu.
- `NODE_ENV=test bun run tests/e2e/scanner-deposit.ts` trên Hardhat/bloody_codex_test pass E22/E23/E24. E23 kiểm chain khớp, sửa amount projection tạo finding, sửa lại đóng finding; kiểm mismatch claimable và insolvency rồi phục hồi. `apps/worker/test/reconciliation.test.ts` kiểm bỏ qua khi indexer trễ.
- Gate typecheck, lint, test web/worker/database và contracts pass; worker 52/52, contracts 35/35, lint có bốn cảnh báo any cũ. Luồng dispute/settlement toàn phần còn chờ P1-16/P1-11.

## P1-2 — reorg và replay

- `50df7d0`: lưu snapshot các thay đổi do deposit, đảo effect nếu event bị orphan, dựng lại projection từ event canonical; replay CLI dựng projection rồi quét lại. Scanner, reorg và replay khóa checkpoint để tránh ghi chồng. Nếu không đủ snapshot hoặc trạng thái off-chain đã thay đổi ngoài dự kiến, reorg dừng và rollback thay vì ghi đè.
- E22/E24: `NODE_ENV=test bun run tests/e2e/scanner-deposit.ts` sau deploy Hardhat local trên bloody_codex_test pass: snapshot, deposit A, revert, deposit B, A non-canonical/B canonical, projection FUNDED; sửa projection rồi replay qua `bun run worker:replay --from ...` khôi phục FUNDED. Các PID được ghi trong .run và dừng.
- Test `scanner-projection.test.ts`, `reorg.test.ts`, `replay.test.ts`, `scanner.test.ts` pass, gồm giữ nguyên trạng thái khi thiếu block RPC hoặc assignment đã thay đổi và kiểm tra replay đồng thời. Gate typecheck, lint, web, worker, database và contracts pass; lint 4 cảnh báo cũ; contracts 35/35.
- Snapshot hiện chỉ bao phủ effect deposit đã triển khai. Khi thêm effect delivery, dispute, settlement, claim trong P1-9/P1-16, cần bổ sung cơ chế đảo effect tương ứng và test reorg, không coi E22 deposit là bằng chứng cho toàn bộ lifecycle.

## P1-1 và local deploy

- P1-1 `8a3c28d`: scanner sắp thứ tự log, decode, fold lịch sử canonical và cập nhật event, effect, projection, checkpoint, pg_notify trong transaction. Kiểm tra hash block và từ chối contract/chain sai. Test `scanner-projection.test.ts` kiểm deposit + delivery đảo thứ tự, rescan và rollback khi log sai.
- Deposit thật: khởi động Hardhat, `bun run --cwd apps/contracts deploy:local`, `NODE_ENV=test bun run tests/e2e/scanner-deposit.ts` trên bloody_codex_test pass: projection FUNDED, reservation FUNDED và issue IN_PROGRESS. PID của Hardhat được ghi vào .run và dừng. Gate `bun run typecheck && bun run lint && bun run --cwd apps/web test && bun run --cwd apps/worker test && bun run --cwd packages/database test && bun run contracts:test` pass; web 435/435, contracts 35/35.
- Local deploy `9f85dfc`: owner #0, arbiter #5, fee recipient #6 theo D-ACC-1; đã kiểm manifest bằng eth_accounts. ESCROW_ADDRESS và ESCROW_DEPLOY_BLOCK trong .env worktree lấy từ manifest; Hardhat hiện đã dừng, cần deploy lại khi khởi động node mới.
- `bun run --cwd apps/contracts typecheck` phát hiện lỗi CommonJS có sẵn trong export-abi; `7670048` sửa và lệnh đã pass. `bun run apps/contracts/scripts/export-abi.ts` xuất 114 mục và không thay đổi ABI được track.
- Các effect cho WORK_SUBMITTED, dispute, settlement và claim vẫn thuộc các mục P1 khác; test P1-1 chỉ chứng minh projection và effect FUNDED.

## Phase B: finality, logger, RPC

- N-4 `42f4335`: FINALITY mặc định safe, latest cho local; 13 test scanner/config/RPC pass và kiểm tra không yêu cầu tag safe ở latest. Hardhat local tại block 0 trả kết quả cho cả safe và latest; eth_accounts #1 khớp ADMIN_WALLETS. Các PID đã ghi trong tests/e2e/.run và được dừng.
- P1-6 `f287f80`: thay logger tự viết bằng pino 9.14.0, cùng bản web; worker 48/48, typecheck/lint pass. Pino 9.14.0 phát hành 18/10/2025 theo [pino release](https://github.com/pinojs/pino/releases/tag/v9.14.0), hơn hai tuần.
- P1-7 `5468126`: client RPC dùng viem createPublicClient từ shared; wrapper giữ phân loại lỗi range và số liệu; worker 48/48, typecheck/lint pass. Thử `getSafeBlock(..., "latest")` với Hardhat local: block 0; process đã dừng theo PID ghi lại. E22 chưa chạy.

## P0-4 / P1-17 — 2c0e108

- Đã xóa bốn mutation escrow xác nhận bằng txHash, ba mutation dispute cũ, các module xác nhận/projection cũ và các test chỉ kiểm code đó. Schema test xác nhận chúng không còn; analyzeDispute dùng aiStatus, không đổi status, chỉ lưu báo cáo có citation hợp lệ.
- `bun run typecheck && bun run lint && bun run --cwd apps/web test && bun run --cwd apps/worker test && bun run --cwd packages/database test && bun run contracts:test`: pass trên bloody_codex_test; web 435/435, contract 35/35, 4 cảnh báo lint any có sẵn. Các test mới `graphql-schema.test.ts` và `dispute-analysis.test.ts` pass.
- Tham chiếu cũ vẫn có trong `apps/web/src/components/admin/admin-view.tsx` và `apps/web/scripts/e2e-{escrow,workflow}.ts`; chúng gọi mutation đã xóa. Frontend ngoài phạm vi theo kế hoạch; các script phải được thay/cập nhật cùng harness và luồng dispute ở phase D/G. Vì vậy điều kiện grep toàn bộ `apps/web/src` chưa đạt, dù backend không còn mutation cũ. Chưa có mutation dispute mới cho đến P1-16.

## Tiến độ phase A

| ID | Trạng thái | Commit | Kiểm tra |
| --- | --- | --- | --- |
| N-2 | xong | `f9903af` | 39 test escrow web và 3 test config worker pass; typecheck/lint pass |
| N-3 | xong | `e19d656`, `a386eec` | 29 test token/issue pass; CHAIN_ID=31337 trên server pass |
| N-5 | xong | `c21c18d` | serve:local health trả 200 tại 4012; PID trong tests/e2e/.run đã dừng |
| N-7 | xong | `3858428` | AI mock 127.0.0.1:4019, 2 test pass; model router gọi mock |
| P0-3 | xong | d39cc3b, d8fc33e |
| P0-5 | xong | deb01d4 |
| P0-6 | xong | fb0a25f |
| P0-7 | xong | c9eb936 |
| P0-8 | xong | 8301319 |
| Gate typecheck | xong | `a386eec` | bun run typecheck kiểm web, worker, database và shared |

Gate sau P0-5 và `60ca0cc`: `bun run typecheck && bun run lint && bun run --cwd apps/web test && bun run --cwd apps/worker test && bun run --cwd packages/database test && bun run contracts:test` pass trên bloody_codex_test; contracts 35/35; lint 4 cảnh báo any cũ. `test:e2e:local` chưa có harness; gate cuối chưa hoàn tất.

## Cập nhật sau review phase A

- Kế hoạch đã commit `0644ecc` theo quyết định bổ sung.
- N-1/P0-9 và review: `6080c61` kiểm host localhost/127.0.0.1, gán URL không thể truy cập khi thiếu TEST_DATABASE_URL, preload database, guard test DB, bảo vệ reset tích hợp và ignore tests/e2e/.run/. `bun test tests/e2e/check-env.test.ts packages/database/test/test-guard.test.ts` pass 12/12; `git check-ignore tests/e2e/.run/example.pid` pass.
- `bun run --cwd apps/web test` không có TEST_DATABASE_URL: 480 pass, 1 test DB bỏ qua; với TEST_DATABASE_URL, `bun run --cwd apps/web test -- src/test/escrow-reservation.db.test.ts` pass 1/1. `bun run --cwd packages/database test` pass 2/2 trên bloody_codex_test.
- Mục 2.2: tạo bloody_codex_local sau khi xác minh host và tên; `bun run --cwd packages/database db:migrate:prod` pass. Địa chỉ admin đã được review xác nhận; còn chờ manifest escrow.
- P0-1: `3118318` xóa template và test không dùng theo D-NOTI-1; kiểm tra từng NotificationType có nơi tạo và E2E vẫn phải hoàn tất ở phase E/G.
- P0-2: `fe78f0e` thêm dependency workspace shared. Test worker hiện pass 45/45 trên bloody_codex_test.
- P0-3: `d39cc3b` thêm schema/migration; db:generate và migrate deploy trên bloody_codex_test lẫn bloody_codex_local pass. Worker typecheck vẫn fail do hai trường arbiter và feeRecipient không có trong effect FUNDED (src/effects/escrow.ts:138–139); cần sửa trước khi coi nghiệm thu P0-3 hoàn tất.
- `bun run typecheck && bun run lint` pass sau thay đổi, lint 4 cảnh báo any có sẵn. Lưu ý typecheck gốc hiện chỉ chạy web. Gate phase A, contracts test và E2E chưa chạy.

## Cập nhật phiên local

- Mục 2.2: đã sửa .env của worktree và packages/database/.env trỏ bloody_codex_local, xóa tên biến cũ, để trống dịch vụ thật, dùng cổng 4010/4011; ESCROW_ADDRESS và ESCROW_DEPLOY_BLOCK để trống đến khi có manifest sau deploy. ADMIN_WALLETS dùng địa chỉ chuẩn hardhat #1; cần xác nhận từ eth_accounts. Không commit .env.
- N-14: commit `79c14b4`; `bun test tests/e2e/check-env.test.ts` pass 10/10. Chặn hostname giả localhost.example.com; AI_BASE_URL rỗng được phép.
- N-1: commit `43f034a`; guard và preload đã thêm; `bun test tests/e2e/check-env.test.ts packages/database/test/test-guard.test.ts` pass 11/11; database test pass 2/2. Chưa chạy toàn bộ test web/worker.
- PostgreSQL báo bloody_codex_test không tồn tại dù đặc tả nói đã có; đã tạo mới bằng Bun SQL sau khi kiểm tên, rồi chạy `bun run --cwd packages/database db:migrate:prod` với DATABASE_URL và DIRECT_URL trỏ bloody_codex_test: 7 migration pass.
- `bun run typecheck && bun run lint`: pass, lint có 4 cảnh báo any có sẵn. Gate phase A và gate cuối chưa chạy.
- Tài liệu DECISIONS.md, FIX_LIST.md và LOCAL_FULL_FLOW_SPEC.md đã có thay đổi chưa commit từ trước; giữ nguyên.


## File theo nhóm

- P0-1: apps/web/src/lib/notifications/templates.ts. Test enum đã có trong apps/web/src/test/notification-templates.test.ts.
- Báo cáo và quyết định: docs/plan/parallel/reports/CODEX.md, docs/plan/parallel/DECISIONS.md.

## Gate

Chạy với DATABASE_URL và DIRECT_URL trỏ bloody_codex, sau khi tạo database và áp migration hiện có.

| Lệnh | Kết quả |
| --- | --- |
| bun run typecheck | Pass |
| bun run lint | Pass, 4 cảnh báo any có sẵn |
| bun run --cwd apps/web test | Pass, 481 test; template 21/21 |
| bun run --cwd apps/worker test | Fail: 40 pass, 1 fail, 1 error; thiếu dependency shared theo bàn giao/P0-2 |
| bun run --cwd packages/database test | Chưa chạy vì gate dừng tại worker |
| bun run contracts:test | Chưa chạy vì gate dừng tại worker |

Lần gate đầu web test fail vì bloody_codex chưa tồn tại; đã tạo bằng pg và chạy bun run --cwd packages/database db:migrate thành công.

## Quyết định và việc còn lại

Xem DECISIONS.md. BE-88 và GitGuardian bị chặn như FIX_LIST mục 4. Các mục chưa làm do phiên dừng sớm; tiếp tục P0-2, P0-3 rồi hoàn tất P0-1, sau đó theo FIX_LIST. Quy tắc chỉ dùng bloody_codex mâu thuẫn với yêu cầu tên DB test chứa test; cần xử lý theo quyết định ghi trong DECISIONS.md trước P0-9. Không push hoặc tạo PR.

## Danh sách BỔ SUNG đã thêm vào DECISIONS (C7 mục 5)

- BỔ SUNG P1-18 — audit tải evidence
- BỔ SUNG AI-11 — mốc bắt đầu phân tích
- BỔ SUNG N-14 — chặn mọi provider thật trong E2E
- BỔ SUNG N-8 — lưu báo cáo sau teardown
- BỔ SUNG E2 — ghi lượt xem theo tài khoản
- BỔ SUNG G1-DELTA — so hiệu số claimable thay vì số tuyệt đối
- BỔ SUNG E14 — tách thành hai test và thông báo thu hồi
- BỔ SUNG E15 — so calldata bằng encodeEscrowCall
- BỔ SUNG E16 — kháng cáo thứ hai trả INVALID_PHASE
- BỔ SUNG E23 — chờ indexer đuổi kịp trước khi đo
- BỔ SUNG E24 — đợi worker hoàn tất replay
- BỔ SUNG E31 — xóa số dư còn lại trước khi đo
- BỔ SUNG P1-19 — lỗi socket dạng chuỗi
- BỔ SUNG P1-19 — mock dispute trong socket-session
- BỔ SUNG P1-20 — trạng thái phát hiện mặc định OPEN
- BỔ SUNG P1-21 — lọc ẩn cho cả thống kê marketplace
- BỔ SUNG P1-22 — mã lỗi và phạm vi điểm uy tín
- BỔ SUNG P1-23 — hash audit dùng HMAC và giữ nguyên hash nội dung
- BỔ SUNG P1-24 — phạm vi test của guard
- BỔ SUNG P1-25 — vị trí gọi rate limit AI
- BỔ SUNG E18 — kiểm cờ afterDispute theo quy tắc lưu trữ
- BỔ SUNG E19 — tài khoản #10 và ban qua HTTP
- BỔ SUNG E30 — deadline đã qua
- BỔ SUNG E-harness — socket và thư viện
- BỔ SUNG P1-30 — file chat đi theo DELIVERY của issue
- BỔ SUNG P1-30 — nhật ký xem bằng chứng
- BỔ SUNG P1-30 — ảnh issue đã ẩn
- BỔ SUNG P1-30 — gitignore
- BỔ SUNG P1-31 — không kiểm lệch thời gian webhook
- BỔ SUNG P1-32 — guard nằm ở subpath export
- BỔ SUNG P1-35 — không xoay refresh token
- BỔ SUNG C3 — kịch bản E25–E29 và runner
