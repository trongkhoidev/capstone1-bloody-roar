# ĐỀ XUẤT DỰ ÁN BLOODY-ROAR

## Nền tảng kết nối khách hàng và lập trình viên với cơ chế escrow trên blockchain

| Thông tin | Nội dung |
| --- | --- |
| Học phần | Capstone Project 1 — CMU-SE 450 |
| Nhóm | C1SE.42 |
| Đơn vị | International School, Duy Tan University |
| Thành viên | Kiên, Khôi, Hiếu, Hân, Trâm |
| Giảng viên hướng dẫn | [CẦN BỔ SUNG] |
| Thời gian thực hiện | 10 tuần, ngày bắt đầu và kết thúc [CẦN BỔ SUNG] |
| Phiên bản | 2.0 |
| Ngày cập nhật | 19/09/2026 |

> **Trạng thái tài liệu.** Đây là đề xuất độc lập bằng tiếng Việt. Các nhận định về phần mềm đã có được đối chiếu với nhánh `main` tại commit [`33aed2e1028d9fd89bb6d62b47a3df65ea1cb328`](https://github.com/trongkhoidev/capstone1-bloody-roar/commit/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328). Chức năng chỉ có trong nhánh hoặc pull request riêng không được xem là đã có trên upstream.

## 1. Tóm tắt đề xuất

Bloody-Roar là nền tảng kết nối khách hàng có nhu cầu phát triển phần mềm với lập trình viên phù hợp. Khách hàng đăng một công việc (Issue), lập trình viên ứng tuyển, khách hàng chọn người thực hiện và theo dõi quá trình bàn giao. Điểm khác biệt của sản phẩm là tiền thưởng được giữ bằng smart contract escrow thay vì do nền tảng trực tiếp nắm giữ.

Sản phẩm hướng đến ba giá trị chính:

1. giảm rủi ro khách hàng trả tiền nhưng không nhận được kết quả;
2. giảm rủi ro lập trình viên hoàn thành công việc nhưng không được thanh toán;
3. tạo lịch sử trao đổi và trạng thái công việc có thể kiểm tra khi phát sinh bất đồng.

MVP tập trung vào marketplace, xác thực bằng ví, ứng tuyển và lựa chọn lập trình viên, chat theo từng công việc, escrow trên Base Sepolia và quy trình khiếu nại có người phân xử. Các chức năng AI, GitHub integration, phân tích nâng cao và chứng thực danh tiếng chỉ được đưa vào khi những luồng cốt lõi đã ổn định và có đủ thời gian kiểm chứng.

## 2. Bối cảnh và vấn đề

Trong giao dịch freelance, hai bên thường phải chấp nhận một trong hai rủi ro: khách hàng trả trước và phụ thuộc vào người thực hiện, hoặc lập trình viên bàn giao trước và phụ thuộc vào thiện chí thanh toán. Các nền tảng tập trung giảm rủi ro bằng cách giữ tiền và xử lý tranh chấp, nhưng người dùng phải tin vào chính sách, khả năng vận hành và quyết định của nền tảng.

Đối với các nhóm nhỏ hoặc giao dịch xuyên biên giới, vấn đề còn rõ hơn:

- điều khoản hoàn thành thường thiếu tiêu chí đo được;
- tiến độ, trao đổi và bằng chứng nằm rải rác ở nhiều công cụ;
- trạng thái thanh toán khó kiểm chứng độc lập;
- quy trình khiếu nại thiếu thời hạn và lối thoát rõ ràng;
- chi phí trung gian có thể không phù hợp với công việc giá trị nhỏ.

Bloody-Roar không đặt mục tiêu loại bỏ mọi yếu tố tin cậy. Sản phẩm chuyển việc giữ và phân phối tiền sang smart contract, đồng thời công khai các quy tắc về thời hạn, giải ngân, hoàn tiền và phán quyết. Những phần còn phụ thuộc vào con người, như đánh giá chất lượng sản phẩm hoặc phân xử bằng chứng, được mô tả rõ thay vì gắn nhãn “trustless”.

## 3. Người dùng và nhu cầu

| Nhóm liên quan | Nhu cầu chính |
| --- | --- |
| Khách hàng | Đăng yêu cầu rõ ràng, chọn lập trình viên, bảo toàn tiền trước khi có kết quả, giải ngân hoặc khiếu nại theo quy tắc xác định |
| Lập trình viên | Tìm công việc phù hợp, ứng tuyển, trao đổi, bàn giao và nhận tiền mà không phụ thuộc hoàn toàn vào quyết định đơn phương của khách hàng |
| Người phân xử | Tiếp cận hồ sơ bằng chứng đầy đủ, đưa ra phán quyết trong phạm vi quyền hạn đã công bố |
| Quản trị viên | Vận hành marketplace, xử lý nội dung và sự cố mà không có quyền tùy ý chiếm dụng tiền escrow |
| Nhóm phát triển | Có phạm vi MVP, tiêu chí chấp nhận, trạng thái triển khai và trách nhiệm kỹ thuật minh bạch |

## 4. Giải pháp đề xuất và giá trị khác biệt

### 4.1 Marketplace theo vòng đời công việc

Khách hàng tạo Issue với mô tả, lĩnh vực, tiền thưởng và thời hạn. Lập trình viên tìm kiếm, lọc và gửi Application. Khách hàng xem ứng viên rồi chọn một người thực hiện. Mỗi thay đổi trạng thái phải có điều kiện quyền hạn rõ ràng; ví dụ, chỉ chủ Issue được sửa hoặc hủy trước khi đã chọn lập trình viên.

### 4.2 Escrow do ví người dùng kiểm soát

Khi hai bên thống nhất, khách hàng dùng ví để nạp token vào smart contract. Backend có thể chuẩn bị dữ liệu giao dịch và hiển thị trạng thái, nhưng không giữ khóa và không ký thay người dùng. Một giao dịch chỉ được xem là thành công sau khi có xác nhận on-chain; yêu cầu ký hoặc transaction hash chưa phải bằng chứng hoàn tất.

### 4.3 Trao đổi và bằng chứng theo từng Issue

Socket.IO cung cấp chat theo phòng gắn với Issue. Tin nhắn được lưu để hai bên có thể xem lại bối cảnh. File đính kèm và bằng chứng khiếu nại là mục tiêu của MVP, nhưng phải dùng vùng lưu trữ riêng tư và kiểm soát quyền truy cập; blockchain chỉ lưu dấu băm cần thiết, không lưu nội dung nhạy cảm.

### 4.4 Khiếu nại có giới hạn quyền lực

Khi một bên mở khiếu nại, các lối giải ngân thông thường bị đóng băng. Người phân xử công bố tỷ lệ phân chia và dấu băm của quyết định. Cơ chế challenge, thời gian chờ và lối thoát khi người phân xử không hành động phải được kiểm thử trước khi triển khai công khai. AI, nếu được sử dụng, chỉ hỗ trợ tổng hợp và đề xuất; AI không ký giao dịch và không tự quyết định việc chuyển tiền.

### 4.5 So sánh định hướng

| Nhóm giải pháp | Ưu điểm | Khoảng trống Bloody-Roar hướng tới |
| --- | --- | --- |
| Marketplace tập trung | Trải nghiệm quen thuộc, có hệ thống tìm việc và hỗ trợ | Quy tắc giữ tiền và phân xử phụ thuộc vào một nhà vận hành |
| Thanh toán trực tiếp | Đơn giản, ít thành phần | Không bảo vệ đồng thời cả hai bên trước khi bàn giao |
| Marketplace dùng blockchain | Dòng tiền có thể kiểm tra on-chain | Thường phức tạp với người dùng và vẫn cần quy trình xử lý chất lượng công việc |
| Bloody-Roar | Kết hợp marketplace, chat và escrow do ví kiểm soát | Phải chứng minh trải nghiệm sử dụng, an toàn smart contract và tính khả thi của cơ chế phân xử |

So sánh này nêu vị trí sản phẩm, không khẳng định ưu thế định lượng khi chưa có nghiên cứu người dùng hoặc dữ liệu vận hành.

## 5. Phạm vi MVP

### 5.1 Trong phạm vi

- đăng nhập bằng ví và duy trì phiên;
- hồ sơ người dùng cơ bản;
- tạo, sửa, hủy, tìm kiếm và xem Issue;
- ứng tuyển, xem ứng viên và chọn lập trình viên;
- chat thời gian thực và xem lại lịch sử theo Issue;
- nạp tiền, bàn giao, giải ngân, hoàn tiền, thỏa thuận dàn xếp và khiếu nại trên Base Sepolia;
- hiển thị trạng thái giao dịch dựa trên sự kiện on-chain đã xác nhận;
- kiểm thử các luồng nghiệp vụ chính và tài liệu chạy dự án.

### 5.2 Ngoài phạm vi MVP cốt lõi

- giao dịch bằng tiền pháp định hoặc triển khai mainnet;
- hệ thống eKYC đầy đủ và ứng dụng di động native;
- tự động giải ngân chỉ vì pull request được merge hoặc AI đưa ra đề xuất;
- lưu mã nguồn riêng tư hay bằng chứng nhạy cảm công khai trên blockchain;
- cam kết về AI đa tác tử, analytics, EAS reputation hoặc bộ công cụ quản trị nâng cao trước khi luồng cốt lõi đạt tiêu chí chấp nhận.

## 6. Mục tiêu, kết quả đo lường và sản phẩm bàn giao

| Mục tiêu | Kết quả có thể kiểm tra |
| --- | --- |
| Hoàn thiện luồng marketplace | Người dùng có thể tạo Issue, ứng tuyển và chọn lập trình viên với kiểm tra quyền phù hợp |
| Hoàn thiện luồng escrow | Các nhánh giải ngân, hoàn tiền, dàn xếp, khiếu nại và timeout vượt qua unit test và test tích hợp đã định nghĩa |
| Bảo đảm quyền kiểm soát ví | Backend không lưu private key và không đánh dấu thành công trước receipt/event đã xác nhận |
| Cung cấp trao đổi theo công việc | Chỉ thành viên hợp lệ truy cập phòng chat; tin nhắn được lưu và tải lại |
| Tạo bản MVP có thể đánh giá | Có hướng dẫn thiết lập, môi trường demo, báo cáo test và danh sách giới hạn còn lại |

Sản phẩm bàn giao dự kiến gồm mã nguồn monorepo, giao diện web, GraphQL API, Socket.IO service, schema và migration PostgreSQL, smart contract cùng bộ test, script deployment có kiểm soát, tài liệu API/thiết lập và báo cáo kiểm thử. Địa chỉ contract hoặc URL production chỉ được công bố khi có bằng chứng triển khai tương ứng.

## 7. Luồng sử dụng đại diện

### 7.1 Tạo Issue và chọn lập trình viên

1. Khách hàng đăng nhập và tạo Issue với mô tả, tiền thưởng, token và thời hạn.
2. Lập trình viên tìm Issue và gửi Application.
3. Khách hàng xem hồ sơ ứng viên và chọn một lập trình viên.
4. Hệ thống chuẩn bị yêu cầu nạp tiền; khách hàng xác nhận bằng ví.
5. Issue chỉ chuyển sang đang thực hiện sau khi sự kiện nạp tiền được xác nhận.

### 7.2 Bàn giao và giải ngân

1. Lập trình viên trao đổi và gửi dấu băm của sản phẩm bàn giao trước hạn.
2. Khách hàng kiểm tra kết quả và chủ động giải ngân nếu chấp nhận.
3. Nếu khách hàng không phản hồi, lối thoát theo thời hạn của contract được áp dụng.
4. Nếu chưa có bàn giao khi quá hạn, khách hàng dùng lối hoàn tiền tương ứng.

### 7.3 Dàn xếp và khiếu nại

1. Hai bên có thể đề xuất và chấp nhận một tỷ lệ dàn xếp.
2. Nếu không thống nhất, một bên mở khiếu nại và cung cấp dấu băm bằng chứng.
3. Người phân xử đưa ra phán quyết trong thời hạn công bố.
4. Bên tham gia có quyền challenge theo quy tắc của contract.
5. Phán quyết hợp lệ được thực thi sau thời gian chờ; contract phải có lối thoát nếu quá trình phân xử đình trệ.

## 8. Yêu cầu sản phẩm

### 8.1 Yêu cầu chức năng

- **FR-01 — Xác thực:** xác minh chữ ký ví, tạo phiên và bảo vệ resolver cần đăng nhập.
- **FR-02 — Hồ sơ:** xem và cập nhật thông tin hồ sơ được cho phép.
- **FR-03 — Marketplace:** tạo, đọc, cập nhật, hủy, lọc, sắp xếp và phân trang Issue.
- **FR-04 — Ứng tuyển:** lập trình viên ứng tuyển; khách hàng xem và chọn ứng viên.
- **FR-05 — Chat:** xác thực kết nối, kiểm tra quyền vào phòng, lưu và phát tin nhắn.
- **FR-06 — Nạp tiền:** ví khách hàng nạp đúng token và số tiền cho escrow duy nhất.
- **FR-07 — Bàn giao:** lập trình viên ghi nhận hoặc cập nhật sản phẩm bàn giao trước hạn.
- **FR-08 — Kết thúc thông thường:** hỗ trợ giải ngân, hoàn tiền quá hạn và nhận tiền sau thời gian xem xét.
- **FR-09 — Dàn xếp:** một bên đề xuất, bên còn lại chấp nhận hoặc bên đề xuất thu hồi đề nghị.
- **FR-10 — Khiếu nại:** ghi nhận bằng chứng, phán quyết, challenge, thực thi và timeout của người phân xử.
- **FR-11 — Đồng bộ:** trạng thái hiển thị ngoài blockchain được dựng lại từ event và có thể đối soát.

### 8.2 Yêu cầu phi chức năng

- **An toàn:** áp dụng kiểm soát truy cập, checks-effects-interactions, chống reentrancy và chuyển token an toàn; không ghi log secret.
- **Nhất quán:** PostgreSQL là mô hình truy vấn, còn trạng thái tiền và escrow lấy blockchain làm căn cứ.
- **Khả năng kiểm thử:** unit test, integration test và E2E test bao phủ các luồng chính và trường hợp lỗi.
- **Khả năng truy cập:** các luồng cốt lõi dùng được bằng bàn phím, có nhãn và trạng thái lỗi rõ ràng.
- **Khả năng vận hành:** có health check, log có cấu trúc, cấu hình qua biến môi trường và quy trình deployment tái lập.
- **Hiệu năng:** danh sách Issue dùng phân trang; thao tác mạng chậm có trạng thái chờ, retry có giới hạn và thông báo dễ hiểu.
- **Riêng tư:** file và bằng chứng không công khai mặc định; chỉ lưu tối thiểu dữ liệu cần thiết on-chain.

## 9. Trạng thái hiện tại và kiến trúc mục tiêu

### 9.1 Bằng chứng đã có trên upstream

Tại mốc audit, repository đã có nền tảng Bun workspace, Prisma/PostgreSQL, Next.js custom server, GraphQL Yoga/Pothos, Socket.IO và Pino. Backend đã có các phần chính của xác thực, marketplace, application và chat. Chi tiết trạng thái theo từng công việc được ghi trong [`PRODUCT_BACKLOG.md`](PRODUCT_BACKLOG.md).

Smart contract trên upstream mới là bộ khung Hardhat/OpenZeppelin và chưa chứng minh vòng đời escrow hoàn chỉnh. Các thay đổi contract phong phú hơn đang được xử lý trong nhánh hoặc pull request riêng nên không được tính là trạng thái upstream của đề xuất này.

### 9.2 Kiến trúc mục tiêu

| Thành phần | Trách nhiệm |
| --- | --- |
| Web frontend | Giao diện marketplace, chat, trạng thái escrow và yêu cầu chữ ký ví |
| GraphQL API | Xác thực, nghiệp vụ off-chain, truy vấn dữ liệu và chuẩn bị tham số giao dịch |
| Socket.IO | Kết nối thời gian thực và kiểm soát phòng chat |
| PostgreSQL/Prisma | Người dùng, Issue, Application, tin nhắn và read model từ blockchain |
| Smart contract escrow | Giữ token và thực thi các chuyển trạng thái liên quan đến tiền |
| Indexer/worker | Đọc event đã đủ xác nhận, xử lý replay/reorg và cập nhật projection |
| Vùng lưu trữ riêng tư | File chat và hồ sơ bằng chứng có kiểm soát truy cập |
| Ví và multisig Safe | Ký giao dịch của người dùng, chủ sở hữu hoặc người phân xử |

### 9.3 Ranh giới tin cậy và invariant thiết yếu

1. Backend và indexer không giữ khóa để hành động thay khách hàng hoặc lập trình viên.
2. Tổng tiền chuyển ra từ một escrow không vượt quá số tiền đã nạp và mỗi escrow chỉ kết thúc một lần.
3. Pause chỉ ngăn escrow mới; tiền đã khóa vẫn phải có lối thoát an toàn.
4. Quyền thực hiện hành động được kiểm tra bằng địa chỉ gọi contract và trạng thái hiện tại.
5. Thay đổi người phân xử hoặc nơi nhận phí không được làm thay đổi trái phép quyền đối với escrow đang tồn tại.
6. Không coi dữ liệu off-chain là bằng chứng thanh toán nếu chưa đối chiếu event on-chain.
7. Token, thời hạn, tỷ lệ và phép làm tròn phải có giới hạn rõ ràng và được kiểm thử ở biên.

## 10. Thuật ngữ sử dụng

| Thuật ngữ | Nghĩa trong dự án |
| --- | --- |
| Issue | Thực thể phần mềm biểu diễn một công việc do khách hàng đăng |
| Application | Đơn ứng tuyển của lập trình viên cho một Issue |
| Escrow | Cơ chế giữ và phân phối tiền theo điều kiện của smart contract |
| Bàn giao | Kết quả công việc do lập trình viên gửi để khách hàng xem xét |
| Dàn xếp | Tỷ lệ phân chia tiền do hai bên tự nguyện chấp nhận |
| Khiếu nại | Trạng thái đóng băng các lối kết thúc thông thường để chờ phân xử |
| Phán quyết | Tỷ lệ phân chia và dấu băm quyết định do người phân xử công bố |
| Projection | Mô hình dữ liệu phục vụ truy vấn, được dựng từ event on-chain |
| Transaction intent | Yêu cầu người dùng ký hoặc gửi giao dịch; chưa phải kết quả on-chain |
| Invariant | Điều kiện luôn phải đúng trong mọi chuyển trạng thái hợp lệ |

## 11. Phương pháp thực hiện và kế hoạch 10 tuần

Nhóm áp dụng Scrum theo sprint hai tuần. Product Backlog là nguồn theo dõi phạm vi và trạng thái; mỗi mục chỉ được chuyển sang Done khi toàn bộ tiêu chí chấp nhận có bằng chứng ở mốc audit tương ứng.

| Giai đoạn | Trọng tâm | Kết quả đánh giá |
| --- | --- | --- |
| Sprint 0 | Nền tảng kỹ thuật và thiết kế | Workspace, database, server, quy ước mã nguồn và khung contract |
| Sprint 1 | Xác thực và marketplace | Đăng nhập, hồ sơ, Issue, Application và chat backend cơ bản |
| Sprint 2 | Escrow và luồng giao tiếp | Vòng đời contract, tích hợp ví, chat/file và các test trọng yếu |
| Sprint 3 | Khiếu nại và kiểm thử liên luồng | Phân xử, đồng bộ event, E2E cho luồng người dùng chính |
| Sprint 4 | Ổn định và bàn giao | Sửa lỗi, bảo mật, accessibility, deployment, tài liệu và demo |

Mỗi sprint gồm lập kế hoạch, cập nhật hằng ngày, review và retrospective. Pull request cần mô tả phạm vi, bằng chứng test và giới hạn còn lại; thay đổi liên quan đến tiền phải có review chéo.

## 12. Phân công trách nhiệm

| Thành viên | Trách nhiệm chính dự kiến |
| --- | --- |
| Kiên | Smart contract, kiểm thử bảo mật và hỗ trợ tích hợp escrow |
| Khôi | Kiến trúc backend, hạ tầng ứng dụng, AI thử nghiệm và điều phối kỹ thuật |
| Hiếu | GraphQL, Prisma, xác thực, marketplace và tích hợp backend |
| Hân | UX/UI, kịch bản E2E, accessibility và kiểm thử nghiệm thu |
| Trâm | Triển khai frontend, component, form và unit/integration test giao diện |

Phân công có thể thay đổi theo năng lực và tiến độ; quyền sở hữu một hạng mục không thay thế yêu cầu review và tiêu chí chấp nhận.

## 13. Nguồn lực, giả định và ràng buộc

- Nhóm có năm thành viên và thời gian học phần 10 tuần.
- Base Sepolia được dùng làm môi trường blockchain thử nghiệm; chưa có quyết định triển khai mainnet.
- Dự án ưu tiên công cụ mã nguồn mở và gói miễn phí, nhưng không cam kết chi phí bằng 0.
- Phí RPC, lưu trữ, database, hosting, tên miền và dịch vụ AI cần được xác nhận trước deployment.
- Token thử nghiệm, địa chỉ contract, multisig Safe và thông tin người hướng dẫn chỉ được ghi khi có nguồn xác thực.
- Tiến độ phụ thuộc vào khả năng truy cập ví thử nghiệm, RPC, dịch vụ lưu trữ và môi trường database.

## 14. Rủi ro và biện pháp giảm thiểu

| Rủi ro | Mức ảnh hưởng | Biện pháp |
| --- | --- | --- |
| Lỗi smart contract làm khóa hoặc phân phối sai tiền | Rất cao | Giới hạn mạng thử nghiệm; unit/fuzz/invariant test; review độc lập; kiểm tra deployment và tham số |
| Backend hiển thị trạng thái khác blockchain | Cao | Dựng projection từ event; chờ đủ xác nhận; hỗ trợ replay và đối soát |
| Mất hoặc lộ khóa | Rất cao | Không giữ private key người dùng; dùng secret manager; multisig cho vai trò quản trị |
| Người phân xử không phản hồi hoặc lạm quyền | Cao | Giới hạn quyền, thời hạn rõ ràng, challenge và lối thoát khi đình trệ |
| Bằng chứng hoặc file chat bị lộ | Cao | Lưu trữ riêng tư, URL ngắn hạn, kiểm tra quyền và chính sách lưu giữ |
| Phạm vi AI làm trễ MVP | Trung bình | Đặt AI sau luồng cốt lõi; cho phép cắt khỏi MVP mà không ảnh hưởng thanh toán |
| Tiêu chí hoàn thành không rõ | Cao | Gắn acceptance criteria vào từng backlog item và review trước khi triển khai |
| Dịch vụ miễn phí thay đổi giới hạn | Trung bình | Tách lớp tích hợp, cấu hình provider và chuẩn bị phương án thay thế |

## 15. Tiêu chí chấp nhận dự án

MVP được xem là sẵn sàng để đánh giá khi:

- các luồng tạo Issue, ứng tuyển, chọn lập trình viên, chat, nạp tiền và kết thúc escrow chạy được trên môi trường demo;
- quyền truy cập sai bị từ chối ở API, Socket.IO và smart contract;
- mọi nhánh chuyển tiền có test thành công, bao gồm các trường hợp timeout và khiếu nại;
- giao diện phân biệt rõ trạng thái đang chờ ký, đã gửi, đang xác nhận, thành công và thất bại;
- không có secret trong repository và không có backend key có thể ký thay người dùng;
- tài liệu thiết lập cho phép một người đánh giá tái tạo môi trường;
- báo cáo cuối kỳ nêu rõ phần đã làm, phần chưa làm và bằng chứng tương ứng;
- mọi tuyên bố deployment có URL hoặc địa chỉ, mạng, transaction/receipt và liên kết kiểm chứng.

## 16. Kết luận

Bloody-Roar đề xuất một marketplace trong đó quy trình tìm người thực hiện vẫn quen thuộc, nhưng việc giữ và phân phối tiền tuân theo smart contract có thể kiểm tra. Giá trị của dự án không nằm ở việc đưa mọi dữ liệu lên blockchain hoặc tự động hóa mọi quyết định bằng AI, mà ở việc xác định đúng ranh giới: ví người dùng kiểm soát giao dịch, contract kiểm soát tiền, backend điều phối trải nghiệm và dữ liệu off-chain, còn người phân xử chịu trách nhiệm cho quyết định cần đánh giá bằng chứng.

Phạm vi MVP đủ để chứng minh ý tưởng nếu nhóm ưu tiên luồng cốt lõi, kiểm thử vòng đời escrow và trình bày trung thực trạng thái triển khai. Product Backlog đi kèm là căn cứ để theo dõi tiến độ theo bằng chứng thay vì theo kế hoạch hoặc tuyên bố chưa được kiểm chứng.

## 17. Tài liệu tham khảo

1. [Repository Bloody-Roar tại mốc audit](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328)
2. [OpenZeppelin Contracts v5](https://docs.openzeppelin.com/contracts/5.x/)
3. [Solidity documentation](https://docs.soliditylang.org/)
4. [Base Sepolia network information](https://docs.base.org/network-information/)
5. [GraphQL specification](https://spec.graphql.org/)
6. [Socket.IO documentation](https://socket.io/docs/v4/)
7. [Prisma documentation](https://www.prisma.io/docs)
8. [OWASP Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/)
