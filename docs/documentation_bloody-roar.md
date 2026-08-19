# 📑 TÀI LIỆU MÔ TẢ DỰ ÁN

**Dự án:** Bloody-Roar — Nền Tảng Thuê Lập Trình Viên Phi Tập Trung

---

> **Đọc nhanh trong 3 phút:**
> Bloody-Roar là một chợ việc làm (bounty marketplace) nơi người thuê (Client) đăng bài toán kèm tiền thưởng, lập trình viên (Developer) vào giải và nhận tiền tự động. Điểm khác biệt: **không cần tin tưởng lẫn nhau** — mọi thứ được đảm bảo bởi công nghệ blockchain (giữ tiền minh bạch) và trí tuệ nhân tạo (kiểm tra code, phân xử tranh chấp).

---

## 1. ĐẶT VẤN ĐỀ — TẠI SAO CẦN DỰ ÁN NÀY?

### 1.1 Thực trạng thị trường freelance hiện nay

Hãy tưởng tượng bạn là một startup founder. Bạn có một con bug cần sửa gấp. Bạn lên một sàn freelance, đăng việc, chọn một lập trình viên. Lúc này, vấn đề muôn thuở xuất hiện:

> **Ai trả tiền trước?**

| Nếu bạn trả trước                                                                            | Nếu bạn giữ tiền đến cuối                                                                          |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Lập trình viên có thể biến mất, code dở tệ, hoặc không bàn giao. Bạn mất tiền oan. | Lập trình viên sợ bạn "bùng", code xong rồi bạn lấy code rồi hủy job, không trả đồng nào. |

Cả hai bên đều có lý do chính đáng để **không tin tưởng đối phương**. Đây gọi là bài toán **"Bất đối xứng niềm tin"** (Asymmetric Trust) — một vấn đề tồn tại suốt hàng chục năm trong ngành freelance.

### 1.2 Các sàn hiện tại giải quyết ra sao?

Các sàn như Upwork, Fiverr, Freelancer đóng vai trò **"người trung gian đứng ra giữ tiền"**. Bạn nạp tiền vào sàn, sàn giữ, khi xong việc sàn trả cho lập trình viên.

Cách này giải quyết được phần nào, nhưng lại sinh ra vấn đề mới:

- **Phí cao:** Sàn thu 10-20% giá trị hợp đồng.
- **Tập trung quyền lực:** Sàn là người duy nhất quyết định ai đúng ai sai khi có tranh chấp. Họ có thể thiên vị, chậm trễ, hoặc thậm chí... phá sản và ôm tiền bỏ trốn.
- **Thiếu minh bạch:** Bạn không biết sàn xử lý tiền của bạn như thế nào.

### 1.3 Giải pháp của Bloody-Roar

Bloody-Roar thay thế **"niềm tin vào con người/tổ chức"** bằng **"niềm tin vào công nghệ"**. Cụ thể là 4 trụ cột:

| Trụ cột                        | Nó làm gì?                                                                                                                          | Giải thích đơn giản                                                                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ký quỹ Blockchain**    | Giữ tiền trong hợp đồng thông minh, tự động trả khi đủ điều kiện                                                        | Giống như một cái két sắt trong suốt: ai cũng thấy tiền ở trong, nhưng chỉ mở được khi cả hai bên đồng ý (hoặc hết thời gian chờ)    |
| **Định danh số (eKYC)** | Xác minh danh tính thật của lập trình viên, gắn với chứng chỉ không thể chuyển nhượng                                  | Mỗi lập trình viên có một "chứng minh thư số" duy nhất, không thể làm giả hay bán cho người khác                                             |
| **Phòng code cách ly**   | Lập trình viên code trong môi trường được ghi hình toàn bộ, người thuê không xem được code cho đến khi trả tiền | Giống như làm việc sau tấm kính một chiều: lập trình viên làm việc bình thường, người thuê thấy tiến độ nhưng không copy được code |
| **Trợ lý AI**            | Tự động dò tìm lỗ hổng bảo mật, chấm điểm chất lượng code, và phân tích bằng chứng khi có tranh chấp             | Một "quan tòa robot" không thiên vị, phân tích toàn bộ dữ liệu làm việc để gợi ý phán quyết công bằng                                     |

### 1.4 Tầm nhìn

> *"Thay thế niềm tin bằng toán học và trí tuệ nhân tạo."*

Một nền tảng nơi bạn không cần phải tin bất kỳ ai — kể cả chính nền tảng. Bạn chỉ cần tin vào code (hợp đồng thông minh) và bằng chứng (dữ liệu được ghi lại).

---

## 2. BA NHÂN VẬT CHÍNH TRONG HỆ THỐNG

### 2.1 Người thuê (Client) — "Tôi có việc, tôi cần người làm"

**Là ai?**

- Founder công ty khởi nghiệp cần sửa bug gấp
- Quản lý sản phẩm muốn thêm tính năng mới
- Cá nhân có dự án phần mềm nhưng không đủ người

**Họ muốn gì?**

- Đăng bài toán lên, mô tả rõ ràng, treo thưởng (ví dụ: 200 USDT)
- Có người vào giải quyết
- Chỉ trả tiền khi code chạy đúng, không bị "bùng" mất tiền
- Nếu lập trình viên không làm được, được hoàn tiền

**Bloody-Roar giúp họ như thế nào?**

- Tiền nằm trong "két sắt blockchain", không ai rút ra được nếu chưa có sự đồng ý
- AI tự động kiểm tra code có pass test không, thay vì phải ngồi đọc từng dòng
- Nếu muốn hủy, hai bên đồng ý là tiền tự động trả lại — không cần xin ai

**Ví dụ câu chuyện người dùng:**

> *"Tôi đăng một bug React cần sửa, treo thưởng 300 USDT. Một lập trình viên đã xác minh danh tính vào nhận. Cậu ấy code trong phòng cách ly, AI báo pass hết test. Tôi duyệt, tiền tự động chuyển. Tổng thời gian: 2 ngày. Không một cuộc gọi, không một email đòi tiền."*

### 2.2 Lập trình viên (Developer) — "Tôi có kỹ năng, tôi cần việc"

**Là ai?**

- Sinh viên CNTT muốn kiếm thêm thu nhập
- Freelancer chuyên nghiệp tìm job phù hợp kỹ năng
- Developer muốn thử sức với công nghệ mới

**Họ muốn gì?**

- Duyệt danh sách việc, lọc theo công nghệ mình giỏi (React, Python, Solidity...)
- Nhận việc không cần đặt cọc (nhiều sàn yêu cầu đặt cọc 10% để chống "bùng" — Bloody-Roar không cần)
- Code xong, pass kiểm tra, nhận tiền — không lo bị quỵt
- Có bằng chứng bảo vệ mình nếu xảy ra tranh chấp

**Bloody-Roar giúp họ như thế nào?**

- Nhận việc không cần đồng nào trong ví (Zero-Stake)
- Toàn bộ quá trình làm việc được ghi lại tự động — nếu khách đòi hủy ngang, bạn có bằng chứng
- Nếu khách "biến mất" 30 ngày không phản hồi, tiền tự động chuyển về ví bạn

**Ví dụ câu chuyện người dùng:**

> *"Tôi apply vào một job sửa lỗi React. Sau khi tôi code xong và AI xác nhận pass test, khách im lặng 20 ngày không trả lời. Sang ngày 30, tôi bấm nút Nhận Tiền Tự Động, và 200 USDT về ví tôi — không cần một lời giải thích nào."*

### 2.3 Trọng tài (Admin) — "Tôi đảm bảo công bằng cho cả hai bên"

**Là ai?**

- Người vận hành nền tảng
- Chỉ can thiệp khi có tranh chấp

**Họ làm gì?**

- Xem bảng điều khiển tổng quan về hoạt động nền tảng
- Khi có tranh chấp, AI sẽ đưa ra một bản báo cáo phân tích đầy đủ (ai nói gì trong chat, ai commit code gì, ai làm bao nhiêu phần trăm công việc...)
- Trọng tài dựa vào báo cáo đó để ra quyết định chia tiền theo tỷ lệ (ví dụ: 70% trả khách, 30% trả lập trình viên)

**Giới hạn quyền lực:**

- Trọng tài **không thể** tự ý rút tiền hay chuyển tiền cho người quen
- Mọi quyết định đều có **thời gian chờ 24 giờ** — trong 24 giờ đó, nếu ai phát hiện quyết định bất công, họ có thể phản đối
- Mọi hành động của trọng tài đều được ghi lại công khai trên blockchain, không ai xóa được

---

## 3. DỰ ÁN NÀY CÓ GÌ ĐẶC BIỆT? (SÁNG TẠO & KHÁC BIỆT)

### 3.1 "Lười đặt cọc" (Lazy-Deposit) — Người thuê không cần nạp tiền ngay

**Thông thường:** Bạn muốn đăng việc → bạn phải nạp tiền vào sàn trước → tiền bị "chết" ở đó dù chưa có ai nhận việc.

**Bloody-Roar:** Bạn đăng việc trước, ký một "lời hứa trả tiền" bằng chữ ký số (không tốn phí). Chỉ khi nào bạn **chính thức chọn được người làm**, tiền mới bị khoá. Nếu không có ai phù hợp, bạn rút lui mà không mất gì.

### 3.2 "Không cần đặt cọc" (Zero-Stake) — Lập trình viên không cần vốn

**Thông thường:** Nhiều nền tảng blockchain yêu cầu lập trình viên đặt cọc 10-20% giá trị job để đảm bảo họ không "bùng". Điều này tạo rào cản cho người mới, đặc biệt là sinh viên.

**Bloody-Roar:** Thay vì đặt cọc bằng tiền, chúng tôi dùng **danh tính đã xác minh** làm tài sản thế chấp. Mỗi lập trình viên đều trải qua bước xác minh danh tính thật (chụp ảnh khuôn mặt 3D, quét giấy tờ tuỳ thân) và được cấp một **chứng chỉ số không thể chuyển nhượng**. Nếu họ gian lận, chứng chỉ bị thu hồi — đồng nghĩa với việc mất quyền nhận job vĩnh viễn. "Uy tín" trở thành tài sản quý hơn tiền.

### 3.3 "Két sắt trong suốt" (Smart Contract Escrow) — Tiền minh bạch tuyệt đối

Toàn bộ quá trình giữ tiền và trả tiền được thực hiện bởi một **hợp đồng thông minh** (Smart Contract) — một chương trình máy tính chạy trên blockchain mà **không ai có thể sửa đổi hay can thiệp**.

Các kịch bản trả tiền:

| Tình huống                                           | Kết quả                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------- |
| Lập trình viên làm xong, người thuê hài lòng  | 100% tiền → Lập trình viên (sau khi trừ phí nền tảng nhỏ) |
| Người thuê "biến mất", không phản hồi 30 ngày | 100% tiền → Lập trình viên (bảo vệ người làm)             |
| Cả hai đồng ý huỷ                                 | 100% tiền → Người thuê (hoà bình, không cần trọng tài)   |
| Có tranh chấp, trọng tài ra quyết định          | Tiền chia theo tỷ lệ, sau 24 giờ chờ                           |

### 3.4 "Tấm kính một chiều" (Asymmetric Visibility) — Chống ăn cắp code

Đây là một trong những sáng tạo quan trọng nhất của Bloody-Roar.

**Vấn đề phổ biến:** Người thuê đăng việc, lập trình viên nộp code. Người thuê xem code, copy, rồi tuyên bố "code không đạt yêu cầu" để huỷ job và lấy lại tiền — trong khi vẫn giữ được code miễn phí.

**Giải pháp của Bloody-Roar:** Trong suốt quá trình làm việc, người thuê chỉ thấy:

- Màn hình terminal **bị làm mờ** (biết có hoạt động đang diễn ra, nhưng không đọc được nội dung code)
- Tiến độ công việc (bao nhiêu file đã được tạo, bao nhiêu commit)
- Nhưng **không xem được code gốc**

Chỉ khi người thuê **đã trả tiền** (hoặc AI xác nhận code pass hết bài kiểm tra), code mới được hiển thị đầy đủ.

### 3.5 "Hộp đen ghi hình" (Blackbox Trace) — Bằng chứng không thể chối cãi

Toàn bộ quá trình làm việc của lập trình viên trong phòng code cách ly được ghi lại:

- Từng dòng lệnh gõ trong terminal
- Từng thay đổi nhỏ trong file code (micro-diffs)
- Từng commit lên hệ thống quản lý code
- Toàn bộ lịch sử chat giữa hai bên

Tất cả tạo thành một bộ **"bằng chứng hộp đen"** — giống như hộp đen máy bay. Khi có tranh chấp, AI sẽ đọc toàn bộ bằng chứng này để phân tích và trọng tài sẽ dựa vào đó ra quyết định.

### 3.6 "Quan toà AI" (AI Dispute Assistant) — Phân xử không thiên vị

Khi có tranh chấp, thay vì một người ngồi đọc hàng trăm trang chat log và code, AI sẽ tự động:

1. Gom toàn bộ dữ liệu: chat, code, commit, thời gian làm việc
2. Phân tích: ai làm bao nhiêu phần trăm công việc? Có dấu hiệu gian lận không? (ví dụ: một người dùng hai tài khoản giả vờ là khách và thợ)
3. Đề xuất tỷ lệ chia tiền (ví dụ: "Lập trình viên đã hoàn thành 70% yêu cầu. Đề xuất trả 70% tiền cho lập trình viên, 30% hoàn lại cho người thuê.")

Trọng tài (con người) chỉ cần xem báo cáo này và bấm "Phê duyệt" — thay vì phải tự điều tra từ đầu.

---

## 4. HÀNH TRÌNH CỦA MỘT JOB — TỪ A ĐẾN Z

Hãy cùng theo dõi một job mẫu từ lúc đăng đến lúc hoàn tất.

### Bước 1: Người thuê đăng việc

Anh Minh (CTO một startup) phát hiện một con bug React gây crash ứng dụng khi người dùng upload ảnh. Anh vào Bloody-Roar, điền vào form:

- **Tiêu đề:** "Sửa lỗi crash khi upload ảnh > 5MB"
- **Mô tả:** Mô tả chi tiết, đính kèm ảnh chụp màn hình lỗi
- **Công nghệ:** React, TypeScript
- **Tiền thưởng:** 200 USDT

Anh bấm "Đăng". Hệ thống lưu lại. **Anh chưa mất đồng nào.**

### Bước 2: Xác minh danh tính (nếu chưa có)

Trước khi có thể nhận việc, lập trình viên phải xác minh danh tính một lần duy nhất:

- Trên máy tính, một mã QR hiện ra
- Dùng điện thoại quét mã QR
- Chụp ảnh khuôn mặt 3D (xoay mặt, chớp mắt để chứng minh là người thật, không phải ảnh)
- Chụp ảnh giấy tờ tuỳ thân (CCCD/hộ chiếu)

Nếu đạt, hệ thống cấp một **"chứng minh thư số"** gắn vĩnh viễn vào ví điện tử của họ. Chứng chỉ này không thể bán hay cho người khác.

### Bước 3: Lập trình viên ứng tuyển

Khánh (một freelancer React) thấy job của anh Minh trên bảng tin. Anh ấy đã có chứng minh thư số. Anh ấy bấm "Nhận việc", viết vài dòng giới thiệu về kinh nghiệm của mình.

Anh Minh nhận được thông báo: "Có người muốn nhận việc của bạn."

### Bước 4: Người thuê chọn và nạp tiền

Anh Minh xem hồ sơ của Khánh (đã xác minh danh tính, có uy tín tốt), và bấm "Chọn người này".

Lúc này, hệ thống yêu cầu anh Minh nạp 200 USDT vào "két sắt blockchain". Anh xác nhận bằng ví điện tử (MetaMask). Tiền bây giờ đã nằm trong két — **không ai rút được nếu chưa có sự đồng ý của cả hai hoặc quyết định của trọng tài.**

### Bước 5: Làm việc trong phòng code cách ly

Một **phòng code ảo** được tự động tạo ra cho Khánh. Trong phòng này có:

- Trình soạn thảo code chuyên nghiệp
- Màn hình dòng lệnh để chạy thử
- Kết nối với GitHub để lưu code

Khánh code, chạy thử, sửa lỗi. Mọi thao tác đều được ghi lại. Trong khi đó, anh Minh chỉ thấy màn hình mờ — anh biết công việc đang tiến triển, nhưng không xem được code.

Thỉnh thoảng hai người nhắn tin qua khung chat tích hợp. AI ngầm quét mọi tin nhắn: nếu ai lỡ tay gửi mật khẩu hay thông tin nhạy cảm, AI sẽ tự động xoá và cảnh báo.

### Bước 6: Nộp bài và kiểm tra tự động

Khánh code xong, bấm "Nộp bài". Hệ thống tự động:

1. Chạy loạt bài kiểm tra (test) để xác nhận code chạy đúng
2. AI quét code tìm lỗ hổng bảo mật
3. AI đánh giá chất lượng code (có sạch không, có dễ bảo trì không)

Tất cả đều pass. Hệ thống báo cho anh Minh: "Bài đã nộp, đã qua kiểm tra tự động. Vui lòng xem xét."

### Bước 7a: Kết thúc có hậu — Người thuê duyệt

Anh Minh kiểm tra, thấy bug đã được sửa. Anh bấm "Duyệt & Trả tiền".

Két sắt blockchain mở ra. 200 USDT (trừ một khoản phí nền tảng nhỏ) được chuyển thẳng vào ví của Khánh. Giao dịch hoàn tất. Bây giờ code đã hiển thị đầy đủ cho anh Minh.

### Bước 7b: Kết thúc bất ngờ — Người thuê "biến mất"

Giả sử anh Minh đột nhiên không trả lời — không duyệt, cũng không từ chối. Sau 30 ngày, Khánh bấm "Nhận tiền tự động". Hệ thống kiểm tra: đúng là đã 30 ngày không có phản hồi. Tiền tự động chuyển cho Khánh.

### Bước 7c: Kết thúc căng thẳng — Tranh chấp

Giả sử anh Minh không đồng ý: "Code vẫn còn lỗi, tôi không trả tiền."

Khánh phản đối: "Tôi đã làm đúng yêu cầu."

Một trong hai bên bấm "Mở tranh chấp". Tiền bị đóng băng trong két. Lúc này:

1. AI tự động phân tích toàn bộ bằng chứng: chat, code, commit, thời gian làm việc...
2. AI đưa ra báo cáo, ví dụ: *"Lập trình viên đã hoàn thành 80% yêu cầu. 20% còn lại là lỗi phát sinh không có trong mô tả gốc. Đề xuất: trả 80% cho lập trình viên, hoàn 20% cho người thuê."*
3. Trọng tài xem báo cáo, bấm phê duyệt.
4. Hệ thống bắt đầu đếm ngược **24 giờ**. Trong thời gian này, nếu ai phát hiện quyết định bất công, họ có thể phản đối.
5. Sau 24 giờ không có phản đối, tiền tự động chia theo tỷ lệ.

---

## 5. GIẢI THÍCH THUẬT NGỮ

Để giúp người đọc không chuyên về công nghệ hiểu được, dưới đây là bảng giải thích các thuật ngữ xuất hiện trong tài liệu.

| Thuật ngữ                                            | Giải thích đơn giản                                                                                                                                                                                                                                                |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Blockchain**                                   | Một cuốn sổ cái kỹ thuật số, nơi mọi giao dịch được ghi lại công khai, minh bạch, và không ai có thể xoá hay sửa. Giống như một cuốn sổ ghi nợ mà cả làng cùng giữ, ai cũng có một bản sao.                                        |
| **Hợp đồng thông minh (Smart Contract)**     | Một chương trình máy tính chạy trên blockchain, tự động thực hiện các điều kiện đã được lập trình sẵn. Ví dụ: "Nếu cả hai bên cùng đồng ý huỷ, tự động trả tiền về cho người thuê" — không cần ai đứng ra làm chứng. |
| **Ký quỹ (Escrow)**                            | Cơ chế giữ tiền của một bên thứ ba trung gian, chỉ giải ngân khi điều kiện được đáp ứng. Trong Bloody-Roar, "bên thứ ba" là hợp đồng thông minh, không phải một công ty.                                                                 |
| **Ví điện tử (Wallet)**                      | Một ứng dụng (như MetaMask) cho phép bạn giữ tiền mã hoá và ký xác nhận giao dịch. Giống như ví da, nhưng là trên máy tính.                                                                                                                      |
| **Chứng minh thư số (Soulbound Token - SBT)** | Một chứng chỉ kỹ thuật số gắn vĩnh viễn với danh tính của bạn, không thể bán hay tặng cho người khác. Nó chứng minh bạn là người thật, đã qua xác minh.                                                                                   |
| **Xác minh danh tính (eKYC)**                  | Quy trình kiểm tra bạn là người thật bằng cách chụp ảnh khuôn mặt 3D và giấy tờ tuỳ thân. Viết tắt của "electronic Know Your Customer".                                                                                                            |
| **AI (Trí tuệ nhân tạo)**                    | Hệ thống máy tính có khả năng phân tích dữ liệu, nhận diện mẫu, và đưa ra gợi ý — giống như cách con người suy nghĩ, nhưng nhanh hơn và không thiên vị.                                                                                 |
| **Phòng code cách ly (Sandbox)**               | Một môi trường máy tính ảo được tách biệt hoàn toàn, nơi lập trình viên làm việc. Mọi thứ diễn ra trong đó đều được ghi lại, nhưng người ngoài chỉ thấy được những gì hệ thống cho phép.                                   |
| **Hộp đen (Blackbox Trace)**                   | Bộ dữ liệu ghi lại toàn bộ hoạt động trong phòng code cách ly: từng dòng lệnh, từng thay đổi file. Khi có tranh chấp, đây chính là bằng chứng.                                                                                                 |

---

## 6. CÁC CHỨC NĂNG CHÍNH CỦA NỀN TẢNG

### 6.1 Chợ việc làm (Marketplace)

- **Đăng việc:** Người thuê điền tiêu đề, mô tả, công nghệ yêu cầu, tiền thưởng
- **Tìm việc:** Lập trình viên duyệt danh sách, lọc theo công nghệ, mức thưởng, trạng thái
- **Gợi ý thông minh:** Khi người thuê bắt đầu đăng việc mới, AI tự động gợi ý những việc tương tự đã được giải quyết — giúp họ tham khảo hoặc tránh đăng trùng

### 6.2 Xác minh danh tính (Identity Verification)

- **Một lần duy nhất:** Chỉ cần làm một lần, dùng được cho mọi job về sau
- **Quét QR:** Không cần cài ứng dụng — quét mã QR trên máy tính bằng điện thoại
- **Chụp ảnh 3D:** Hệ thống yêu cầu xoay mặt, chớp mắt để chống giả mạo bằng ảnh tĩnh
- **Chứng chỉ số:** Sau khi xác minh, lập trình viên nhận huy hiệu "Đã xác minh" hiển thị trên hồ sơ

### 6.3 Két sắt thông minh (Smart Escrow)

- **Nạp tiền khi chọn người:** Không cần nạp tiền từ lúc đăng việc
- **Tự động trả tiền:** Khi người thuê duyệt, tiền chuyển ngay lập tức
- **Tự động hoàn tiền:** Khi cả hai đồng ý huỷ
- **Tự động trả sau 30 ngày:** Nếu người thuê mất tích
- **Chia tiền theo tỷ lệ:** Khi có tranh chấp và trọng tài ra quyết định

### 6.4 Phòng code ảo (Web IDE Sandbox)

- **Không cần cài đặt gì:** Mọi thứ chạy trên trình duyệt
- **Đầy đủ công cụ:** Trình soạn thảo code, màn hình dòng lệnh, kết nối GitHub
- **Tự động ghi hình:** Mọi thao tác được lưu lại làm bằng chứng
- **Che thông minh:** Người thuê chỉ thấy tiến độ, không thấy code gốc
- **An toàn:** Hệ thống chặn các lệnh nguy hiểm, giới hạn tài nguyên sử dụng

### 6.5 Trợ lý AI

- **Bảo vệ thông tin nhạy cảm:** Tự động phát hiện và xoá mật khẩu, mã khoá riêng tư, thông tin cá nhân nếu ai đó lỡ gửi trong chat
- **Chấm điểm code:** Tự động đánh giá chất lượng code (tính bảo mật, độ sạch, logic)
- **Phân tích tranh chấp:** Khi có mâu thuẫn, AI đọc toàn bộ bằng chứng và đề xuất cách giải quyết

### 6.6 Chat trong job (Real-time Chat)

- Mỗi job có một phòng chat riêng giữa người thuê và lập trình viên
- Có thể gửi tin nhắn, đoạn code, file đính kèm
- AI ngầm bảo vệ — chặn gửi thông tin nhạy cảm

### 6.7 Tích hợp GitHub

- Lập trình viên có thể kết nối tài khoản GitHub của mình
- Khi họ gửi code lên GitHub và được chấp nhận (merge), hệ thống tự động ghi nhận và kích hoạt quá trình nghiệm thu

---

## 7. AI LÀM ĐƯỢC GÌ TRONG HỆ THỐNG NÀY?

Hệ thống AI trong Bloody-Roar đóng 3 vai trò:

### 7.1 Người gác cổng bảo mật

AI luôn chạy ngầm ở mọi nơi có dữ liệu người dùng nhập vào: khung chat, file code, file đính kèm. Nó quét liên tục để tìm những thứ như:

- Mật khẩu database
- Khoá ví tiền mã hoá
- Mã token truy cập API
- Số điện thoại, email cá nhân (dữ liệu riêng tư)

Nếu phát hiện, AI sẽ tự động chặn, xoá, và cảnh báo người gửi. Điều này ngăn chặn tình huống "lỡ tay gửi lộ mật khẩu" — một tai nạn phổ biến khi làm việc online.

### 7.2 Hội đồng chấm code

Khi lập trình viên nộp bài, AI không chỉ chạy test tự động mà còn đánh giá chất lượng code từ 3 góc nhìn:

| Góc nhìn              | AI hỏi gì?                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| **Chất lượng** | Code có dễ hiểu không? Có tuân thủ quy tắc sạch không? Có file kiểm thử không?              |
| **Bảo mật**     | Có lỗ hổng nào không? Có nguy cơ bị tấn công không?                                            |
| **Logic**         | Code có giải quyết đúng bài toán đặt ra không? Có xử lý các tình huống ngoại lệ không? |

Kết quả là một điểm số tổng hợp. Nếu điểm quá thấp, hệ thống sẽ không cho phép người thuê trả tiền — bảo vệ họ khỏi code kém chất lượng.

### 7.3 Quan toà phân xử

Khi có tranh chấp, AI đọc toàn bộ dữ liệu làm việc và trả lời những câu hỏi:

- Ai đã làm bao nhiêu phần trăm công việc?
- Có dấu hiệu gian lận không? (Ví dụ: cùng một người dùng hai tài khoản để tự thuê chính mình)
- Lập trình viên có commit code thật không, hay chỉ làm vài thay đổi nhỏ?
- Cuộc trò chuyện có dấu hiệu bất thường không?

Kết quả là một bản báo cáo gợi ý cách chia tiền. Trọng tài (con người) xem báo cáo và đưa ra quyết định cuối cùng.

---

## 8. CÔNG NGHỆ SỬ DỤNG (DÀNH CHO NGƯỜI QUAN TÂM KỸ THUẬT)

| Thành phần          | Công nghệ chính     | Vai trò                                                              |
| --------------------- | ---------------------- | --------------------------------------------------------------------- |
| Giao diện web        | React, Tailwind CSS    | Trang web người dùng nhìn thấy và tương tác                  |
| Máy chủ             | Node.js, Express       | Xử lý nghiệp vụ, lưu trữ dữ liệu, điều phối AI             |
| Dữ liệu             | MongoDB                | Lưu thông tin người dùng, job, chat, lịch sử làm việc        |
| Blockchain            | Solidity (Ethereum)    | Hợp đồng thông minh giữ tiền và tự động thanh toán         |
| AI                    | OpenAI / Google Gemini | Phân tích code, phân tích tranh chấp, lọc thông tin nhạy cảm |
| Phòng code ảo       | Docker                 | Tạo môi trường làm việc cách ly cho lập trình viên          |
| Chat thời gian thực | Socket.io              | Nhắn tin tức thì giữa người thuê và lập trình viên         |
| Xác minh danh tính  | Sumsub / Persona       | Đối tác cung cấp công nghệ chụp ảnh 3D và quét giấy tờ    |

---

## 9. HIỆN TRẠNG DỰ ÁN (ĐÃ LÀM ĐƯỢC GÌ?)

### Đã hoàn thiện

| Chức năng           | Mô tả ngắn                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------- |
| Chợ việc            | Đăng việc, tìm việc, ứng tuyển, duyệt ứng viên                                      |
| Xác minh danh tính  | Quét QR, chụp ảnh 3D, cấp chứng chỉ số                                                 |
| Két sắt thông minh | Nạp tiền, trả tiền, hoàn tiền, huỷ đồng thuận, tranh chấp, chia tiền theo tỷ lệ |
| Phòng code ảo       | Trình soạn thảo code, dòng lệnh, kết nối GitHub, ghi hình toàn bộ                   |
| Che code thông minh  | Người thuê thấy tiến độ, không thấy code gốc                                        |
| Trợ lý AI           | Lọc thông tin nhạy cảm, chấm điểm code, phân tích tranh chấp                        |
| Chat                  | Nhắn tin thời gian thực, AI bảo vệ                                                       |
| GitHub                | Tự động phát hiện khi lập trình viên gửi code                                        |
| Bảng điều khiển   | Trang quản lý dành cho trọng tài và quản trị viên                                    |

### Đang nghiên cứu & phát triển thêm

| Ý tưởng                                | Mô tả                                                                                                                                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hội đồng AI (AI Swarm)**       | Thay vì một trọng tài là con người, một bầy đàn AI cùng thảo luận và bỏ phiếu để ra phán quyết — loại bỏ hoàn toàn yếu tố con người khỏi khâu phân xử |
| **Quy đổi ra tiền Việt**        | Tự động chuyển đổi tiền thưởng từ tiền mã hoá sang VNĐ, chuyển thẳng vào tài khoản ngân hàng của lập trình viên                                                |
| **Hỗ trợ nhiều blockchain**      | Ngoài Ethereum, hỗ trợ thêm các mạng phí thấp như Polygon, Solana để giảm chi phí giao dịch                                                                               |
| **Chống gian lận bằng World ID** | Tích hợp công nghệ Worldcoin để xác minh danh tính không cần giấy tờ — chỉ cần quét mống mắt                                                                          |

---

## 10. KẾT LUẬN

Bloody-Roar không chỉ là một nền tảng thuê lập trình viên. Nó là một **hệ thống tự vận hành bằng niềm tin vào công nghệ**, nơi:

- **Lập trình viên** không cần tin người thuê — họ tin vào két sắt blockchain
- **Người thuê** không cần tin lập trình viên — họ tin vào AI kiểm tra
- **Cả hai** không cần tin nền tảng — họ tin vào bằng chứng và code

> *"Bloody-Roar: Thay thế niềm tin bằng toán học và trí tuệ nhân tạo."*
