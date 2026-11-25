# EP-7 AI sinh test · tối ưu token (DeepSeek + repomix) và UX lúc chờ

Ngày 23/11/2026. Bổ sung cho `AI_TESTGEN_READINESS_2026-11-23.md` và artifact "BloodyRoar Testgen Pipeline". Mọi số token ở đây đo thật bằng repomix 1.18.1 trên bản clone `mangekyou-labs/oreka` (tokenizer `o200k_base`; tokenizer của DeepSeek khác, sai số khoảng ±20%).

---

## 0. Đính chính con số $0,5

Artifact không nói oreka tốn $0,5. Nó ghi:
- Một issue oreka, đủ Đợt 2, có một lần hỏi lại client: **≈ $0,07**. Trong đó AI $0,035, sandbox $0,039.
- $0,50 là **trần** một issue một ngày: 5 run × trần $0,10 mỗi run. Con số này chỉ xảy ra khi client bấm sinh lại 5 lần và lần nào cũng chạm trần.

Dù vậy hướng tối ưu vẫn đúng. Có ba khoản tiền thật: context gửi lặp lại, token suy luận, và thời gian cài dependency trong sandbox. Khoản thứ ba làm client phải chờ lâu nhất.

## 1. Đo thật: repo oreka gửi cho AI tốn bao nhiêu token

| Cách đóng gói | File | Token |
|---|---|---|
| Toàn repo, không lọc | 307 | **13.759.372** (repo commit cả `frontend/.next/` build, một file 4,4M token) |
| Chỉ mã nguồn (bỏ `.next`, lockfile, json, asset ICP, broadcast) | 156 | 159.965 |
| Như trên, `--compress` (tree-sitter, chỉ giữ chữ ký) | 156 | 69.350 |
| Chỉ cây thư mục mã nguồn | — | 1.913 |
| `contracts/**`, `test/**`, cấu hình foundry, đầy đủ | 29 | 20.390 |
| Như trên, `--compress` | 29 | **3.179** |
| Một focus file `BinaryOptionMarketChainlink.sol`, đầy đủ | 1 | **2.443** |
| **Context đề xuất** = cây + khung nén của thư mục chứa focus file + focus file đầy đủ | — | **≈ 7.500** |
| Context hiện tại (`sourceContext`, tối đa 80.000 ký tự) | — | ≈ 20.000+ |

Rút ra ba điều:
1. **Lọc file build là bắt buộc.** Chỉ một thư mục `.next` bị commit đã có thể đẩy context lên hàng triệu token. `sourceContext` đang cắt cứng ở 80.000 ký tự nên không vỡ, nhưng phần bị cắt lại là cây file rác.
2. **`--compress` giảm 6 lần** trên phần contracts, giảm 2,3 lần trên toàn repo. Nó bỏ thân hàm, nên chỉ dùng cho file *xung quanh*. Focus file vẫn gửi đầy đủ, vì AI cần thân hàm để viết test đúng.
3. Repomix chạy xong cả repo trong **1,1 giây**, nên không ảnh hưởng thời gian chờ.

## 2. DeepSeek: những gì quyết định giá

Theo trang giá và tài liệu chính thức ngày 23/11/2026:

| Model | Vào, cache hit | Vào, cache miss | Ra | Ghi chú |
|---|---|---|---|---|
| `deepseek-flash` (V4.1-Flash), giờ cao điểm | $0,006 | $0,30 | $1,20 | Context 1M |
| `deepseek-flash`, giờ thấp điểm | $0,003 | $0,15 | $0,60 | |
| `deepseek-v4-pro`, giờ cao điểm | $0,044 | $1,32 | $3,96 | Đắt gấp 3–4 lần |

Giờ cao điểm là 01:00–04:00 và 06:00–10:00 UTC, thứ Hai đến thứ Sáu, tức **08:00–11:00 và 13:00–17:00 giờ Việt Nam**. Ngoài các khung đó giá giảm 50%.

**Ba cơ chế cần khai thác:**

1. **Cache tiền tố, tự bật, rẻ hơn 50 lần.** Request sau trùng *tiền tố* với request trước thì phần trùng tính giá hit. Chỉ trùng ở giữa thì không được tính. Cache tạo trong vài giây và tồn tại vài giờ đến vài ngày, không có bảo đảm. Response trả về `usage.prompt_cache_hit_tokens` và `prompt_cache_miss_tokens`.
2. **Thinking bật sẵn**, mức `high`. Token suy luận gần như chắc chắn tính như token ra, mà token ra là khoản đắt nhất. Tắt bằng `"thinking": {"type": "disabled"}`, hạ mức bằng `"reasoning_effort": "low"`. Ở thinking mode, `temperature` bị bỏ qua.
3. **JSON mode** (`response_format: {type: "json_object"}`) bắt buộc trong prompt phải có chữ "json" và một ví dụ. Response có thể trả `content` toàn khoảng trắng dù `finish_reason = stop`, nên phải kiểm và thử lại.

**Bẫy với code hiện tại.** `model-router.ts:172` đặt `max_tokens` mặc định 1800 cho TESTGEN và không gửi `thinking`. Nếu trỏ `AI_BASE_URL` sang DeepSeek mà giữ nguyên, thinking `high` có thể ăn hết 1800 token, và `content` về rỗng. `scripts/deepseek-probe.ts` kiểm đúng chỗ này (mục 6).

## 3. Bố cục prompt để trúng cache

Nguyên tắc: **phần cố định đứng trước, phần thay đổi đứng sau, và từng byte phải giống nhau giữa các lần gọi.**

```
messages[0] system  : SYSTEM_TESTGEN_V1, một prompt chung cho MỌI bước (F3, F4, F5),
                      có version, không chèn ngày giờ hay id
messages[1] user    : <repo_source trust="untrusted">  cây + khung nén + focus file đầy đủ  </repo_source>
                      dựng một lần khi run bắt đầu, sắp theo path, lưu vào TestGenRun.contextSha256
messages[2] user    : <brief> brief đã chuẩn hóa (cùng chuỗi dùng để tính briefHash) </brief>
─────────── hết phần dùng chung, khoảng 9–10k token ───────────
messages[3] user    : lệnh của bước này + dữ liệu riêng (observations, kế hoạch, ...)
messages[4] asst    : (vòng sửa) câu trả lời trước của model
messages[5] user    : (vòng sửa) loại lỗi + 4 KB log đã scanAndMask
```

- **Vòng sửa nối tiếp hội thoại** (A+B → A+B+C), không dựng prompt mới. Toàn bộ lượt trước trúng cache, chỉ phần log mới tính giá miss.
- Nếu mỗi bước dùng một system prompt riêng thì cache trượt ngay từ token đầu. Lệnh riêng của bước luôn nằm ở message cuối.
- Không đưa vào phần dùng chung: `runId`, giờ, số lần thử, hay thứ tự file phụ thuộc `Object.keys` của DB.
- Các run sau của cùng issue (client sửa brief rồi sinh lại) vẫn trúng cache `system` và `repo_source`, vì brief nằm *sau* repo.

## 4. Repomix trong pipeline

**Chạy ở đâu:** job `source-snapshot` (F0), ngay sau khi giải nén và xóa file nhạy cảm, một lần cho mỗi snapshot.

```bash
# cwd = thư mục tạm riêng, có own.json = "{}"
repomix <work> -c own.json --style json --compress --remove-comments --remove-empty-lines \
  --no-file-summary --no-git-sort-by-changes -i "<danh sách bỏ>" -o <tmp>/pack.json --quiet
```

- `--style json` cho ra `{directoryStructure, files: {path: nội dung nén}}`. Lưu `files` vào `SourceSnapshot.sourceSkeleton Json` để lúc chạy ghép bất kỳ tập con nào, không phải chạy repomix lại.
- `-c own.json` với cwd riêng: **đã thử**, khi đó repomix không đọc `repomix.config.json` trong repo của client. Repo không cài được cấu hình lạ vào bước đóng gói.
- `--no-git-sort-by-changes`: snapshot từ archive không có git, và thứ tự file phải ổn định để giữ cache.
- Danh sách bỏ: `**/.next/**,**/dist/**,**/build/**,**/out/**,**/coverage/**,**/*.min.js,**/*.map,**/*.lock,**/package-lock.json,**/pnpm-lock.yaml,**/*.svg,**/*.png`. Dùng chung danh sách này với `sourceFiles`.
- Giữ bật security check (secretlint) của repomix, làm lớp thứ hai sau `sensitiveSourceFile`.

**Ghép context lúc chạy** (hàm thuần `buildRepoContext(snapshot, focusFiles)` trong `packages/shared/src/testgen/`):
1. Cây file nguồn (≤ 2k token, đã có `fileTree`).
2. Khung nén của các file cùng thư mục, hoặc cùng gói, với focus file, sắp theo path. Dừng ở **4k token**.
3. Focus file đầy đủ từ `sourceFiles` (≤ 3 file).
4. Tổng vượt **12k token** thì bỏ bớt mục 2 trước, rồi mới tới mục 1. Ước token bằng `chars / 3.5` là đủ, không cần thêm tokenizer.

**Chạy trong container, không thêm vào worker (QĐ-T1, mục 9).** Cài `repomix@1.18.1` vào image `bloodyroar-test-runner` (`apps/worker/runner/Dockerfile`, nâng tag lên `:2`). Job snapshot chạy repomix bằng `docker run --network none --read-only` trên thư mục đã giải nén, ghi ra `/work/.br-pack.json`. Lệnh ở trên giữ nguyên, chỉ đổi chỗ chạy.

## 5. Ước tính chi phí AI theo bố cục mới (Đợt 1, `deepseek-flash`, giờ cao điểm)

Một run Đợt 1 có 5 lời gọi: khuôn F3, sửa F3, kế hoạch + sinh F4 gộp thành một lời gọi, và 2 lần sửa F5. Phần dùng chung 10k token.

| Cấu hình | Vào (miss / hit) | Ra | Tiền / run |
|---|---|---|---|
| Hiện tại: context 20k, không trúng cache, thinking `high` (đoán khoảng 4k suy luận mỗi lời gọi) | 110k / 0 | ~28k | **≈ $0,067** |
| Context 7,5k nhờ repomix, chưa sắp cho cache, thinking tắt | 57k / 0 | 8k | ≈ $0,027 |
| **Đề xuất: repomix + bố cục cache + thinking tắt** | 17k / 40k | 8k | **≈ $0,015** |
| Như trên, F4 bật thinking `low` (+1,5k) | 17k / 40k | 9,5k | ≈ $0,017 |
| Như trên, giờ thấp điểm | | | ≈ $0,008 |

Trần mỗi issue mỗi ngày (5 run): từ khoảng $0,34 xuống khoảng **$0,08**. Sau khi tối ưu, **token ra chiếm khoảng 65% số tiền**. Muốn giảm tiếp thì cắt đầu ra:
- `max_tokens` riêng cho từng bước: khuôn 2k, kế hoạch + sinh 4k, sửa 2k.
- Vòng sửa chỉ trả *case đã sửa*, không trả lại cả lô.
- Kế hoạch dùng key JSON ngắn và không có văn xuôi giải thích.

Thinking: tắt ở F3 và các vòng sửa (việc cơ học, có log lỗi dẫn đường). Chỉ bật `low` ở F4 nếu bộ đánh giá US-47 cho thấy tỉ lệ qua F5 tăng rõ. `deepseek-v4-pro` để dành cho F7 (thẩm định, Đợt 2), nơi "khác model" có giá trị.

**Chặn cứng trong worker:** cộng `usage` theo run. Vượt 60k token miss hoặc 20k token ra thì dừng run, trả các case đã qua (`FAILED: BUDGET`).

## 6. Thay đổi `model-router` (foundation cho DeepSeek)

| Thay đổi | Vì sao |
|---|---|
| Provider `deepseek`: `https://api.deepseek.com/chat/completions`, env `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL_{GUARD,TESTGEN,DEBATE}`, mặc định `deepseek-flash`, đặt **trước** Groq | Không trộn với `AI_BASE_URL` (đang dùng cho model tự host) |
| `AICompletionInput.thinking?: "off" \| "low" \| "high"`, chỉ gửi cho provider deepseek. Mặc định `"off"` | Groq và OpenAI có thể từ chối field lạ |
| Chấp nhận `messages` có role `assistant` | Vòng sửa nối tiếp hội thoại |
| Đọc `usage.prompt_cache_hit_tokens`. Migration `AILog.cacheHitTokens Int?`, `AILog.runId String?` | Đo cache thật và tiền theo run |
| `content` rỗng → thử lại 1 lần, rồi mới fallback | Lỗi đã biết của JSON mode |
| `timeoutMs` 120s cho TESTGEN ở worker (`AI_TIMEOUT_MS=12000` hiện tại chỉ hợp với GUARD) | Lời gọi sinh code dài hơn 12 giây |

**Đã có trong repo:** `scripts/deepseek-probe.ts`. Chạy một lần với key thật trước khi viết router:

```bash
DEEPSEEK_API_KEY=... bun scripts/deepseek-probe.ts
```

Script in ra `hit/miss/out/reasoning`, độ trễ, và `blank` cho 4 lời gọi. Nó trả lời ba câu tài liệu chưa nói rõ: lời gọi thứ hai cùng tiền tố có trúng cache không, token suy luận có tính vào `max_tokens` không, và tắt thinking thì nhanh hơn bao nhiêu.

## 7. UX: client không bị kẹt ở bước sinh test

### 7.1 Thời gian chờ đến từ đâu

| Phần | Hiện tại (ước) | Sau tối ưu (ước) |
|---|---|---|
| Cài dependency trong sandbox | ≤ 5 phút **mỗi lần chạy** (`sandbox.ts`: `bun install` hoặc pip với mạng bật), × 4 lần | Cài **một lần** khi snapshot READY, các lần sau chép bản đã cài: vài giây |
| Chạy test | Vài giây đến 1 phút mỗi lần | Như cũ |
| 5 lời gọi AI | 20–60 giây mỗi lời gọi nếu bật thinking `high` | 10–30 giây mỗi lời gọi khi tắt thinking (đo bằng probe) |
| **Tổng một run Đợt 1** | **12–20 phút** | **khoảng 3–5 phút**, phần lớn chạy trong lúc client còn điền brief |

**Thay đổi có lợi nhất cho UX không nằm ở AI mà ở cache dependency:**
- Cài một lần, ngay khi snapshot READY. Client mất vài phút điền brief, việc cài chạy song song trong khoảng thời gian đó.
- Lưu thư mục đã cài theo `snapshot.sha256` trên đĩa worker (LRU, ví dụ 5 GB). Mỗi lần chạy chép ra một thư mục mới.
- **An toàn:** chụp cache *ngay sau bước cài, trước khi bất kỳ test nào chạy*. Mỗi lần chạy dùng bản chép mới. Nếu không, một test độc có thể sửa `node_modules` trong cache và ảnh hưởng mọi lần chạy sau, kể cả lúc chấm bài nộp của dev.

### 7.2 Nguyên tắc giao diện

1. **Không chặn.** Bấm "Tạo test" xong là chạy nền. Client rời trang được, xong thì có `Notification` (bảng đã có) với link quay lại. Trên panel có dòng "Bạn có thể đóng trang, chúng tôi sẽ báo khi xong".
2. **Báo sai sớm.** Thứ tự kiểm: cổng cứng chạy ngay khi client đang gõ, rồi F3 quan sát. Nếu ví dụ của client không khớp code thì client biết sau khoảng **1 phút**, không phải sau 15 phút. Đây là trường hợp tốn thời gian nhất nếu báo muộn.
3. **Cho thấy giá trị trước khi xong.** Kết quả F3 hiện ngay khi có: "Đã chạy `fee(100)` trên code của bạn: ra `2`, khớp mô tả ✓". Client biết hệ thống đã hiểu đúng lỗi ngay ở phút đầu.
4. **Tiến trình thật, không chỉ một vòng quay.** Các bước lấy từ `TestGenRun.stage`: Quan sát code → Lập kế hoạch → Chạy trên code gốc (2/5 test đỏ đúng lý do) → Chạy lại. ETA tính bằng trung vị thời gian các run trước (lưu thời điểm từng stage), chưa có dữ liệu thì không hiện ETA.
5. **Hiện danh sách test dự kiến sau bước kế hoạch**, ở dạng mờ: chỉ tiêu đề và tiêu chí, chưa có code, chưa có nút Approve, kèm trạng thái từng case (đang kiểm / đã qua / bị bỏ: lý do). Việc này nới quy tắc "client chưa thấy case nào", nhưng không cho duyệt gì chưa qua kiểm (mục 8).
6. **Không khóa panel.** Trong lúc chờ client vẫn viết test tay, sửa tiêu chí khác được. Riêng sửa brief thì hỏi trước: "Run đang chạy sẽ bị hủy".
7. **Có nút Hủy**, và khi hết giờ thì trả phần đã xong: case nào đã qua cổng thì vẫn hiện, kèm bảng phủ.

### 7.3 Phác giao diện

```
Tạo test bằng AI                                   [Hủy]
 ✓ Quan sát code         fee(100) đang ra 2, khớp mô tả của bạn      0:48
 ● Chạy trên code gốc    2/3 test đỏ đúng lý do · đang sửa 1 test    ~2 phút nữa
 ○ Chạy lại để loại test chập chờn
 Test dự kiến
   AC-1  fee(100) phải bằng 2.5            đã qua
   AC-1  fee(0) phải bằng 0                đang kiểm
   AC-2  số âm phải báo lỗi                 đang sửa (lỗi import)
 Bạn có thể đóng trang. Chúng tôi sẽ báo khi xong.
```

## 8. Việc cần làm, gắn vào kế hoạch Đợt 1

| Bước (theo READINESS) | Thêm gì | Ngày thêm |
|---|---|---|
| 2 · `sourceFiles` | `sourceSkeleton` bằng repomix, danh sách bỏ dùng chung, **cache dependency theo `sha256`** cài ngay khi READY | +1 |
| 4 · chuyển router | Provider deepseek, `thinking`, role `assistant`, `cacheHitTokens`, `runId`, thử lại khi content rỗng | +0,5 |
| 6 · F3/F4 | `buildRepoContext`, `SYSTEM_TESTGEN_V1` chung, bố cục message ở mục 3, gộp kế hoạch + sinh | 0 (thay cách viết prompt) |
| 7 · F5 | Vòng sửa nối hội thoại, trần token theo run | 0 |
| 8 · UI | Thông báo khi xong, tiến trình theo stage, danh sách dự kiến, nút Hủy | +0,5 |

Tổng Đợt 1 từ 9,5 lên khoảng **11,5 ngày**. Nếu không kịp thì giữ cache dependency, bố cục cache và tắt thinking (ba việc rẻ, lợi lớn). Danh sách dự kiến và ETA để sau.

## 9. Quyết định đã chốt (23/11/2026)

Tiêu chí chọn, theo thứ tự ưu tiên: **chất lượng test** (test sai đi vào `termsHash` và gây tranh chấp) → **thời gian chờ của client** → **token**. Token đã rẻ (khoảng 1,5 cent mỗi run), nên không đánh đổi chất lượng để bớt thêm vài phần mười cent.

| # | Quyết định | Lý do | Bỏ qua phương án nào, vì sao |
|---|---|---|---|
| **T1** | Dùng repomix, nhưng **chạy trong container sandbox** (image runner `:2`, `--network none`, `--read-only`, timeout 60 giây). Không thêm vào `apps/worker/package.json` | Đo thật: repomix kéo **105 MB, 161 package**. Worker đang giữ dependency tối thiểu (`config.ts:4`). Repomix parse code của client bằng tree-sitter, nên chạy trong hộp kín sẽ an toàn hơn. Snapshot làm một lần, mất thêm khoảng 2 giây | *Thêm vào worker*: tăng bề mặt supply-chain cho tiến trình giữ khóa DB và RPC. *Bỏ hẳn khung nén*: AI mất chữ ký của các hàm xung quanh, nên dễ gọi sai constructor hay import (đúng lỗi oreka gặp ở F3), tốn thêm vòng sửa, và một vòng sửa đắt hơn phần token tiết kiệm được. Repomix lỗi thì run vẫn tiếp tục với cây + focus file |
| **T2** | **Hiện danh sách test dự kiến** sau bước kế hoạch: chỉ tiêu đề, mã tiêu chí, trạng thái (đang kiểm / đã qua / bị bỏ: lý do). Không hiện code, không có nút Approve cho tới khi run `DONE` | Client thấy hệ thống hiểu đúng ý ngay ở phút 1–2. Nếu kế hoạch lệch ý thì client bấm Hủy, không phải chờ hết run. Quy tắc gốc vẫn giữ: *không duyệt được* thứ chưa qua kiểm | *Ẩn tới khi xong*: client nhìn vòng quay 3–5 phút, không biết đúng hay sai, và lệch ý thì phát hiện muộn |
| **T3** | Cache dependency **trên đĩa worker**, khóa = `snapshot.sha256 + framework + tag image`, LRU 5 GB. **Cài sẵn ngay khi snapshot READY** | Redeploy chỉ làm lần chạy đầu sau đó cài lại một lần. Object storage phải nén rồi tải `node_modules` hàng trăm MB, gần bằng thời gian cài lại | *Object storage*: chậm, tốn thêm tiền lưu trữ, phức tạp hơn mà không nhanh hơn |

**Ràng buộc an toàn cho T3, không được cắt:** chụp cache *sau bước cài, trước khi bất kỳ test nào chạy*. Mỗi lần chạy chép ra thư mục mới (`cp -a`, dùng reflink nếu filesystem hỗ trợ). Test chỉ chạm vào bản chép, không bao giờ chạm vào cache. Cache cũng dùng cho run chấm bài của dev, nên một test độc ghi vào cache sẽ làm hỏng việc chấm bài.

Các quyết định còn mở trong `AI_TESTGEN_READINESS_2026-11-23.md` mục 5 cũng chốt ở đây:

| # | Quyết định |
|---|---|
| R1 | Gom test quan sát và test cuối vào **một lô** (cùng khuôn `__BR_EXPECT__`). Quan sát đỏ thì bỏ kết quả test cuối và trả `NEEDS_INFO`. Tối đa 4 lần sandbox mỗi run |
| R2 | Đợt 1: ví dụ `BUG` **bắt buộc có `actual`**. Bỏ nhánh `BR_OBSERVE` qua stdout |
| R3 | **Không** thêm `TestCase.status = CANDIDATE`. Ứng viên nằm trong `TestGenRun.candidates Json` và ghi thành `TestCase` trong một transaction khi `DONE`. Danh sách dự kiến ở T2 đọc từ chính trường này |
| R4 | DeepSeek: `deepseek-flash` cho mọi bước Đợt 1, **thinking tắt**. Chỉ bật `low` ở F4 khi US-47 đo được tỉ lệ qua F5 tăng ≥ 10 điểm. `deepseek-v4-pro` dành cho F7 (Đợt 2) |
| R5 | Giữ Groq làm fallback sau DeepSeek, OpenAI đứng cuối. Fallback không trúng cache của DeepSeek, nhưng vẫn tốt hơn để run thất bại |
| R6 | Bộ đánh giá US-47 chỉ chạy **giờ thấp điểm** (sau 17h hoặc cuối tuần, giờ Việt Nam), giảm 50% |

### Giải pháp tổng thể sau khi chốt

```
Client gắn repo ──► F0 snapshot (worker)
                     ├─ giải nén, lọc secret, fileTree, sourceFiles
                     ├─ container: repomix --compress → sourceSkeleton      (~2 s, 1 lần)
                     └─ container: cài dependency → cache theo sha256       (≤ 5 phút, chạy trong lúc client điền brief)
Client điền brief ──► checkBrief (code, tức thì khi gõ)
Bấm "Tạo test" ──► TestGenRun (worker, chạy nền, có thông báo khi xong)
   prefix chung ~10k token (system v1 + repo_source 7,5k + brief), trúng cache từ lời gọi thứ 2
   F3 khuôn (DeepSeek, thinking tắt) ─► 1 lô sandbox: quan sát + test cuối      ← client thấy "khớp mô tả" ở phút ~1
   F4 kế hoạch + sinh gộp 1 lời gọi ─► danh sách dự kiến hiện mờ                 ← client có thể Hủy nếu lệch ý
   F5 classifyFailure ─► sửa ≤ 2 vòng (nối hội thoại) ─► chạy lại loại test chập chờn
   DONE: ghi TestCase trong 1 transaction, bảng phủ, bằng chứng từng case
Kết quả ước tính: ~$0,015 AI + ~$0,01 sandbox mỗi run · 3–5 phút · test đỏ đúng lý do
```

**Thứ tự làm, việc lợi nhiều nhất làm trước:** (1) `classifyFailure` + cổng Approve → (2) cache dependency + cài sẵn → (3) router DeepSeek (sau khi chạy probe) → (4) snapshot `sourceSkeleton` + `buildRepoContext` → (5) `TestGenRun` + F3/F4/F5 → (6) UI. Nếu trễ hạn S8 thì cắt danh sách dự kiến và ETA ở UI, **không cắt (1), (2), (3)**.

## Nguồn

- DeepSeek: [Pricing](https://api-docs.deepseek.com/quick_start/pricing), [Context caching](https://api-docs.deepseek.com/guides/kv_cache), [Thinking mode](https://api-docs.deepseek.com/guides/thinking_mode), [JSON output](https://api-docs.deepseek.com/guides/json_mode). Tra ngày 23/11/2026.
- Repomix: [Code compression](https://repomix.com/guide/code-compress), [CLI options](https://repomix.com/guide/command-line-options), [Library](https://repomix.com/guide/development/using-repomix-as-a-library).
- Số token và thời gian repomix: đo trong phiên này trên `mangekyou-labs/oreka` (clone nông, 23/11/2026).
- Số giây mỗi lời gọi DeepSeek và tỉ lệ cache hit là **ước tính**, chờ kết quả `deepseek-probe.ts`.
