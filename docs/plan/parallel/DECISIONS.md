# Quyết định (bản cuối cho giai đoạn chạy local, 29/10/2026)

Các quyết định dưới đây đã chốt. Codex không hỏi lại người dùng. Nếu thấy mâu thuẫn, làm theo file này và ghi lý do vào `reports/CODEX.md`. Nếu cần đổi một quyết định, thêm mục "ĐỔI QUYẾT ĐỊNH" ở cuối file, không sửa lặng lẽ.

Đọc cùng: `LOCAL_FULL_FLOW_SPEC.md` (việc phải làm và kịch bản test), `FIX_LIST.md` (chi tiết từng mục).

---

## Q1. Database

- **Test:** dùng `TEST_DATABASE_URL`, bắt buộc có. Tên database phải kết thúc bằng `_test`. Mặc định: `bloody_codex_test`.
- **Chạy local** (server, worker, E2E thủ công): `DATABASE_URL` và `DIRECT_URL` trỏ tới `bloody_codex_local`.
- **Cấm:** `bloody_roar_local`, `bloody_roar_dev`, `bloody_integration`, và mọi database không kết thúc bằng `_test` khi chạy test, reset hay truncate.
- Chỉ được `migrate reset --force` và truncate khi tên database kết thúc bằng `_test`.
- Code test gán `process.env.DATABASE_URL = TEST_DATABASE_URL` trước mọi import Prisma. Hàm `assertTestDatabase(url)` kiểm tra tên và chặn ngay nếu sai.

Lý do: thỏa cả yêu cầu "tên có test" lẫn yêu cầu không chạm DB dev. Người dùng đã cho phép dùng DB nào cũng được.

## Q2. Template thông báo

- **Xóa** `apps/web/src/lib/notifications/templates.ts` và `apps/web/src/test/notification-templates.test.ts`.
- Nội dung thông báo viết trực tiếp tại nơi tạo. Mỗi `NotificationType` phải có ít nhất một nơi tạo thật, và có test E2E chứng minh nó được tạo.
- Không tạo lại bản đồ template chung.

Lý do: không có luồng production nào dùng bản đồ này. Hai bản nội dung đã lệch nhau, ví dụ `DEPOSIT_CONFIRMED` ở worker ghi "Đã nạp ký quỹ", còn template ghi "Đã xác nhận tiền nạp".

## Q3. GitGuardian (PR #16, #17)

- Giai đoạn local: không làm gì. Không viết lại lịch sử. Không tạo PR mới.
- Khi deploy: người dùng tự đánh dấu false positive trên dashboard GitGuardian. Hai chuỗi bị bắt là mật khẩu Postgres của CI chỉ dùng trên localhost, và fixture test giả.

## Q4. Phạm vi

- **Làm đủ:** toàn bộ P0, P1, P2 trong `FIX_LIST.md`, cộng các mục N trong `LOCAL_FULL_FLOW_SPEC.md`.
- **Không làm:**
  - AI-17 (multi-agent debate) và AI-18 (chấm mức hoàn thành submission). Proposal §5.2 đã cắt khỏi MVP.
  - BE-88 (build Docker), BE-89 (cấu hình Railway), BE-94 (Sentry). Để giai đoạn deploy.
  - Kích hoạt GitHub Actions. Giữ các file workflow hợp lệ, không cần chạy trên GitHub.
- Không push, không tạo PR, không đóng PR trong giai đoạn này.

## Q5. RPC của worker

- Dùng viem (`createPublicClient`), import từ `@bloody-roar/shared`. Xóa `apps/worker/src/chain/rpc.ts`.
- Không viết JSON-RPC bằng `fetch` nữa.

## Q6. Các mặc định D2 đến D5

- **D2, coverage:** giữ mock ngoài phép đo (đã làm trên `be/a1-platform`). Ngưỡng 95/90 giữ nguyên. Nhánh đang đo 90,00% ở branches, sát ngưỡng. Khi thêm code escrow, phải kiểm lại.
- **D3, e2e-workflow:** không chạy trong CI, vì CI chạy production mode và không có S3. Chạy ở local bằng dev mode, xem N-E.
- **D4, BE-10:** kiểm base xem `updateProfile` đã validate email chưa. Nếu thiếu thì thêm validate định dạng và unique. Ghi kết quả vào báo cáo.
- **D5, BE-18:** bỏ `isDraft` khỏi API.

## Q7. PR

- Không mở PR, không push trong giai đoạn local.
- Khi toàn bộ `bun run test:e2e:local` xanh và người dùng nói "mở PR", mở đúng một PR từ `be/integration` vào `feat/claude-ui-redesign`.
- Không đóng PR #14 đến #18 nếu chưa có xác nhận.

## Q8. Server và port

- **Không đụng port 4000.** Đó là server của người dùng, chạy từ repo chính và dùng `bloody_roar_local`.
- Codex dùng port **4010 đến 4019** cho server của mình. Port 4001 không dùng.
- Chỉ dừng process do chính Codex khởi động, dựa trên PID đã ghi trong `tests/e2e/.run/`. Không dùng `pkill` theo tên.

## Q9. Deploy

- Giai đoạn này chỉ local. Việc deploy làm sau, người dùng chọn nơi.
- Mọi cấu hình phải đổi được qua biến môi trường, không hardcode địa chỉ, chain hay domain.

---

## Quyết định mới (từ câu hỏi của Codex và kiểm tra code)

**D-ENV-1. Tên biến môi trường thống nhất**
- Web và worker cùng dùng: `RPC_URL`, `CHAIN_ID`, `ESCROW_ADDRESS`, `ESCROW_DEPLOY_BLOCK`, `DATABASE_URL`, `DIRECT_URL`.
- Xóa: `ESCROW_RPC_URL`, `ESCROW_CONTRACT_ADDRESS`, `ESCROW_CONTRACT_ADDRESS_BASE_SEPOLIA`, `ESCROW_CHAIN_ID`, `BASE_SEPOLIA_RPC_URL`, `ALCHEMY_RPC_URL_TESTNET` (nếu không còn dùng).
- Cập nhật `.env.example` và `docs/DEPLOY.md`.

**D-ENV-2. Chain ID**
- `ACTIVE_CHAIN_ID` trên server đọc từ `CHAIN_ID`, mặc định `84532`.
- Local dùng `31337`. Token trong DB phải có `chainId` khớp với `CHAIN_ID` đang chạy.
- Phía client (FE) vẫn giữ `84532` vì FE làm sau. Ghi chú trong code.

**D-ENV-3. Không gọi dịch vụ thật khi chạy local**
- Trong `.env` của worktree phải để trống: `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AI_BASE_URL`, `AI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`.
- Lý do: `.env` hiện có khóa thật. Nếu để S3 bật thì upload đi ra S3 thật. Nếu để AI thì tốn tiền.
- Storage local dùng `apps/web/.uploads`, chỉ bật khi `NODE_ENV` không phải `production`. Thư mục này phải nằm trong `.gitignore`.
- Không sửa `.env` của repo chính.

**D-AI-1. AI provider giả khi test**
- Một HTTP server giả tại `127.0.0.1:4019` trả JSON đúng schema cố định. Test đặt `AI_BASE_URL` trỏ tới đó.
- `AI_EXTERNAL_GUARD=false` mặc định. Pass LLM của guard không chạy trừ khi bật rõ ràng.

**D-FIN-1. Finality của worker**
- Thêm biến `FINALITY`: `safe` hoặc `latest`. Mặc định `safe`.
- Local đặt `FINALITY=latest`, vì hardhat không đảm bảo tag `safe`. Codex kiểm tra hardhat trước, ghi kết quả vào báo cáo.

**D-ACC-1. Tài khoản local**
- Lấy địa chỉ từ `eth_accounts` của hardhat. Không ghi private key vào repo.
- Vai trò theo chỉ số: 0 owner và deployer, 1 admin (đặt trong `ADMIN_WALLETS`), 2 client, 3 developer 1, 4 developer 2, 5 arbiter (đọc từ manifest), 6 fee recipient (đọc từ manifest), 7 người ngoài, 8 user sẽ bị ban trong test.

**D-SIG-1. Ký**
- Dùng `personal_sign` và `eth_signTypedData_v4` trên tài khoản hardhat (đã unlock). Không cần khóa riêng.
- Thông điệp SIWE và EIP-712 ký trên tài khoản hardhat, server verify bằng viem như bình thường.

**D-TIME-1. Thời gian**
- Mốc thời gian trên chain: dùng `evm_increaseTime` và `evm_mine`.
- Mốc trong DB (reservation 24 giờ, deadline thông báo): test sửa trực tiếp cột thời gian về quá khứ rồi gọi job. Không chờ thật.

**D-DEP-1. Thư viện mới được phép**
- `socket.io-client` (devDependency, dùng cho test realtime).
- `pino` cho worker, cùng phiên bản với web.
- Ngoài danh sách đã chốt (`viem`, `canonicalize`, `pg`, `@scure/bip39`), không thêm gì khác.

**D-TEST-1. Cách chạy E2E**
- Phần lớn kịch bản gọi GraphQL bằng `yoga.fetch` trong process test. Nhanh, không cần Next compile.
- Một bộ smoke test qua server HTTP thật ở port 4010–4019 kiểm tra `/api/health`, GraphQL `hello`, và socket.

**D-MANIFEST-1. Manifest local**
- `apps/contracts/deployments/localhost.json` (đã gitignore) là nguồn sự thật cho `token`, `escrow`, `arbiter`, `feeRecipient`, `deployBlock`. Harness đọc từ đây, không hardcode.

**D-DEV-1. Script dev**
- Script `dev` ở root và `apps/web` đang hardcode `PORT=4000`. Đổi thành `PORT=${PORT:-4000}`, để local chạy được trên port khác.

---

## Bổ sung sau review phase A (29/10, Claude)

Các mục này sửa hoặc làm rõ D-N1 (guard) và mục 2.1 của `LOCAL_FULL_FLOW_SPEC.md`. Làm theo mục này khi có mâu thuẫn.

- **Guard có kiểm host.** `assertTestDatabase` phải thấy host là `localhost` hoặc `127.0.0.1`. Tên `_test` không đủ, vì `migrate reset` xóa dữ liệu và URL có thể trỏ đến server khác.
- **Unit test không cần DB.** `apps/web/src/test/setup.ts` và `apps/worker/test/preload.ts` không được ném lỗi khi thiếu `TEST_DATABASE_URL`. Khi thiếu, gán `DATABASE_URL` và `DIRECT_URL` về `postgresql://unit-tests.invalid:5432/no_database_unit_tests`, để mọi truy cập DB vô tình đều lỗi và không chạm DB nào. Khi có `TEST_DATABASE_URL` thì mới gọi `assertTestDatabase` rồi gán. Test cần DB tự gọi `assertTestDatabase(process.env.TEST_DATABASE_URL)` trong `beforeAll`.
- **packages/database dùng preload.** Thêm `packages/database/bunfig.toml` với `[test] preload = ["./test/preload.ts"]`, cùng kiểu với worker. Bỏ lệnh guard đặt sau `import` trong `funding-reservation.test.ts`. Lý do: import được hoisted lên trước, nên guard đặt sau import chạy muộn hơn code đã import.
- **Không import tương đối qua package khác.** Thêm export `"./test-guard": "./src/test-guard.ts"` vào `packages/database/package.json`, rồi import bằng `@bloody-roar/database/test-guard`. Áp dụng cho `apps/web/src/test/setup.ts`, `apps/worker/test/preload.ts`, `tests/e2e/check-env.ts`.
- **Database local phải tồn tại.** `.env` trỏ `bloody_codex_local`, nhưng DB này chưa được tạo. Tạo, rồi chạy `prisma migrate deploy` trên đó. Không dùng `migrate dev`.
- **Ignore thư mục chạy harness.** Thêm `tests/e2e/.run/` vào `.gitignore`.
- **Commit tài liệu kế hoạch.** `DECISIONS.md`, `FIX_LIST.md`, `LOCAL_FULL_FLOW_SPEC.md` commit một lần, message `docs(plan): local plan`.
- **Đính chính.** Đặc tả trước ghi `bloody_codex_test` và `bloody_codex_local` "đã có". Điều này sai. `bloody_codex_test` và `bloody_codex` (scratch) đã được Codex tạo. `bloody_codex_local` chưa có. Đọc mục này thay cho mục 2.1 của đặc tả.
- **Địa chỉ admin.** `ADMIN_WALLETS` đã khớp địa chỉ hardhat #1 chuẩn. Codex xác nhận lại bằng `eth_accounts` khi chạy node ở phase B.

---

## Việc người dùng cần làm

Không có việc nào chặn Codex. Khi deploy, người dùng cần:
1. Đánh dấu false positive GitGuardian (Q3).
2. Chọn nơi deploy và cấp biến môi trường thật (Q9).
3. Build Docker trên nơi có đủ RAM, hoặc để Railway build (BE-88).
4. Ra lệnh mở PR (Q7).

## ĐỔI QUYẾT ĐỊNH — khóa chống trùng thông báo deadline

`DEADLINE_APPROACHING` dùng `deadline:{escrowId}:{kind}:{userId}` thay cho `deadline:{escrowId}:{kind}` trong FIX_LIST. Cột `Notification.dedupeKey` là duy nhất toàn bảng; thêm userId để cả client và developer liên quan đều nhận đúng một thông báo cho cùng mốc, kể cả khi job chạy lại.

## ĐỔI QUYẾT ĐỊNH — reputation sau escrow resolution

P1-10 tạm để TODO(P1-22) gọi `recalcReputation` trong transaction của effect. Hàm chưa tồn tại; P1-22 sẽ triển khai và nối lại trước gate cuối.

## BỔ SUNG P1-18 — audit tải evidence

Dùng action `download_evidence` cho lượt admin tải file, phân biệt với `view_evidence` khi xem danh sách.

## BỔ SUNG AI-11 — mốc bắt đầu phân tích

Thêm `Dispute.aiStartedAt` để timeout và chống lượt AI cũ ghi đè vẫn chính xác khi worker cập nhật dispute.

## BỔ SUNG N-14 — chặn mọi provider thật trong E2E

`check-env` chặn cả khóa GROQ/OPENAI, credential S3 và webhook; AI mock chỉ dùng loopback port 4019 để không fallback sang dịch vụ thật.

## BỔ SUNG N-8 — lưu báo cáo sau teardown

Giữ `tests/e2e/.run/last-run.txt` và log đã ignore sau khi dừng PID để có thể chẩn đoán, vì yêu cầu xóa cả thư mục mâu thuẫn với việc ghi báo cáo trong đó.

## BỔ SUNG E2 — ghi lượt xem theo tài khoản

`recordIssueView` yêu cầu đăng nhập và tăng tối đa một lần mỗi giờ cho mỗi user; query chi tiết không tự tăng vì bảng IssueView gắn với user.

## BỔ SUNG G1-DELTA — so hiệu số claimable thay vì số tuyệt đối

`ClaimableBalance` cộng dồn giữa các file (ví phí còn số dư từ E10, E13), nên các test đo chênh lệch trước và sau bước của mình. Giá trị trong đặc tả (97.5, 2.5, 100 USDC) vẫn là hiệu số đúng.

## BỔ SUNG E14 — tách thành hai test và thông báo thu hồi

Nhánh bên kia chấp nhận và nhánh đề xuất rồi thu hồi chạy trên hai fixture riêng. `SETTLEMENT_REVOKED` gửi cho bên còn lại, không gửi cho người thu hồi, đúng với scanner cũ.

## BỔ SUNG E15 — so calldata bằng encodeEscrowCall

`encodeEscrowCall("postInitialRuling", ...)` đóng gói cùng hàm và tham số với `encodeFunctionData(ESCROW_ABI)`, dùng `escrowKey` như scanner cũ. Không thêm đường mã hóa thứ hai.

## BỔ SUNG E16 — kháng cáo thứ hai trả INVALID_PHASE

Sau khi client kháng cáo, phase là CHALLENGED. `prepareChallengeRuling` của developer bị chặn ở bước kiểm phase trước khi kiểm quyền kháng cáo, nên mã lỗi là `INVALID_PHASE`.

## BỔ SUNG E23 — chờ indexer đuổi kịp trước khi đo

`reconcileProjections` trả `null` khi chưa đến chain head. Test gọi lại cho tới khi có kết quả, nên không đo khi chưa có block để so.

## BỔ SUNG E24 — đợi worker hoàn tất replay

`worker:replay` chỉ ghi `REPLAY_REQUESTED`; worker thực hiện replay và đưa checkpoint về `IDLE`. Test đợi `IDLE` rồi mới so projection.

## BỔ SUNG E31 — xóa số dư còn lại trước khi đo

Trước khi fund, test claim số dư còn lại của developer và ví phí. Nhờ vậy chênh lệch số dư escrow đúng 100 USDC của issue này.

## BỔ SUNG P1-19 — lỗi socket dạng chuỗi

`message:send` trả lỗi bằng chuỗi như mọi nhánh khác trong file, nên giới hạn tốc độ trả `"Too many messages, slow down"` thay vì object `{ok, error: {code}}`. Mutation `editMessage` dùng `RATE_LIMITED` qua `gqlError`, vì resolver GraphQL trả mã lỗi có cấu trúc.

## BỔ SUNG P1-19 — mock dispute trong socket-session

`socket-session.test.ts` thêm `dispute.findUnique` vào mock transaction, vì handler giờ tra `Dispute.raisedAt` khi tạo tin.

## BỔ SUNG P1-20 — trạng thái phát hiện mặc định OPEN

`reconciliationFindings` nhận `status` là `OPEN` (mặc định), `RESOLVED`; giá trị khác trả `BAD_USER_INPUT`. Resolver cũng tự mặc định `OPEN` vì khi gọi trực tiếp (test) mặc định của schema không được áp dụng.

## BỔ SUNG P1-21 — lọc ẩn cho cả thống kê marketplace

`marketplaceStats` lọc `hiddenAt: null` ở cả số bounty mở và số developer đã ứng tuyển, để thống kê khớp danh sách. `adminUnhideIssue` ghi `AdminLog` với `details: {}` vì không có lý do.

## BỔ SUNG P1-22 — mã lỗi và phạm vi điểm uy tín

Đánh giá trước khi hoàn thành trả `INVALID_STATE` (mã mới, không có trong danh sách cũ); trùng đánh giá trả `CONFLICT` qua mã Prisma `P2002`. Điểm uy tín tính trên mọi đánh giá, kể cả issue hoàn tiền, còn số bài hoàn thành loại trừ `MISSED_DELIVERY_REFUND`. `reviews` là query công khai.

## BỔ SUNG P1-23 — hash audit dùng HMAC và giữ nguyên hash nội dung

`auditHash` dùng HMAC-SHA256 với `AI_HASH_KEY`. Hash `originalHash` của tin nhắn trong `socket/handlers.ts` và `chat.module.ts` cũng đổi sang `auditHash` theo đặc tả, còn hash token/nội dung ở `app/api/auth/*`, `lib/auth.ts`, `submission/draft.module.ts` giữ nguyên.

## BỔ SUNG P1-24 — phạm vi test của guard

`content-guard.test.ts` kiểm bốn chỗ bằng fake DB: `createIssue` (không kèm `issueId`), `createIssueComment`, `applyToIssue`, và hàm guard mà mọi chỗ dùng. `createSubmissionDraft` và `updateIssue` cũng đã gọi `guardMessage`, nhưng chưa có case tự động vì cần projection escrow và thời gian chain; sẽ kiểm bằng tay trong G1/E2E ở phase sau.

## BỔ SUNG P1-25 — vị trí gọi rate limit AI

`generateTestCases` nằm ở `graphql/modules/ai/ai.module.ts` (đặc tả ghi `ai/ai.module.ts`); giới hạn gọi sau kiểm tra vai trò CLIENT để không tính lượt của người không được phép. Hai mutation duy nhất gọi `completeAI` từ GraphQL là `generateTestCases` và `analyzeDispute`.

## BỔ SUNG E18 — kiểm cờ afterDispute theo quy tắc lưu trữ

`afterDispute` so `Dispute.raisedAt` (thời gian block) với đồng hồ máy chủ. Đồng hồ Hardhat có thể chạy nhanh hơn đồng hồ thật sau các kịch bản đổi thời gian, nên E18 kiểm đúng quy tắc `raisedAt <= createdAt` thay vì giả định luôn là `true`. Admin chỉ được join phòng khi issue ở `DISPUTED`.

## BỔ SUNG E19 — tài khoản #10 và ban qua HTTP

`accounts[8]` bị e01 khóa có chủ đích để kiểm 403, nên E19/E21 dùng `accounts[10]`. Ban chạy qua HTTP trên máy chủ web vì chỉ tiến trình đó giữ Socket.IO server để ngắt phiên. Đăng xuất đã ngắt socket phía server, nên E19 kiểm `connected = false` thay vì nghe sự kiện.

## BỔ SUNG E30 — deadline đã qua

Job deadline chỉ thông báo khi mốc đã qua (`at <= now`), nên E30 đưa `deliveryDeadline` về quá khứ thay vì gần tương lai.

## BỔ SUNG E-harness — socket và thư viện

`socket.io-client` chưa được hoist ở root; harness import bản trong `apps/web/node_modules` để không thêm dependency. `ack` có timeout 10 giây vì máy chủ không gọi callback khi đã ngắt socket. Eval `dispute-eval` đọc fixture theo `process.cwd()` vì `import.meta.glob` không có kiểu trong tsconfig của web.

## BỔ SUNG P1-30 — file chat đi theo DELIVERY của issue

Đặc tả từ chối `CHAT` ở `POST /api/uploads`, nhưng composer chat vẫn cần tải file. Composer nay gửi `purpose: "DELIVERY"` kèm `issueId`, nên file chat chỉ người trong task đọc được. Hệ quả: admin không còn đọc được file chat trong lúc tranh chấp qua đường này; nếu cần lại, phải thêm quyền riêng.

## BỔ SUNG P1-30 — nhật ký xem bằng chứng

Tải bằng chứng của admin ghi `view_evidence` (theo đặc tả và P1-18), thay cho `download_evidence`. Test `evidence-download.test.ts` được cập nhật theo.

## BỔ SUNG P1-30 — ảnh issue đã ẩn

Ảnh của issue đã ẩn vẫn hiện với client, developer và admin; người ngoài nhận 401/403. Lý do: P1-21 chỉ ẩn khỏi người ngoài, không xóa quyền của người đang làm việc.

## BỔ SUNG P1-30 — gitignore

Thêm `apps/web/.gitignore` với `.uploads/`. Thư mục gốc đã có `apps/web/.uploads/` nên đây là bản lặp có chủ đích, theo đặc tả.

## BỔ SUNG P1-31 — không kiểm lệch thời gian webhook

GitHub không gửi header thời gian, nên webhook không kiểm lệch đồng hồ; chống lặp chỉ dựa vào `x-github-delivery`. Migration `20261031090000_pr_merged_notification` thêm `PR_MERGED` và đã được áp dụng trên `bloody_codex_test` và `bloody_codex_local`.
