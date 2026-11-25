# Codex one-shot · EP-7 AI sinh test Đợt 1, code từ A tới Z rồi tự review

Ngày 25/11/2026. Dán **nguyên khối bên dưới** vào một phiên Codex. Codex làm lần lượt 6 phần trong `CODEX_PROMPT_AI_TESTGEN_2026-11-25.md`, tự review bằng skill, sửa lỗi, rồi viết báo cáo bàn giao.

Trước khi dán, bạn cần làm 3 việc:
1. Thêm `DEEPSEEK_API_KEY=...` vào `/Users/admin/repos/capstone1/.env`.
2. Bật Docker Desktop và container `bloody_roar_postgres` (cổng 5433).
3. (Nên làm) Merge #29 → #30 → #31 vào `main`. Chưa merge thì Codex dựng nhánh trên `feat/US-48-testgen-injection-guard`, nhánh này đã chứa cả ba PR.

Thay `US-A`, `US-B`, `US-C` trong file prompt chi tiết bằng key Jira thật nếu đã tạo. Chưa tạo thì Codex dùng `US-46` cho các commit đó.

---

```
Bạn là kỹ sư chính cho EP-7 "AI sinh test" của repo Bun monorepo /Users/admin/repos/capstone1. Làm trọn Đợt 1 trong một mạch: code đủ 6 phần, tự review bằng skill, sửa lỗi, rồi bàn giao. Không dừng giữa chừng để hỏi, trừ khi gặp điều kiện DỪNG ở mục 0 hoặc mục 4.

Dùng skill ponytail (mức full) suốt phiên: diff nhỏ nhất mà vẫn đủ. Riêng quy tắc "không viết comment" của AGENTS.md được ưu tiên hơn ponytail.

## Tài liệu (đọc hết trước khi code)
1. /Users/admin/repos/capstone1/AGENTS.md: quy tắc bắt buộc.
2. /Users/admin/repos/capstone1/docs/plan/CODEX_PROMPT_AI_TESTGEN_2026-11-25.md: SPEC CHÍNH. Gồm "Quy tắc chung" và Prompt 1 đến Prompt 6. Làm đúng theo đó, kể cả nguyên văn SYSTEM_TESTGEN_V1, GENERATE_MESSAGE, REPAIR_MESSAGE và zod schema ở cuối Prompt 5.
3. /Users/admin/repos/capstone1/docs/plan/AI_TESTGEN_TOKEN_UX_2026-11-23.md, mục 3 và mục 9: lý do của bố cục prompt và các quyết định đã chốt.
4. /Users/admin/repos/capstone1/docs/plan/AI_TESTGEN_READINESS_2026-11-23.md: bối cảnh.
Spec và code thật khác nhau thì code thật đúng. Làm theo code, và ghi chỗ khác vào báo cáo bàn giao.

## 0. Kiểm điều kiện đầu vào (DỪNG nếu sai)
Chạy và kiểm từng mục. Không in giá trị bí mật nào.
- docker info chạy được, và container bloody_roar_postgres đang chạy.
- grep -q '^DEEPSEEK_API_KEY=..' /Users/admin/repos/capstone1/.env (chỉ kiểm có hay không, không in).
- git -C /Users/admin/repos/capstone1 fetch origin. Chọn BASE:
  • origin/main có focusedSourceContext (git grep -q focusedSourceContext origin/main -- apps/web/src/lib/source-archive.ts) → BASE=origin/main.
  • Không có → BASE=origin/feat/US-48-testgen-injection-guard, và ghi vào báo cáo rằng PR này chứa luôn #29, #30, #31.
- Tạo worktree theo "Quy tắc chung", nhưng thay origin/main bằng BASE. Nếu worktree hoặc nhánh đã có thì dùng tiếp, KHÔNG xóa.
- Tạo DB test bloody_testgen_test và export TEST_DATABASE_URL theo "Quy tắc chung".
- Ghi tiến độ vào /Users/admin/repos/capstone1-testgen-progress.md, file này nằm NGOÀI repo nên không bị commit. Nội dung: phần nào xong, commit nào, test nào xanh, quyết định nào đã lấy. Cập nhật sau mỗi phần. Nếu phiên bị nén context, đọc lại file này trước khi làm tiếp.

## 1. Code 6 phần theo đúng thứ tự
Phần 1 (Prompt 1) → Phần 2 (Prompt 2) → Phần 3 (Prompt 3) → Phần 4 (Prompt 4) → Phần 5 (Prompt 5) → Phần 6 (Prompt 6).

Mỗi phần làm theo vòng:
a) Đọc code thật liên quan trước (codegraph explore nếu có, sau đó mới grep).
b) Viết test đỏ trước, rồi code cho xanh.
c) Cổng của phần: bun run typecheck, bun run lint, test của vùng đã sửa (đã export TEST_DATABASE_URL). Phần có migration: áp vào DB test, rồi bun run db:generate.
d) Commit đúng message ghi ở cuối prompt của phần đó. Ticket còn là US-A/US-B/US-C thì dùng US-46. Không push.
e) Cập nhật file tiến độ.
Không sang phần sau khi cổng của phần trước còn đỏ. Một test đỏ vì môi trường (ví dụ không có Docker) thì được skipIf như các test đang có, và phải ghi lại.

Phần 2, bước 0: chạy probe DeepSeek đúng một lần, chép kết quả vào file tiến độ. Nếu lỗi 401/403 (key sai) → DỪNG, bàn giao phần 1 và báo lỗi key. Lỗi tên model hoặc tham số → sửa theo tài liệu DeepSeek như Prompt 2 đã dặn, rồi đi tiếp.

## 2. Kiểm cả nhánh trước khi review
Chạy toàn bộ trên nhánh, so với BASE:
- bun run typecheck; bun run lint
- bun run --cwd apps/web test; bun run --cwd apps/worker test; bun run --cwd packages/database test (nếu có script); test của packages/shared nếu có
- bun run test:e2e:backend với TEST_DATABASE_URL (chỉ DB _test)
- git diff BASE...HEAD --stat: chỉ có file thuộc EP-7. Không có .env, không có file lạ, không có dependency mới ngoài @scure/bip39 (và @bloody-roar/database) trong packages/shared.
- git diff BASE...HEAD | grep -E '^\+.*(//|/\*|#) ' | grep -v -E '^\+\+\+|https?://': không được có comment mới trong code TS/Python (AGENTS.md). Chuỗi trong prompt hoặc test fixture thì giữ.
- Chạy thật một lần với DeepSeek (Prompt 5, mục kiểm tay): worker local trỏ vào DB test, một issue BUG_FIX trên repo vitest mẫu. Ghi calls, promptTokens, cacheHitTokens, completionTokens và thời gian từng stage. Nếu cacheHitTokens = 0 ở các lời gọi sau lời gọi đầu, tìm nguyên nhân (tiền tố bị đổi?) và sửa.
- Phần 6, bước 8 (Playwright CLI end-to-end): làm nếu dựng được stack local. Không được thì ghi rõ lý do.

## 3. Tự review bằng skill, rồi sửa
Review trên toàn bộ diff BASE...HEAD, theo thứ tự:
1. Skill ponytail-review trên cả nhánh: đúng, an toàn, chịu tải, có test, nhanh, gọn.
2. Skill code-review với fixed point = BASE. Spec gồm: CODEX_PROMPT_AI_TESTGEN_2026-11-25.md, AI_TESTGEN_TOKEN_UX_2026-11-23.md mục 9, AGENTS.md.
3. Skill claude-design-system (hoặc đọc .agents/rules/claude-design-rules.md nếu không có skill) cho bug-brief-form.tsx và các phần mới trong test-case-panel.tsx.
4. Tự soát danh sách dưới. Mỗi mục phải chỉ ra được dòng code hoặc test chứng minh:
   □ Cache dependency chỉ được ghi ngay sau bước cài, trước khi ghi bất kỳ file test nào. Test luôn chạy trên bản chép. Run SUBMISSION (có patch) không dùng cache.
   □ Repomix chạy trong container: --network none, --read-only, có -c tới config của mình. Repomix lỗi thì snapshot vẫn READY.
   □ Mọi chuỗi gửi cho model đều qua scanAndMask. Khối <repository_content> và <brief> đã escape thẻ đóng.
   □ Ba message tiền tố được dựng một lần cho mỗi run và không đổi giữa các lời gọi (có test).
   □ Mọi mutation mới kiểm owner, issue OPEN, khóa issue khi ghi tiêu chí. Giới hạn 5 run mỗi issue mỗi 24 giờ đếm bằng DB.
   □ termsHash của issue không có brief giữ nguyên như trước (có test so với hash cố định).
   □ Approve chỉ mở khi baseVerified, ở cả server lẫn UI.
   □ Run tôn trọng trần: 4 lời gọi AI, 4 lần sandbox, trần token, 20 phút. Run treo bị dọn sau 25 phút. Đổi brief hoặc source giữa chừng → CANCELLED, không ghi TestCase.
   □ Không có import web ↔ worker. Client component không import module có node:*.
   □ DeepSeek: thinking "off" gửi {thinking:{type:"disabled"}}. Content rỗng được thử lại một lần. Groq và OpenAI không nhận field lạ.
Sửa mọi phát hiện về đúng, an toàn, thiếu test, sai spec. Phát hiện về độ gọn thì sửa nếu nhỏ. Không sửa thì ghi lý do. Mỗi đợt sửa là một commit fix(...) hoặc refactor(...) có key ticket. Sau khi sửa, chạy lại toàn bộ mục 2 (trừ bước chạy thật DeepSeek, nếu code liên quan không đổi). Lặp review và sửa tối đa 2 vòng.

## 4. DỪNG và bàn giao sớm khi
- Thiếu điều kiện ở mục 0, hoặc key DeepSeek sai.
- Một phần sửa 3 lần mà cổng vẫn đỏ. Khi đó commit phần đã xanh, KHÔNG commit code đỏ, rồi bàn giao kèm mô tả chỗ kẹt.
- Cần làm việc AGENTS.md bắt phải hỏi: thêm dependency ngoài danh sách đã cho phép, chạy migration vào DB không phải _test, deploy, push.

## 5. Bàn giao
Viết docs/plan/AI_TESTGEN_HANDOVER_<YYYY-MM-DD>.md trong worktree, commit với message docs: AI testgen phase 1 handover (US-46). Nội dung, viết tiếng Việt, ngắn, có bảng:
1. BASE đã dùng. Danh sách commit theo phần (hash, message).
2. Lệnh đã chạy và kết quả (số test xanh / bỏ qua / đỏ). Test nào bị skip và vì sao.
3. Kết quả probe DeepSeek và số đo run thật: calls, tỉ lệ cacheHit/prompt, token ra, thời gian từng stage, chi phí ước theo giá deepseek-flash (miss $0,30, hit $0,006, ra $1,20 mỗi 1M token, giờ cao điểm).
4. Thời gian base check lần đầu và lần hai (cache dependency).
5. Phát hiện của từng skill review: đã sửa gì, để lại gì và vì sao.
6. Chỗ làm khác spec và lý do.
7. Việc bạn phải làm tay: build image bloodyroar-test-runner:2 trên máy hoặc server chạy worker, đặt env DEEPSEEK_* cho worker và web, migration production (chưa chạy), các PR #29 đến #31 nếu chưa merge.
8. Rủi ro còn lại và đề xuất cho Đợt 2.
Cuối phiên, trả lời bằng tiếng Việt, ngắn: đường dẫn file bàn giao, số commit, trạng thái các cổng, và 3 điều quan trọng nhất cần biết. Không push, không mở PR.
```
