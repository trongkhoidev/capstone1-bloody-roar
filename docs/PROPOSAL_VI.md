# BLOODY-ROAR — DECENTRALIZED BOUNTY MARKETPLACE

## Đề xuất nền tảng bounty marketplace với on-chain Escrow

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
| MVP chain | Base Sepolia |
| Settlement token | Một ERC-20 tương thích USDC, chính xác 6 decimals |
| Contract address | Chưa deployment; tài liệu không công bố địa chỉ |

> **Trạng thái tài liệu.** Đây là đề xuất sản phẩm độc lập bằng tiếng Việt; các phần mô tả architecture và contract flow tuân theo `Bloody_Roar_Proposal_Revised.docx`. Các nhận định về phần mềm đã có trên upstream được đối chiếu với nhánh `main` tại commit [`33aed2e1028d9fd89bb6d62b47a3df65ea1cb328`](https://github.com/trongkhoidev/capstone1-bloody-roar/commit/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328). Solidity Escrow và deployment tooling của revision được triển khai và test ở local branch riêng; chúng chưa có trên upstream và chưa được deployment lên Base Sepolia. Backend integration, database Projection, Indexer, cloud deployment, monitoring và public-chain deployment được mô tả như **Target — not implemented** trừ khi có bằng chứng repository riêng.

> **Quy ước thuật ngữ.** Các domain và engineering terms giữ nguyên bằng tiếng Anh, gồm `Client`, `Developer`, `Issue`, `Application`, `Funding Reservation`, `Escrow`, `Transaction Intent`, `Chain Event`, `Projection`, `Submission`, `Settlement`, `Dispute`, `Ruling`, `state machine`, `invariant`, `frontend`, `backend`, `Indexer`, `deployment` và `multisig Safe`. Phần diễn giải còn lại dùng tiếng Việt tự nhiên.

## 1. Tóm tắt đề xuất

Bloody-Roar là nền tảng kết nối `Client` có nhu cầu phát triển phần mềm với `Developer` phù hợp. `Client` đăng một `Issue`, `Developer` gửi `Application`, `Client` chọn người thực hiện và theo dõi `Submission`. Điểm khác biệt của sản phẩm là tiền thưởng được giữ bằng smart contract `Escrow` thay vì do nền tảng trực tiếp nắm giữ.

Sản phẩm hướng đến ba giá trị chính:

1. giảm rủi ro `Client` trả tiền nhưng không nhận được kết quả;
2. giảm rủi ro `Developer` hoàn thành công việc nhưng không được thanh toán;
3. tạo lịch sử trao đổi và trạng thái công việc có thể kiểm tra khi phát sinh bất đồng.

MVP tập trung vào marketplace, xác thực bằng ví, `Application` và lựa chọn `Developer`, chat theo từng `Issue`, `Escrow` trên Base Sepolia và quy trình `Dispute` do `Arbiter Safe` xử lý. Các chức năng AI, GitHub integration, phân tích nâng cao và chứng thực danh tiếng chỉ được đưa vào khi những luồng cốt lõi đã ổn định và có đủ thời gian kiểm chứng.

## 2. Bối cảnh và vấn đề

Trong giao dịch freelance, hai bên thường phải chấp nhận một trong hai rủi ro: `Client` trả trước và phụ thuộc vào người thực hiện, hoặc `Developer` gửi `Submission` trước và phụ thuộc vào thiện chí thanh toán. Các nền tảng tập trung giảm rủi ro bằng cách giữ tiền và xử lý `Dispute`, nhưng người dùng phải tin vào chính sách, khả năng vận hành và quyết định của nền tảng.

Đối với các nhóm nhỏ hoặc giao dịch xuyên biên giới, vấn đề còn rõ hơn:

- điều khoản hoàn thành thường thiếu tiêu chí đo được;
- tiến độ, trao đổi và bằng chứng nằm rải rác ở nhiều công cụ;
- trạng thái thanh toán khó kiểm chứng độc lập;
- `Dispute` process thiếu deadline và exit rõ ràng;
- chi phí trung gian có thể không phù hợp với công việc giá trị nhỏ.

Bloody-Roar không đặt mục tiêu loại bỏ mọi yếu tố tin cậy. Sản phẩm chuyển việc giữ và phân phối tiền sang smart contract, đồng thời công khai các rules về deadline, release, refund và `Ruling`. Những phần còn phụ thuộc vào con người, như đánh giá chất lượng sản phẩm hoặc review evidence, được mô tả rõ thay vì gắn nhãn “trustless”.

## 3. Người dùng và nhu cầu

| Nhóm liên quan | Nhu cầu chính |
| --- | --- |
| `Client` | Đăng yêu cầu rõ ràng, chọn `Developer`, bảo toàn tiền trước khi có kết quả, gọi `releaseFunds` hoặc mở `Dispute` theo quy tắc xác định |
| `Developer` | Tìm `Issue` phù hợp, gửi `Application`, trao đổi, gửi `Submission` và nhận tiền mà không phụ thuộc hoàn toàn vào quyết định đơn phương của `Client` |
| `Arbiter Safe` | Tiếp cận evidence manifest, đăng initial/final `Ruling` trong phạm vi quyền hạn đã công bố; không có quyền deposit, release hoặc `Settlement` thay hai bên |
| `Owner Safe` | Pause deposit mới và thực hiện two-step rotation cho arbiter hoặc fee recipient; không có arbitrary withdrawal |
| Platform operator | Vận hành marketplace và xử lý sự cố nhưng không có authority đối với participant funds hoặc `Ruling` |
| Nhóm phát triển | Có phạm vi MVP, tiêu chí chấp nhận, trạng thái triển khai và trách nhiệm kỹ thuật minh bạch |

## 4. Giải pháp đề xuất và giá trị khác biệt

### 4.1 Marketplace theo vòng đời công việc

`Client` tạo `Issue` với mô tả, lĩnh vực, tiền thưởng và thời hạn. `Developer` tìm kiếm, lọc và gửi `Application`. `Client` xem ứng viên rồi chọn một `Developer`. Mỗi thay đổi trạng thái phải có điều kiện authority rõ ràng; ví dụ, chỉ chủ `Issue` được sửa hoặc hủy trước khi đã chọn `Developer`.

### 4.2 Escrow do ví người dùng kiểm soát

Khi hai bên thống nhất, `Client` dùng ví để deposit token vào smart contract. Backend có thể validate input và trả về `{ contractAddress, method, typedArgs }` cùng intent expiry, nhưng không giữ khóa, không broadcast participant transaction và không ký thay người dùng. `Transaction Intent` hoặc transaction hash chưa phải bằng chứng hoàn tất; chỉ receipt và canonical `Chain Event` mới cho phép `Projection` chuyển sang trạng thái confirmed.

### 4.3 Trao đổi và bằng chứng theo từng Issue

Socket.IO cung cấp chat theo room gắn với `Issue`. Tin nhắn được lưu để hai bên có thể xem lại bối cảnh. File đính kèm và `Dispute` evidence phải dùng private storage và access control; blockchain chỉ lưu deterministic `bytes32` digest, không lưu nội dung nhạy cảm.

### 4.4 Dispute với authority được giới hạn

Khi một bên mở `Dispute`, các exit thông thường bị đóng băng. `Arbiter Safe` đăng initial `Ruling` gồm payout ratio và decision hash. Một challenge hợp lệ trong notice window yêu cầu final `Ruling`; nếu arbiter không hành động sau challenge, contract phải cung cấp permissionless timeout exit. AI, nếu được sử dụng, chỉ hỗ trợ tổng hợp và đề xuất; AI không ký transaction và không quyết định việc chuyển tiền.

### 4.5 So sánh định hướng

| Nhóm giải pháp | Ưu điểm | Khoảng trống Bloody-Roar hướng tới |
| --- | --- | --- |
| Marketplace tập trung | Trải nghiệm quen thuộc, có hệ thống tìm việc và hỗ trợ | Quy tắc giữ tiền và phân xử phụ thuộc vào một nhà vận hành |
| Thanh toán trực tiếp | Đơn giản, ít thành phần | Không bảo vệ đồng thời cả hai bên trước `Submission` |
| Marketplace dùng blockchain | Dòng tiền có thể kiểm tra on-chain | Thường phức tạp với người dùng và vẫn cần quy trình xử lý chất lượng công việc |
| Bloody-Roar | Kết hợp marketplace, chat và escrow do ví kiểm soát | Phải chứng minh trải nghiệm sử dụng, an toàn smart contract và tính khả thi của cơ chế phân xử |

So sánh này nêu vị trí sản phẩm, không khẳng định ưu thế định lượng khi chưa có nghiên cứu người dùng hoặc dữ liệu vận hành.

## 5. Phạm vi MVP

### 5.1 Trong phạm vi

- đăng nhập bằng ví và duy trì phiên;
- hồ sơ người dùng cơ bản;
- tạo, sửa, hủy, tìm kiếm và xem Issue;
- gửi `Application`, xem ứng viên và chọn `Developer`;
- chat thời gian thực và xem lại lịch sử theo Issue;
- deposit, `Submission`, release, refund, `Settlement` và `Dispute` trên Base Sepolia;
- hiển thị trạng thái transaction dựa trên canonical `Chain Event` đã xác nhận;
- kiểm thử các luồng nghiệp vụ chính và tài liệu chạy dự án.

### 5.2 Ngoài phạm vi MVP cốt lõi

- giao dịch bằng tiền pháp định hoặc triển khai mainnet;
- hệ thống eKYC đầy đủ và ứng dụng di động native;
- auto-release chỉ vì pull request được merge hoặc AI đưa ra đề xuất;
- lưu mã nguồn riêng tư hay bằng chứng nhạy cảm công khai trên blockchain;
- cam kết về AI đa tác tử, analytics, EAS reputation hoặc bộ công cụ quản trị nâng cao trước khi luồng cốt lõi đạt tiêu chí chấp nhận.

## 6. Mục tiêu, kết quả đo lường và sản phẩm bàn giao

| Mục tiêu | Kết quả có thể kiểm tra |
| --- | --- |
| Hoàn thiện marketplace flow | Người dùng có thể tạo `Issue`, gửi `Application` và chọn `Developer` với access-control phù hợp |
| Hoàn thiện `Escrow` flow | Các nhánh release, refund, `Settlement`, `Dispute`, `Ruling` và timeout vượt qua unit test và integration test đã định nghĩa |
| Bảo đảm wallet authority | Backend không lưu private key và không đánh dấu thành công trước receipt/canonical `Chain Event` |
| Cung cấp trao đổi theo công việc | Chỉ thành viên hợp lệ truy cập phòng chat; tin nhắn được lưu và tải lại |
| Tạo bản MVP có thể đánh giá | Có hướng dẫn thiết lập, môi trường demo, báo cáo test và danh sách giới hạn còn lại |

Sản phẩm bàn giao dự kiến gồm mã nguồn monorepo, giao diện web, GraphQL API, Socket.IO service, schema và migration PostgreSQL, smart contract cùng bộ test, script deployment có kiểm soát, tài liệu API/thiết lập và báo cáo kiểm thử. Địa chỉ contract hoặc URL production chỉ được công bố khi có bằng chứng triển khai tương ứng.

## 7. Numbered lifecycle use cases

### UC-01 — Selection and wallet deposit

1. `Client` tạo `Issue`; trước khi trả funding calldata, backend phải validate một EIP-712 listing intent còn hạn và khớp signer, token, amount, terms hash, `Developer` và delivery deadline hiện tại.
2. `Developer` tìm `Issue` và gửi `Application`.
3. Khi `Client` chọn một `Developer`, backend tạo `Funding Reservation` ở trạng thái `AWAITING_FUNDING` trong 24 giờ; các `Application` khác vẫn được giữ nguyên.
4. Backend trả contract address, ABI method và typed arguments; `Client` tự xác nhận transaction bằng ví.
5. Chỉ canonical `Deposited` event mới chuyển `Issue` sang `IN_PROGRESS` và finalize selection. Reservation hết hạn sẽ mở lại `Issue`.

### UC-02 — Submission, Client release, and review timeout

1. `Developer` gọi `submitWork` và có thể thay thế delivery hash đến hết delivery deadline.
2. Sau `Submission` đầu tiên, `Client` có thể gọi `releaseFunds` cho phiên bản mới nhất; release áp dụng platform fee 2,5%.
3. Nếu `Client` không phản hồi, `Developer` có thể gọi `claimReviewTimeout` sau mốc cố định `deliveryDeadline + 7 days` và nhận toàn bộ amount.
4. `Submission` ở phút cuối không được dời review deadline vì deadline này luôn tính từ delivery deadline ban đầu.

### UC-03 — Missed delivery

Nếu không có `Submission` sau delivery deadline, `Client` gọi `claimMissedDeliveryRefund` để nhận full refund. Exit này fee-free và độc lập với review timeout vì chưa có work được submit.

### UC-04 — Mutual Settlement

Một participant có thể gọi `proposeSettlement` với Client payout ratio từ 0 đến 10.000 basis points. Chỉ counterparty được accept; proposer có thể revoke. Khi accept, contract phân phối đúng ratio, không thu platform fee. `Settlement` khả dụng trong mọi non-terminal phase, kể cả `Dispute` và ruling-notice phase.

### UC-05 — Dispute, challenge, and arbiter timeout

1. Một participant mở `Dispute` với evidence-manifest hash; participant còn lại có thể submit manifest của mình.
2. `Arbiter Safe` đăng initial `Ruling` gồm Client payout ratio và decision hash, bắt đầu notice window 24 giờ.
3. Mỗi `Escrow` chỉ cho phép một challenge trong notice window đầu tiên. Sau challenge, `Arbiter Safe` phải đăng final `Ruling`, bắt đầu notice window thứ hai 24 giờ và không thể challenge tiếp.
4. Bất kỳ địa chỉ nào cũng có thể execute một `Ruling` đã đủ notice period.
5. Nếu không có final `Ruling` trong 30 ngày sau challenge, một participant có thể gọi arbiter-timeout exit để thực hiện split 50/50, fee-free.

## 8. Yêu cầu sản phẩm

### 8.1 Yêu cầu chức năng

- **FR-01 — Authentication:** xác minh chữ ký ví, tạo session và bảo vệ resolver cần đăng nhập.
- **FR-02 — Profile:** xem và cập nhật profile fields được cho phép.
- **FR-03 — Marketplace:** tạo, đọc, cập nhật, hủy, filter, sort và paginate `Issue`.
- **FR-04 — Application:** `Developer` gửi `Application`; `Client` xem và chọn ứng viên.
- **FR-05 — Chat:** authenticate connection, kiểm tra room membership, persist và broadcast message.
- **FR-06 — Deposit:** ví `Client` gọi `deposit(escrowId, developer, amount, deliveryDeadline, termsHash)` với đúng token, amount và deadline tương lai.
- **FR-07 — Submission:** `Developer` gọi `submitWork` để ghi nhận hoặc cập nhật delivery hash trước deadline.
- **FR-08 — Normal exits:** hỗ trợ `releaseFunds`, `claimMissedDeliveryRefund` và `claimReviewTimeout` theo đúng timing rules.
- **FR-09 — Settlement:** một participant gọi `proposeSettlement`; counterparty accept hoặc proposer revoke.
- **FR-10 — Dispute:** hỗ trợ evidence hashes, initial/final `Ruling`, một challenge, notice periods, execution và arbiter timeout.
- **FR-11 — Projection:** trạng thái hiển thị ngoài blockchain được dựng lại từ canonical `Chain Event`, có checkpoint, replay và reorg recovery.

### 8.2 Yêu cầu phi chức năng

- **An toàn:** áp dụng kiểm soát truy cập, checks-effects-interactions, chống reentrancy và chuyển token an toàn; không ghi log secret.
- **Nhất quán:** PostgreSQL là query `Projection`; blockchain là authority cho funds và `Escrow` lifecycle.
- **Numeric safety:** token values, ratios và deadlines dùng integer hoặc decimal string; không dùng JavaScript floating-point.
- **Khả năng kiểm thử:** unit test, integration test, fuzz/invariant test và E2E test bao phủ các flow chính và failure case.
- **Khả năng truy cập:** các luồng cốt lõi dùng được bằng bàn phím, có nhãn và trạng thái lỗi rõ ràng.
- **Khả năng vận hành:** có health check, structured log, environment configuration và reproducible deployment process.
- **Hiệu năng:** danh sách `Issue` dùng pagination; thao tác mạng chậm có pending state, bounded retry và thông báo dễ hiểu.
- **Riêng tư:** file và bằng chứng không công khai mặc định; chỉ lưu tối thiểu dữ liệu cần thiết on-chain.
- **Realtime safety:** Socket.IO chỉ phát `{ escrowId, projectionVersion }` để invalidate cache; Client phải refetch canonical GraphQL state. Mất socket message chỉ ảnh hưởng freshness, không ảnh hưởng funds hoặc lifecycle correctness.

## 9. Trạng thái hiện tại và kiến trúc mục tiêu

### 9.1 Evidence baseline và implementation status

Tại mốc audit, repository đã có nền tảng Bun workspace, Prisma/PostgreSQL, Next.js custom server, GraphQL Yoga/Pothos, Socket.IO và Pino. Backend đã có các phần chính của xác thực, marketplace, application và chat. Chi tiết trạng thái theo từng công việc được ghi trong [`PRODUCT_BACKLOG.md`](PRODUCT_BACKLOG.md).

Smart contract trên upstream mới là bộ khung Hardhat/OpenZeppelin và chưa chứng minh `Escrow` lifecycle hoàn chỉnh. Revision trong local branch riêng triển khai non-upgradeable Solidity singleton và deployment/test tooling; trạng thái này là **Implemented locally — not on upstream**, không phải bằng chứng merged hoặc public deployment.

Tài liệu dùng ba status labels:

| Status | Ý nghĩa |
| --- | --- |
| **Implemented** | Có bằng chứng bằng source, test, deployment tooling hoặc repository artifact tại baseline được nêu rõ |
| **Target — not implemented** | Architecture bắt buộc trong tương lai nhưng chưa có bằng chứng implementation ở baseline |
| **Deferred** | Nằm ngoài MVP và không được ngầm hiểu là một phần của target hiện tại |

### 9.2 Component inventory

| Component | Responsibility / trust boundary | Status |
| --- | --- | --- |
| `BloodyRoarEscrow` | Giữ token; authority cho on-chain funds và phase | **Implemented locally — not on upstream** |
| Wallet / Safe | Ký participant hoặc governance transaction; keys ở lại với user/Safe | **Target** |
| Web frontend | Marketplace, chat, `Escrow` state và wallet-signing request | **Target** |
| GraphQL API | Validate input, trả typed calldata, query `Projection`; không đánh dấu transaction success | **Target** |
| Socket.IO | Projection invalidation và chat realtime; không phải state authority | **Target** |
| Indexer worker | Đọc safe logs, decode, replay, reconcile; không có payout authority | **Target** |
| PostgreSQL/Prisma | User, `Issue`, `Application`, message, append-only `ChainEvent` và query `Projection` | **Target** |
| Supabase Storage | Private evidence manifest/file; không dùng public bucket | **Target** |
| Railway web service | Next.js, GraphQL và Socket.IO tại stateless boundary | **Target** |
| Railway worker | Indexing, retry, checkpoint và reconciliation | **Target** |
| Alchemy Base Sepolia RPC | Safe-head read; provider không phải state authority | **Target** |

Trong bảng này, **Target** đánh giá capability tích hợp với `Escrow` theo revised architecture, không phủ nhận rằng repository đã có skeleton hoặc một phần backend capability ở upstream baseline.

### 9.3 Ranh giới tin cậy và invariant thiết yếu

Contract `state machine` bắt đầu ở `FUNDED`. Phase này cho phép delivery revision, Client release, missed-delivery refund sau deadline, Developer review-timeout claim sau `deliveryDeadline + 7 days`, mutual `Settlement` hoặc `Dispute`. `DISPUTED` dẫn đến initial-ruling notice; một challenge chuyển `Escrow` sang `CHALLENGED`, nơi `Arbiter Safe` phải đăng final `Ruling` hoặc participant dùng 30-day 50/50 fallback. Mọi terminal phase reject exit lần hai.

Contract controls của revision gồm `SafeERC20`, checks-effects-interactions, `ReentrancyGuard`, explicit custom errors và exact balance-delta check. Contract không upgrade và không có arbitrary withdrawal; `Owner Safe` chỉ pause deposit mới hoặc khởi tạo two-step role rotation.

1. Participant authority đến từ `msg.sender`; backend, Indexer, authentication và deployment credentials không thể impersonate `Client`, `Developer` hoặc `Arbiter Safe`.
2. Tổng transfer từ một `Escrow` bằng đúng deposit amount; không terminal transition nào được execute hai lần.
3. Refund, timeout, `Settlement`, `Ruling` và arbiter-stall exits là fee-free; các path này không gọi fee recipient.
4. Review deadline cố định tại `deliveryDeadline + 7 days`; last-minute `Submission` không dời deadline.
5. Pause chỉ chặn `deposit`; mọi funded exit vẫn phải khả dụng khi paused.
6. Receipt chưa có safe-head canonical `Chain Event` vẫn là pending; off-chain data không phải payment authority.
7. Exact received-balance delta phải reject fee-on-transfer token thay vì tạo underfunded `Escrow`.
8. Token address, yêu cầu 6 decimals, fee rate, review/challenge/stall periods là immutable contract rules của revision.

### 9.4 Backend boundary — Target, not implemented

- User wallet submit participant transaction; `Arbiter Safe` submit arbiter action.
- GraphQL validate input và trả `{ contractAddress, method, typedArgs }` cùng intent expiry. GraphQL không broadcast participant transaction và không đánh dấu `Escrow` thành công chỉ vì transaction đã submit.
- Trước khi trả funding calldata, backend phải verify EIP-712 listing intent còn hạn và khớp signer, token, amount, terms hash, `Developer` và delivery deadline hiện tại. Material edit yêu cầu signature mới.
- Web `ADMIN` authorization tách biệt hoàn toàn với `Owner Safe` và `Arbiter Safe` authority.
- MVP không có oracle/relayer và không có GitHub-merge auto-payment. GitHub webhook hoặc AI recommendation có thể là evidence cho user nhưng không được gọi `releaseFunds` hoặc thay đổi `Escrow` outcome.

### 9.5 Database và Indexer — Target, not implemented

`ChainEvent` là append-only record với unique identity `(chainId, contractAddress, txHash, logIndex)`. Record lưu block number/hash, transaction index, decoded event/payload, escrow key, canonical status, safe-head finality, first-seen time và last reconciliation time. Reorged event được giữ lại cho audit nhưng đánh dấu non-canonical, không bị xóa.

`ProjectionCheckpoint` dùng key `(chainId, contractAddress)` và lưu last scanned block, last safe block, last canonical block hash, decoder version cùng replay status. `EscrowProjection` lưu participant addresses, raw integer token amount, delivery/review deadlines, hashes, phase, outcome, payout/refund/fee totals, finality, projection version và last projected block. Initial và final arbiter proposal phải là historical records riêng; overwrite initial ratio sẽ làm mất challenge history.

Indexer chỉ fold logs đến RPC provider `safe` head vào authoritative `Projection`. Event processing phải ordered theo block number, transaction index và log index; idempotent theo `ChainEvent` identity; replayable từ checkpoint; và reorg-aware qua block-hash comparison. `TransactionIntent` chỉ theo dõi pending wallet submission, không được dùng làm confirmation.

Private `Dispute` evidence đặt trong private Supabase Storage bucket. On-chain digest là `keccak256` của UTF-8 RFC 8785 canonical JSON; manifest entries có content hash, MIME metadata và deterministic ordering. Signed URL phải scoped và expiring, không phải on-chain authority.

### 9.6 Cloud và operations — Target, not implemented

Target topology gồm một single-replica Railway web service cho Next.js, GraphQL và Socket.IO; một Railway worker riêng cho indexing, retry, checkpoint và reconciliation; Supabase PostgreSQL; private Supabase Storage; và Alchemy Base Sepolia RPC. Redis, horizontal web scaling và Socket.IO Redis adapter là **Deferred**.

- Web health check xác minh process liveness và database connectivity, không tuyên bố chain success.
- Worker health check expose last safe head, checkpoint age, RPC latency, retry queue size và projection lag.
- Structured log có chain ID, contract address, escrow ID, event identity, projection version và correlation ID; không log private evidence hoặc secret.
- RPC outage phải giữ checkpoint, retry với bounded backoff và catch up từ safe head khi service trở lại.
- Deployment rollback quay web/worker image về known artifact trước đó. Contract không upgrade; contract mới cần migration decision riêng.
- Base Sepolia deployment cần explicit environment guard và địa chỉ token, `Owner Safe`, `Arbiter Safe`, fee recipient. Public deployment chỉ hợp lệ khi có reproducible constructor arguments, chain ID, transaction hash và verified contract address.

## 10. Thuật ngữ sử dụng

| Thuật ngữ | Nghĩa trong dự án |
| --- | --- |
| `Client` | Wallet owner tạo `Issue`, fund `Escrow`, approve `Submission`, mở `Dispute`, đề xuất/chấp nhận `Settlement` hoặc claim missed-delivery refund |
| `Developer` | Wallet owner được chỉ định trong `deposit`; gửi `Submission`, evidence, `Settlement` và claim review timeout |
| `Issue` | Client work, terms, deadline và `Application`; thuộc marketplace read model |
| `Application` | Developer application cho một `Issue` |
| `Funding Reservation` | Selection hold 24 giờ trước funding; thuộc off-chain marketplace service |
| `Escrow` | On-chain funds và lifecycle của một cặp `Client`/`Developer` |
| `Transaction Intent` | Pending wallet request hoặc signed off-chain intent; không authoritative trước receipt |
| `Chain Event` | Contract log có identity theo chain, address, transaction và log index |
| `Projection` | Query model được fold từ canonical `Chain Event`; không phải funds authority |
| `Submission` | Developer delivery hash, có thể thay thế đến delivery deadline |
| `Settlement` | Fee-free payout ratio do proposer đưa ra và counterparty accept |
| `Dispute` | Frozen phase chứa evidence-manifest hashes |
| `Ruling` | Arbiter Safe payout ratio và decision hash |
| `Invariant` | Điều kiện luôn đúng trong mọi valid state transition |

## 11. Phương pháp thực hiện và kế hoạch 10 tuần

Nhóm áp dụng Scrum theo sprint hai tuần. Product Backlog là nguồn theo dõi phạm vi và trạng thái; mỗi mục chỉ được chuyển sang Done khi toàn bộ tiêu chí chấp nhận có bằng chứng ở mốc audit tương ứng.

| Giai đoạn | Trọng tâm | Kết quả đánh giá |
| --- | --- | --- |
| Sprint 0 | Nền tảng kỹ thuật và thiết kế | Workspace, database, server, quy ước mã nguồn và khung contract |
| Sprint 1 | Xác thực và marketplace | Đăng nhập, hồ sơ, Issue, Application và chat backend cơ bản |
| Sprint 2 | Escrow và luồng giao tiếp | Vòng đời contract, tích hợp ví, chat/file và các test trọng yếu |
| Sprint 3 | `Dispute` và cross-flow testing | `Ruling`, event sync, E2E cho user flow chính |
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
| Lỗi smart contract làm khóa hoặc phân phối sai tiền | Rất cao | Non-upgradeable code; unit/fuzz/invariant test; coverage; static analysis; review độc lập; authorized deployment |
| Participant ký stale terms | Cao | Bind amount, token, deadline, `Developer` và terms hash vào EIP-712 intent còn hạn |
| Backend hiển thị trạng thái khác blockchain | Cao | Dựng `Projection` từ safe-head `Chain Event`; block-hash comparison; canonical flag; replay checkpoint |
| Mất hoặc lộ khóa | Rất cao | Không giữ private key người dùng; dùng secret manager; multisig cho vai trò quản trị |
| `Arbiter Safe` không phản hồi hoặc lạm quyền | Cao | Giới hạn authority; một challenge; final notice; 30-day fee-free 50/50 exit |
| Evidence hoặc file chat bị lộ | Cao | Private Storage bucket, expiring URL, access control; chỉ content hash được đưa on-chain |
| Phạm vi AI làm trễ MVP | Trung bình | Đặt AI sau luồng cốt lõi; cho phép cắt khỏi MVP mà không ảnh hưởng thanh toán |
| Tiêu chí hoàn thành không rõ | Cao | Gắn acceptance criteria vào từng backlog item và review trước khi triển khai |
| Dịch vụ miễn phí thay đổi giới hạn | Trung bình | Tách lớp tích hợp, cấu hình provider và chuẩn bị phương án thay thế |

## 15. Tiêu chí chấp nhận dự án

MVP được xem là sẵn sàng để đánh giá khi:

- các flow tạo `Issue`, gửi `Application`, chọn `Developer`, chat, deposit và terminal `Escrow` chạy được trên môi trường demo;
- unauthorized access bị reject ở API, Socket.IO và smart contract;
- contract suite test deployment roles, token decimals, duplicate IDs, authorization, allowance/balance failures, future deadlines, fee-on-transfer rejection, revision cutoff, latest-hash release, fee accounting, missed-delivery refund, fixed review timeout, arbitrary `Settlement` ratios, `Settlement` trong `Dispute`, `Ruling` paths, một challenge, final notice, arbiter stall, pause semantics và two-step governance;
- CI gate chạy compile, unit test, fuzz/invariant test, coverage, static analysis và deployment-script dry run; các invariant bắt buộc gồm total outflow không vượt deposit, không repeated terminal exit, không unauthorized role action và fee-free exit không trả fee recipient;
- frontend phân biệt rõ waiting-for-signature, submitted, pending-safe-head, confirmed và failed;
- không có secret trong repository và không có backend key có thể ký thay người dùng;
- tài liệu thiết lập cho phép một người đánh giá tái tạo môi trường;
- báo cáo cuối kỳ nêu rõ phần đã làm, phần chưa làm và bằng chứng tương ứng;
- mọi tuyên bố deployment có reproducible address, constructor arguments, chain ID, transaction hash và verification link;
- Markdown và DOCX dùng cùng lifecycle names, events, fee, ratio và deadline như Solidity API; current implementation và target architecture luôn được label riêng;
- final DOCX có cover page, table of contents, heading/table/caption nhất quán và đã được kiểm tra clipped diagram, broken table, missing glyph cùng pagination lỗi.

## 16. Kết luận

Bloody-Roar đề xuất một marketplace trong đó quy trình tìm `Developer` vẫn quen thuộc, nhưng việc giữ và phân phối tiền tuân theo smart contract có thể kiểm tra. Giá trị của dự án không nằm ở việc đưa mọi dữ liệu lên blockchain hoặc tự động hóa mọi quyết định bằng AI, mà ở việc xác định đúng ranh giới: user wallet kiểm soát participant transaction, contract kiểm soát funds, backend điều phối trải nghiệm và off-chain data, còn `Arbiter Safe` chịu trách nhiệm cho `Ruling` cần review evidence.

Phạm vi MVP đủ để chứng minh ý tưởng nếu nhóm ưu tiên core flow, test `Escrow` lifecycle và trình bày trung thực implementation status. Product Backlog đi kèm là căn cứ để theo dõi tiến độ theo evidence thay vì theo kế hoạch hoặc tuyên bố chưa được kiểm chứng.

## 17. Tài liệu tham khảo

1. [Repository Bloody-Roar tại mốc audit](https://github.com/trongkhoidev/capstone1-bloody-roar/tree/33aed2e1028d9fd89bb6d62b47a3df65ea1cb328)
2. [OpenZeppelin Contracts v5](https://docs.openzeppelin.com/contracts/5.x/)
3. [Solidity documentation](https://docs.soliditylang.org/)
4. [Base Sepolia network information](https://docs.base.org/network-information/)
5. [GraphQL specification](https://spec.graphql.org/)
6. [Socket.IO documentation](https://socket.io/docs/v4/)
7. [Prisma documentation](https://www.prisma.io/docs)
8. [OWASP Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/)
