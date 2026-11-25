# EP-7: AI sinh test chính xác · phân tích sâu và thiết kế

Ngày 22/11/2026. Người lập: Khôi (qua Claude Code). Tài liệu này thay phần thiết kế của `AI_TESTGEN_PLAN_2026-11-22.md`. Phần "luồng hiện tại" trong file đó vẫn đúng.

Câu hỏi cần trả lời:
1. Client phải đưa những gì thì AI mới sinh được test đúng với issue?
2. Thiếu thông tin thì làm gì?
3. Test do AI sinh phải qua những vòng kiểm nào trước khi tới tay client?

---

## 1. Vì sao bài toán này khó hơn "gọi model sinh test"

Ở BloodyRoar, test không phải đồ trang trí. Test đã duyệt đi vào `termsHash`, là điều kiện để dev nộp bài, và là căn cứ khi tranh chấp. Một test sai gây hại theo một trong hai hướng: dev làm đúng nhưng không qua được test, hoặc dev qua test mà client vẫn không được thứ mình cần.

Khác với các benchmark, mình **không có bản sửa mẫu**. SWT-bench chấm test bằng cách chạy trên code lỗi (phải đỏ) và trên bản sửa thật (phải xanh). Mình chỉ có được vế đầu. Vì vậy mọi kiểm tra phải dựa vào ba nguồn: mô tả của client, code gốc, và kết quả chạy trên code gốc.

Test sai đến từ ba nguồn, mỗi nguồn cần một lớp chặn khác nhau:

| Loại lỗi | Ví dụ | Lớp chặn |
|---|---|---|
| **L1. Thiếu dữ kiện** | Client viết "tính phí sai". AI tự chọn mức phí đúng là 2% trong khi client muốn 2,5% | Bắt buộc dữ kiện trước khi sinh (tầng A) |
| **L2. Đỏ sai lý do** | Test import một hàm không tồn tại, gọi sai tham số, lỗi cú pháp. Test đỏ trên base nên trông như "tái hiện được lỗi" | Phân loại lỗi khi chạy trên base (tầng B) |
| **L3. Đúng kỹ thuật, lệch ý** | Test đỏ vì đúng một assertion, nhưng assertion đó kiểm thứ client không yêu cầu | Đối chiếu từng test với brief, rồi client xác nhận bằng ví dụ cụ thể (tầng B, C) |

### 1.1 Lỗ hổng cụ thể trong code hiện tại

| # | Lỗ hổng | Bằng chứng |
|---|---|---|
| H-1 | Đầu vào chỉ có `title`, `description` (markdown tự do), `category`, `requiredSkills`. Không có trường nào buộc client nêu hành vi mong đợi, hành vi thực tế, hay một ví dụ cụ thể | `generateTestCases`, `ai.module.ts:157` |
| H-2 | **Test đỏ vì lỗi import hay TypeError vẫn được tính là `baseStatus = failed`, và client Approve được.** Runner chỉ trả `passed/failed/skipped` cùng `message`. Worker không xem lỗi thuộc loại gì | `runner/sandbox.ts:14`, `jobs/test-runs.ts:50` |
| H-3 | Một lần gọi model, không có bước đối chiếu test với yêu cầu. Prompt chỉ dặn "đừng bịa yêu cầu" | `ai.module.ts:175` |
| H-4 | Không chạy lại để bắt test chập chờn. Một test đỏ ngẫu nhiên (thời gian, thứ tự, mạng) vẫn qua cổng | `jobs/test-runs.ts` |
| H-5 | Case nào không sinh được thì biến mất, client không biết tiêu chí nào chưa được phủ | `ai.module.ts:183` xóa rồi tạo lại toàn bộ |
| H-6 | `checkIssueScope` (US-86) đã tìm ra điểm mơ hồ, nhưng kết quả không nối vào việc sinh test. Client đọc xong rồi bỏ qua cũng được | `ai.module.ts:117` |

---

## 2. Thị trường và nghiên cứu đã giải bài này thế nào

### 2.1 Phía đầu vào: buộc người báo lỗi đưa đủ dữ kiện

| Hệ thống | Cách làm | Mình học được gì |
|---|---|---|
| **HackerOne** (bounty bảo mật, giống mình ở chỗ tiền phụ thuộc vào việc tái hiện được) | Chương trình đặt template cho form nộp, có mục "Steps to reproduce". Triage không tái hiện được thì chuyển báo cáo sang trạng thái **Needs More Info** và hỏi lại người nộp. Theo HackerOne, báo cáo có cấu trúc tốt được phản hồi nhanh hơn và dễ có kết quả tốt hơn | Brief có khuôn theo loại bounty, và một trạng thái "Cần thêm thông tin" chặn bước sinh test |
| **GitHub Issue Forms** | Form YAML với trường `required: true`, có dropdown và checkbox. Tài liệu hướng dẫn khuyên giữ số trường bắt buộc ở mức tối thiểu, nhiều quá thì người dùng bỏ ngang | Chỉ bắt buộc những trường thật sự cần cho test. Trường còn lại tùy chọn |
| **Kiro (AWS)** | Spec-driven: trước khi viết code, sinh `requirements.md` gồm user story và tiêu chí chấp nhận theo cú pháp EARS (`WHEN … THE SYSTEM SHALL …`). Khi chạy task, Kiro luôn đối chiếu với tiêu chí đó | Tiêu chí viết theo khuôn `Khi … thì …`, mỗi tiêu chí có mã để test trỏ về |

### 2.2 Phía làm rõ ý: hỏi đúng câu, đúng lúc

| Nghiên cứu | Cách làm | Kết quả công bố | Áp dụng |
|---|---|---|---|
| **ClarifyGPT** (2023) | Sinh vài lời giải rồi chạy trên cùng một input. Kết quả khác nhau nghĩa là yêu cầu mơ hồ, khi đó sinh câu hỏi làm rõ cho người dùng | GPT-4 trên MBPP-sanitized: pass@1 từ 70,96% lên 80,80% | Phát hiện mơ hồ bằng cách cho model diễn giải hai lần độc lập. Hai lần lệch nhau thì hỏi client |
| **TiCoder** (Microsoft Research, Lahiri và cộng sự) | Thay vì bắt người dùng viết spec, đưa ra các test cụ thể để người dùng trả lời đúng/sai. Test được duyệt trở thành spec từng phần | Codex trên MBPP: pass@1 từ 48,39% lên 70,49% chỉ với 1 câu hỏi. Nghiên cứu người dùng sau đó: người dùng đánh giá code AI đúng hơn và đỡ tải nhận thức hơn | Hỏi client bằng ví dụ cụ thể ("Với đầu vào X, kết quả phải là Y, đúng không?"), không bắt client đọc code test |

### 2.3 Phía sinh test từ issue và lọc trước khi đưa người xem

| Hệ thống | Cách làm | Kết quả công bố | Áp dụng |
|---|---|---|---|
| **SWT-bench** (ETH Zurich) | Benchmark: từ issue GitHub, sinh test phải đỏ trên code lỗi và xanh sau bản sửa | Gọi model trực tiếp: 3,6% thành công trên bản Lite. Code agent (SWE-Agent+): 19,2% | **Một lần gọi model, như code hiện tại, gần như chắc chắn cho test sai phần lớn thời gian.** Cần vòng lặp có phản hồi từ việc chạy thật |
| **LIBRO** (KAIST, ICSE 2023) | Sinh nhiều test từ một bug report, rồi lọc và xếp hạng những test tái hiện được lỗi | Tái hiện được 33% số bug trên Defects4J. Bài tiếp theo: bước hậu xử lý nâng precision lên tới 90% | Sinh xong phải lọc. Bỏ test là bình thường, không phải thất bại |
| **Otter** (IBM, ICML 2025) | Ba bước: định vị code liên quan → lập kế hoạch rồi tự đánh giá kế hoạch (Satisfied/Unsatisfied/Unsure) → sinh test, có kiểm tra theo luật trước và sau | Dùng test của Otter để lọc patch: precision 65–92% | Bước "lập kế hoạch có trích dẫn" trước khi viết code, và nhãn "Unsure" chuyển sang hỏi người |
| **Meta TestGen-LLM** (FSE 2024) | Chuỗi bộ lọc tăng dần trước khi kỹ sư xem: build được → chạy lại nhiều lần vẫn đạt (loại test chập chờn) → tăng coverage | 75% build được, 57% đạt ổn định, 25% tăng coverage. Kỹ sư nhận 73% đề xuất | Chuỗi cổng chạy thật, có chạy lại để bắt test chập chờn. Người chỉ xem cái đã qua cổng |
| **Meta ACH** (FSE 2025) | Sinh lỗi giả (mutant) cho một mối lo cụ thể, rồi sinh test phải bắt được đúng lỗi đó | Kỹ sư giữ 73% test sinh ra | Ý chính: test có giá trị khi nó **đỏ vì đúng cái lỗi đang nói tới**. Mình không có mutant, nhưng có hành vi thực tế client mô tả. Lỗi khi chạy trên base phải khớp hành vi đó |
| **Agentless** | Sinh song song nhiều test tái hiện, lọc bằng việc chạy, bỏ phiếu cùng test hồi quy | Một nghiên cứu đo được tỉ lệ test kích hoạt đúng lỗi khoảng 40% | Sinh nhiều bản tốn tiền và tỉ lệ đúng vẫn thấp. Mình chỉ dùng sinh thêm bản khi cần phát hiện mơ hồ |
| **Qodo Cover-Agent** (mã nguồn mở) | Vòng lặp: sinh → chạy → kiểm đạt và coverage → sinh tiếp, có giới hạn số vòng | — | Giới hạn cứng số vòng và token cho mỗi lần sinh |

### 2.4 Rút ra

1. **Không hệ thống nào tin output đầu tiên của model.** Tất cả đều có chuỗi lọc bằng cách chạy thật, sau đó mới tới người.
2. **Lọc bằng chạy thật là chưa đủ.** "Đỏ trên base" chỉ có nghĩa khi đỏ đúng lý do (ACH, LIBRO).
3. **Làm rõ ý hiệu quả nhất là hỏi bằng ví dụ cụ thể**, ít câu, đúng chỗ mơ hồ (TiCoder, ClarifyGPT). Không phải bắt người dùng điền form dài.
4. **Thiếu dữ kiện thì dừng và hỏi** (HackerOne Needs More Info), không để AI tự đoán.
5. **Chấp nhận bỏ test.** Một tiêu chí không có test đã kiểm phải được báo rõ, để client viết tay hoặc bổ sung dữ kiện.

---

## 3. Thiết kế luồng đích: ba tầng

```mermaid
flowchart TB
  subgraph A["Tầng A · Brief đủ dữ kiện (client)"]
    A1[Form brief theo loại bounty] --> A2{Cổng cứng<br/>đủ trường, ví dụ, file có thật}
    A2 -- thiếu --> A1
    A2 -- đủ --> A3[AI kiểm độ sẵn sàng<br/>diễn giải 2 lần, so lệch]
    A3 -- mơ hồ --> A4[Câu hỏi cụ thể cho client<br/>trả lời được ghi vào brief]
    A4 --> A3
    A3 -- sẵn sàng --> B0
  end
  subgraph B["Tầng B · Kiểm duyệt nhiều vòng (server, client chưa thấy)"]
    B0[Lập kế hoạch: mỗi tiêu chí → mục tiêu, input, giá trị kỳ vọng] --> B1[Sinh code test]
    B1 --> B2{Kiểm tĩnh}
    B2 -- lỗi --> R
    B2 -- đạt --> B3{Chạy trên base<br/>đỏ đúng lý do?}
    B3 -- sai lý do --> R[Sửa, tối đa 2 vòng]
    R --> B2
    B3 -- đúng --> B4{Chạy lại lần 2<br/>kết quả giống hệt?}
    B4 -- đạt --> B5{AI thẩm định độc lập<br/>bám brief, đỏ đúng hành vi?}
    B5 --> B6[Bảng phủ tiêu chí]
  end
  subgraph C["Tầng C · Client xác nhận bằng bằng chứng"]
    B6 --> C1[Mỗi case: tiêu chí, ví dụ, lỗi trên base]
    C1 --> C2{Case "chưa chắc"?}
    C2 -- có --> C3[Hỏi đúng/sai bằng ví dụ]
    C3 -- sai --> A4
    C2 -- không --> C4[Approve → termsHash]
    C3 -- đúng --> C4
  end
```

### 3.1 Tầng A: brief đủ dữ kiện

**Nguyên tắc.** Mỗi trường trong brief phải trả lời được câu hỏi "test cần nó cho phần nào". Trường nào không đóng góp cho `given`, `when`, `then` hoặc giá trị kỳ vọng thì không bắt buộc.

#### Brief cho `BUG_FIX`

| Trường | Bắt buộc | Dùng cho phần nào của test | Cổng cứng |
|---|---|---|---|
| Hành vi thực tế (đang sai thế nào) | Có | Thông báo lỗi kỳ vọng khi chạy trên base (tầng B3, B5) | ≥ 20 ký tự |
| Hành vi mong đợi | Có | `then` | ≥ 20 ký tự |
| Các bước tái hiện | Có | `given`, `when` | ≥ 1 bước |
| **Ít nhất một ví dụ cụ thể**: đầu vào → kết quả mong đợi (→ kết quả thực tế nếu biết) | Có | Giá trị trong assertion. Đây là trường quan trọng nhất | Có cả đầu vào và kết quả mong đợi. Tối đa 5 ví dụ |
| File hoặc hàm nghi là chỗ lỗi (`focusFiles`, ≤ 3) | Có khi đã có snapshot | Ngữ cảnh code đứng đầu (US-45) | Có trong `fileTree` |
| Thông báo lỗi, log, stack trace | Không | Đối chiếu lỗi trên base | Qua `scanAndMask` |
| Ngoài phạm vi (không cần làm) | Không | Chặn AI sinh test thừa | — |

#### Brief cho `FEATURE` (và `OTHER`, `UI_UX`, `DATA_SCIENCE` có code chạy được)

| Trường | Bắt buộc | Dùng cho phần nào | Cổng cứng |
|---|---|---|---|
| Tiêu chí chấp nhận theo khuôn `Khi … thì …` (mỗi dòng một tiêu chí, có mã `AC-1`, `AC-2`…) | Có, 1–8 tiêu chí | Mỗi tiêu chí sinh ≥ 1 test | Mỗi dòng có cả "khi" và "thì" |
| Ít nhất một ví dụ cụ thể cho mỗi tiêu chí | Có | Giá trị assertion | — |
| API mới phải có (tên hàm hoặc endpoint, chữ ký) | Có nếu tính năng thêm API | Cho phép test đỏ vì "chưa có hàm X" một cách hợp lệ (B3) | Tên hợp lệ, chưa có trong snapshot |
| File liên quan (`focusFiles`) | Không | Ngữ cảnh | Có trong `fileTree` |
| Ngoài phạm vi | Không | Chặn test thừa | — |

`SMART_CONTRACT`, `AUDIT`, `DEVOPS`, `DOCUMENTATION`: runner hiện chỉ hỗ trợ vitest và pytest (`detectFramework`). Các loại này chỉ sinh tiêu chí BDD, không sinh test chạy được. Giữ như hiện tại.

#### Cổng cứng (không cần AI)

Chạy ở server khi lưu brief và trước khi cho bấm "Generate":
- Đủ trường bắt buộc theo loại.
- Mỗi tiêu chí hoặc lỗi có ít nhất một ví dụ có kết quả mong đợi.
- Mọi `focusFiles` có trong `fileTree`. Tên hàm client nhắc tới (trong ví dụ, trong "file hoặc hàm nghi lỗi") được tìm trong nội dung snapshot. Không tìm thấy thì cảnh báo "Không thấy `calcFee` trong repo, kiểm lại tên?" (cảnh báo, không chặn, vì client có thể gọi tên khác).
- Snapshot ở trạng thái `READY` nếu muốn test chạy được.

#### Kiểm độ sẵn sàng bằng AI (mở rộng `checkIssueScope` của US-86)

Theo ClarifyGPT, nhưng rẻ hơn: không sinh code, chỉ cho model **diễn giải brief hai lần độc lập** (hai lời gọi, cùng prompt, cách nhau bởi seed hoặc thứ tự trường) thành danh sách `{tiêu chí, đầu vào, kết quả mong đợi}`. Sau đó so hai bản bằng code:
- Hai bản cho cùng tiêu chí mà khác kết quả mong đợi → điểm mơ hồ, sinh câu hỏi dạng chọn: "Với `amount = 100`, phí là `2` hay `2.5`?"
- Có tiêu chí mà một bản có, bản kia không → hỏi "Tiêu chí này có thuộc phạm vi không?"
- Cộng với `ambiguities` và `openQuestions` hiện có của US-86.

Kết quả: `READY` hoặc `NEEDS_INFO` cùng tối đa 5 câu hỏi. Client trả lời ngay trong form, câu trả lời được ghi vào brief thành mục "Làm rõ" và trở thành một phần của brief (nên cũng nằm trong `termsHash` khi các tiêu chí được duyệt).

Khi `NEEDS_INFO`, client có hai lựa chọn: trả lời câu hỏi, hoặc bấm "Generate anyway". Trường hợp sau được ghi lại và mọi case sinh ra bị gắn nhãn "dữ kiện chưa đủ" trên UI. Không chặn hẳn, vì AI không bao giờ được chặn client (ranh giới mục 0 của `AI_STRATEGY_V1_V2.md`).

### 3.2 Tầng B: chuỗi kiểm duyệt trước khi tới client

Chạy thành một job nền trong worker (lý do ở mục 5, QĐ-1). Client thấy tiến trình "Đang lập kế hoạch → Đang sinh → Đang chạy trên code gốc → Đang thẩm định", không thấy case nào cho tới khi xong.

| Bước | Làm gì | Đạt khi | Không đạt thì |
|---|---|---|---|
| **B0 Lập kế hoạch** (theo Otter) | Model nhận brief + context, trả cho mỗi tiêu chí: file/hàm đích, đầu vào, giá trị kỳ vọng, `expectBaseFail`, mã tiêu chí được trích | Kiểm bằng code: mọi mục trỏ về một mã tiêu chí có thật; file/hàm đích có trong snapshot (hoặc là API mới đã khai); giá trị kỳ vọng xuất hiện trong ví dụ của brief | Mục không trích dẫn hoặc trỏ file không có thì bỏ, ghi lý do vào bảng phủ |
| **B1 Sinh code** | Từ kế hoạch đã lọc, sinh code test. Mỗi case mang `criterionRef` | zod như hiện tại | Thử lại 1 lần kèm lỗi zod (US-49) |
| **B2 Kiểm tĩnh** (không cần AI) | Đường dẫn hợp lệ, có marker `[TC:id]`; có ít nhất một assertion (`expect(` / `assert`); không có `.skip`, `.only`, `xfail`, `skipif`; không gọi mạng (`fetch`, `http`, `requests`, `socket`); không dùng thời gian hay số ngẫu nhiên mà không cố định; import tương đối trỏ tới file có trong `fileTree`; **giá trị kỳ vọng của ví dụ trong brief xuất hiện nguyên văn trong code test** | Qua hết | Đưa vào vòng sửa |
| **B3 Chạy trên base, phân loại lỗi** | Chạy cả lô trong sandbox như hiện nay. Với mỗi case, phân loại `message` (xem bảng 3.2.1) | `expectBaseFail = true`: đỏ loại `ASSERTION`, hoặc `MISSING_API` đúng tên API mới đã khai. `expectBaseFail = false`: xanh | Đưa vào vòng sửa, kèm loại lỗi và trích đoạn log |
| **B4 Vòng sửa** (US-46) | Gửi model: code test, loại lỗi, log đã cắt 4 KB và qua `scanAndMask` | Tối đa 2 vòng cho cả lô | Case vẫn hỏng sau 2 vòng: bỏ, ghi vào bảng phủ |
| **B5 Chạy lại lần 2** (theo TestGen-LLM) | Chạy lại các case còn sống | Kết quả và loại lỗi giống hệt lần 1 | Bỏ, đánh dấu "chập chờn" |
| **B6 Thẩm định độc lập** | Một lời gọi riêng, prompt riêng, `temperature` 0, chỉ đọc: brief, code test, đoạn lỗi trên base. Không thấy prompt sinh. Trả cho mỗi case: (a) case kiểm tiêu chí nào; (b) lỗi trên base có thể hiện đúng "hành vi thực tế" client mô tả không; (c) có assertion nào không có căn cứ trong brief không; (d) có trùng case khác không. Kết luận `PASS`, `FAIL` hoặc `UNSURE` kèm lý do ≤ 300 ký tự | `PASS` | `FAIL`: bỏ (hoặc sửa nếu còn vòng). `UNSURE`: giữ, chuyển sang tầng C với câu hỏi |
| **B7 Bảng phủ** | Với mỗi tiêu chí: số case đã qua, số case bị bỏ và lý do | Mọi tiêu chí có ≥ 1 case | Tiêu chí trống hiện rõ cho client: "Chưa sinh được test đã kiểm cho AC-2: bổ sung ví dụ hoặc viết tay" |

#### 3.2.1 Phân loại lỗi trên base

Runner đã trả `message` (tối đa 2000 ký tự) cho từng case. Thêm một hàm thuần trong `packages/shared` để phân loại, có test riêng:

| Loại | Dấu hiệu vitest | Dấu hiệu pytest | Được coi là "đỏ đúng lý do"? |
|---|---|---|---|
| `ASSERTION` | `AssertionError`, `expected … to …` | `AssertionError`, `assert … ==` | Có |
| `MISSING_API` | `is not a function`, `does not provide an export named X` | `ImportError: cannot import name 'X'`, `AttributeError: … has no attribute 'X'` | Chỉ khi X là API mới client đã khai trong brief |
| `IMPORT_ERROR` | `Cannot find module`, `Failed to load url` | `ModuleNotFoundError` | Không |
| `SYNTAX_ERROR` | `SyntaxError`, `Transform failed` | `SyntaxError`, `IndentationError`, lỗi collection | Không |
| `RUNTIME_ERROR` | `TypeError`, `ReferenceError` khác | `TypeError`, `NameError`, `KeyError` | Không (thường là test gọi sai). Thẩm định B6 có thể nâng lên nếu lỗi đúng là "hành vi thực tế" client mô tả, ví dụ client báo "app crash với TypeError khi …" |
| `TIMEOUT`, `NO_RESULT` | — | — | Không |

Bảng này cũng sửa lỗ hổng H-2 cho cả test client viết tay: nút Approve chỉ mở khi loại lỗi được chấp nhận, không chỉ khi `baseStatus = failed`.

#### 3.2.2 Ngân sách cho mỗi lần sinh

| Mục | Giới hạn |
|---|---|
| Lời gọi model | Tối đa 8: kế hoạch 1, sinh 1 (+1 thử lại schema), sửa 2, thẩm định 1, dự phòng 1 |
| Lần chạy sandbox | Tối đa 4: base lần 1, sau mỗi vòng sửa, lần chạy lại |
| Thời gian | Job hết hạn sau 20 phút, trả kết quả của những case đã qua |
| Lượt của client | 1 lần sinh tính 1 lượt `aiRateLimit` cho cả chuỗi. Đổi thành 5 lần sinh/issue/ngày, tính bằng DB thay vì bộ nhớ |

Kiểm độ sẵn sàng ở tầng A tốn thêm 2 lời gọi, rẻ vì không sinh code.

### 3.3 Tầng C: client xác nhận bằng bằng chứng

Mỗi case hiện cho client (bổ sung vào `TestCasePanel`):
- Tiêu chí được phủ (`AC-2: Khi số tiền là 100 thì phí là 2.5`).
- Ví dụ đang được kiểm, viết bằng lời, không phải code.
- **Bằng chứng trên code hiện tại**: trích lỗi đã rút gọn, ví dụ `expected 2.5, received 2`. Đây là cách client kiểm nhanh nhất là test có đỏ đúng chỗ không.
- Nhãn: "Đã qua mọi bước kiểm" hoặc "AI chưa chắc" kèm lý do của bước B6.

Với case "AI chưa chắc", hỏi một câu đúng/sai theo kiểu TiCoder, sinh từ chính assertion: "Với `amount = 100`, sau khi sửa kết quả phải là `2.5`. Đúng không?"
- **Đúng**: case được phép Approve.
- **Sai**: client nhập giá trị đúng. Giá trị đó được ghi vào brief (mục "Làm rõ") và sinh lại riêng case đó (tính vào ngân sách).

Cổng Approve hiện có giữ nguyên, thêm điều kiện loại lỗi ở 3.2.1. AI không bao giờ tự Approve.

---

## 4. Thiết kế này chặn được gì và không chặn được gì

| Loại lỗi | Bị chặn ở | Còn lọt khi |
|---|---|---|
| L1 thiếu dữ kiện | A: cổng cứng bắt ví dụ có kết quả mong đợi; kiểm độ sẵn sàng hỏi chỗ lệch | Client cố ý bấm "Generate anyway" (có nhãn cảnh báo), hoặc chính ví dụ client đưa là sai |
| L2 đỏ sai lý do | B2 kiểm tĩnh, B3 phân loại lỗi, B5 chạy lại | Test đỏ bằng assertion nhưng assertion kiểm thứ khác. Phần này thuộc L3 |
| L3 lệch ý | B0 bắt trích dẫn tiêu chí, B2 bắt giá trị kỳ vọng xuất hiện trong code, B6 thẩm định, C hỏi đúng/sai | Brief sai từ gốc. Không có bản sửa mẫu nên không kiểm được vế "xanh sau khi sửa" |
| Prompt injection từ repo | Khối `<repo_source>` (US-48), B6 không đọc repo, B2 bắt `.skip` và assertion rỗng, B3 bắt "đỏ đúng lý do" | Rất khó lọt qua cả B3 lẫn B6 với một test vô dụng |

Giới hạn cần nói thẳng với client trên UI (một dòng): test AI sinh đã được chạy trên code hiện tại và đối chiếu với mô tả, nhưng chưa chạy trên bản sửa nào. Client vẫn là người duyệt cuối.

---

## 5. Quyết định cần chốt (thay QĐ-A, QĐ-B của file kế hoạch cũ)

**QĐ-1. Chuỗi kiểm duyệt chạy ở đâu.** Tầng B cần chờ sandbox (vài phút cho cài đặt và chạy), gọi model nhiều lần xen giữa. Một request GraphQL không chờ được như vậy.
- **Đề xuất: job `TESTGEN` trong worker.** Chuyển `model-router.ts`, `guard/` và `hash.ts` từ `apps/web/src/ai` sang `packages/shared/src/ai` (chỉ dùng `fetch` và Prisma, không phụ thuộc Next). Web giữ mutation, chỉ tạo job và trả `runId`. UI poll trạng thái như cách đang poll base check.
- Phương án nút "Fix with AI" trong file cũ không còn đủ, vì yêu cầu là kiểm nhiều vòng **trước khi** client thấy.

**QĐ-2. Nơi lấy nội dung file được chọn.** Giữ đề xuất A1 của file cũ: worker lưu `sourceFiles` (file text ≤ 20 KB, đã lọc secret, tổng ≤ 1 MB). Bây giờ nó còn phục vụ thêm việc tìm tên hàm ở cổng cứng.

**QĐ-3. Mô hình thẩm định (B6).** Đề xuất: cùng nhà cung cấp, khác prompt, `temperature` 0. Muốn chắc hơn thì đặt `AI_MODEL_TESTGEN_JUDGE` sang model khác (ví dụ OpenAI khi sinh bằng Groq). Bộ đánh giá US-47 sẽ cho biết có đáng không.

**QĐ-4. Brief lưu thế nào.** Đề xuất: cột `Issue.brief Json?`, kiểm bằng một zod schema dùng chung web và worker. `description` giữ làm phần mô tả tự do. Brief đã duyệt đi vào `termsHash` cùng các tiêu chí (cần kiểm lại chỗ tính `termsHash`, chưa đọc trong lần này).

---

## 6. Thay đổi dữ liệu

| Bảng | Thêm |
|---|---|
| `Issue` | `brief Json?` (theo QĐ-4) |
| `SourceSnapshot` | `fileTree Json?` (lấy từ PR #28), `sourceFiles Json?` (QĐ-2) |
| `TestCase` | `criterionRef String?`, `baseFailureKind String?`, `validation Json?` (kết quả từng bước B0–B6, nhãn, lý do), `generationRunId String?` |
| Bảng mới `TestGenRun` | `id, issueId, status (QUEUED/RUNNING/DONE/FAILED), stage, briefHash, sourceSha256, calls, sandboxRuns, coverage Json, error, leaseUntil, createdAt, finishedAt`. Worker lấy job bằng `FOR UPDATE SKIP LOCKED` như các job khác |

---

## 7. Kế hoạch và cắt phạm vi

S8 kết thúc 4/12, còn khoảng 9 ngày làm việc, và S8 còn có wizard và workflow client–dev. Không làm hết được trong S8. Đề xuất chia hai đợt.

### Đợt 1, trong S8: chặn được L1 và L2, đủ để demo

| # | Việc | Story | Ước lượng |
|---|---|---|---|
| 1 | Lấy `fileTree` (merge #28 hoặc cherry-pick), mở lại US-46 trên Jira | — | 0,5 |
| 2 | **Phân loại lỗi trên base** (3.2.1) + cổng Approve theo loại lỗi. Sửa luôn H-2 cho test viết tay | mới | 1 |
| 3 | Brief theo loại bounty: zod schema dùng chung, cột `Issue.brief`, cổng cứng, form trong `TestCasePanel` (wizard của Trâm dùng lại sau) | mới, gộp US-44 | 2 |
| 4 | Context: `focusFiles` đứng đầu, `sourceFiles`, khối `<repo_source>` | US-45, US-48 | 1 |
| 5 | Chuyển model router sang `packages/shared`, job `TESTGEN` với B0 → B5 (kế hoạch, sinh, kiểm tĩnh, chạy base, sửa 2 vòng, chạy lại), bảng phủ B7 | US-46, US-49, mới | 3 |
| 6 | UI: tiến trình job, bảng phủ, bằng chứng lỗi trên base cho từng case | mới | 1 |
| | | | **8,5 ngày** |

### Đợt 2, S9 hoặc sau phát hành: chặn L3 tốt hơn

| # | Việc | Story | Ước lượng |
|---|---|---|---|
| 7 | Kiểm độ sẵn sàng bằng diễn giải hai lần, câu hỏi làm rõ ghi vào brief | mở rộng US-86 | 1,5 |
| 8 | Thẩm định độc lập B6 | mới | 1 |
| 9 | Câu hỏi đúng/sai cho case "chưa chắc", sinh lại một case | mới | 1 |
| 10 | Bộ đánh giá 8–10 repo, đo theo từng bước: tỉ lệ qua B2, B3, B5, B6, số vòng sửa, token, thời gian | US-47 | 2 |
| | | | **5,5 ngày** |

Lý do thứ tự: bước 2 (phân loại lỗi) rẻ nhất mà chặn được loại test vô dụng phổ biến nhất, và có lợi ngay cả khi không làm gì khác. Bước 3 (brief) quyết định chất lượng đầu vào cho mọi bước sau. Thẩm định bằng AI (bước 8) đắt hơn và khó đo, nên làm sau khi có bộ đánh giá.

### Ticket Jira cần tạo hoặc sửa (chưa làm, chờ bạn duyệt)

- Mở lại US-46 (code chưa có).
- Sửa US-44: thêm phạm vi brief theo loại bounty và cổng cứng.
- Tạo mới: "Phân loại lỗi base check", "Job TESTGEN nhiều bước trong worker", "Bảng phủ tiêu chí và bằng chứng trên base", "Thẩm định độc lập", "Câu hỏi đúng/sai cho case chưa chắc".
- US-47 thêm chỉ số theo từng bước.

---

## 8. Nguồn

- HackerOne: [Quality reports](https://docs.hackerone.com/hackers/quality-reports.html), [Introducing Report Templates](https://www.hackerone.com/blog/introducing-report-templates), [Triage 101](https://www.hackerone.com/sites/default/files/2025-02/HackerOne-Triage-101.pdf)
- GitHub: [Syntax for issue forms](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms)
- Kiro: [Specs concepts](https://kiro.dev/docs/specs/concepts), [EARS](https://en.wikipedia.org/wiki/Easy_Approach_to_Requirements_Syntax)
- ClarifyGPT: [arXiv 2310.10996](https://arxiv.org/abs/2310.10996v1)
- TiCoder: [arXiv 2208.05950](https://arxiv.org/abs/2208.05950v2), [Microsoft Research user study](https://www.microsoft.com/en-us/research/publication/llm-based-test-driven-interactive-code-generation-user-study-and-empirical-evaluation/)
- SWT-bench: [arXiv 2406.12952](https://arxiv.org/pdf/2406.12952)
- LIBRO: [arXiv 2209.11515](https://arxiv.org/abs/2209.11515v3), [bài tiếp theo 2311.04532](https://arxiv.org/abs/2311.04532v2)
- Otter: [arXiv 2502.05368](https://arxiv.org/abs/2502.05368v2), [slide ICML 2025](https://icml.cc/media/icml-2025/Slides/44767.pdf)
- Meta TestGen-LLM: [arXiv 2402.09171](https://arxiv.org/abs/2402.09171)
- Meta ACH: [arXiv 2501.12862](https://arxiv.org/abs/2501.12862), [Meta Engineering blog](https://engineering.fb.com/2025/02/05/security/revolutionizing-software-testing-llm-powered-bug-catchers-meta-ach/)
- Agentless và tỉ lệ kích hoạt: [arXiv 2506.08311](https://arxiv.org/pdf/2506.08311)
- Qodo Cover: [GitHub qodo-ai/qodo-cover](https://github.com/qodo-ai/qodo-cover)

Các con số trong mục 2 là số tác giả tự công bố, đo trên benchmark và model khác nhau, không so trực tiếp với nhau được. Mình đọc qua tóm tắt và trích đoạn, chưa đọc toàn văn từng bài.
