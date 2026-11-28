# Bloody-Roar --- UI Refinement Review & Recommendations

**Mục tiêu:** Đánh giá giao diện Bloody-Roar dựa trên screenshot đã cung
cấp và định hướng tham khảo Stack Overflow, đồng thời giữ nguyên design
system hiện tại.

**Phạm vi:** Tinh chỉnh UI (UI refinement), không phải redesign toàn bộ
sản phẩm hoặc thay đổi nghiệp vụ.

------------------------------------------------------------------------

## 1. Kết luận tổng quan

Giao diện hiện tại có nền tảng tương đối tốt, nhưng cần cải thiện cách
phân cấp thông tin, phân bổ không gian và tính nhất quán giữa các thành
phần.

Các vấn đề nổi bật quan sát được trong screenshot:

1.  **Navbar:** Các nhóm logo, navigation, search và tài khoản chưa cân
    bằng về chiều ngang. Search chiếm nhiều diện tích; cụm chức năng bên
    phải khá dày.
2.  **Mật độ nội dung:** Khu vực bounty hiển thị nhiều thông tin nhưng
    thứ tự ưu tiên thị giác chưa thật rõ.
3.  **Phân cấp thị giác:** Một số thành phần cùng nổi bật, khiến người
    dùng chưa dễ nhận ra hành động hoặc thông tin quan trọng nhất.
4.  **Tính nhất quán:** Cần rà soát lại kích thước control, khoảng cách,
    padding, typography và trạng thái component.

**Định hướng:** Giữ bản sắc Bloody-Roar, học Stack Overflow về
information architecture, information density, visual hierarchy và cách
sử dụng màu chức năng. Không sao chép nguyên giao diện Stack Overflow.

## 2. Phạm vi và nguyên tắc thiết kế

### 2.1. Giữ nguyên design system hiện tại

Đây là một ticket tinh chỉnh design system đang có. Không nên tự ý tạo
một hệ thống thiết kế mới.

**Giữ nguyên:**

-   Bảng màu "achromatic ledger": `--brand` = `--link` `#1D5FBF`, `--cta` `#111316`.
-   Các token màu hiện có như `--link`, `--tag-*` và những token liên
    quan.
-   Font family: `Geist` và `Geist Mono`.
-   Bản sắc hình ảnh và các component hiện tại nếu chúng vẫn đáp ứng yêu
    cầu.

**Được phép tinh chỉnh:**

-   Cách phân bổ màu và mức độ nổi bật của từng màu.
-   Font size, font weight và line-height.
-   Spacing, gap, padding và margin.
-   Chiều cao, chiều rộng và kích thước control.
-   Border, background, radius và shadow.
-   Trạng thái default, hover, active, focus, disabled, loading và
    error.
-   Bố cục và thứ tự ưu tiên nội dung.

### 2.2. Nguyên tắc tham khảo Stack Overflow

Nên học cách Stack Overflow tổ chức một sản phẩm có nhiều thông tin:

-   **Information density:** Hiển thị đủ thông tin cần thiết nhưng vẫn
    dễ quét mắt.
-   **Visual hierarchy:** Phân biệt rõ tiêu đề, metadata, nội dung,
    trạng thái và hành động.
-   **Functional color:** Màu thể hiện vai trò hoặc trạng thái, không
    chỉ dùng để trang trí.
-   **Consistent components:** Các thành phần cùng loại có quy tắc hiển
    thị và tương tác thống nhất.
-   **Content-first layout:** Ưu tiên nội dung chính hơn các yếu tố
    trang trí.

Không nên sao chép trực tiếp màu sắc, layout hoặc component của Stack
Overflow nếu chúng không phù hợp với mô hình Bounty Marketplace của
Bloody-Roar.

## 3. Màu sắc

### 3.1. Đánh giá

Không cần thay đổi brand color hoặc tạo bảng màu mới. Vấn đề cần giải
quyết là màu hiện tại có được sử dụng đúng vai trò và nhất quán hay
không.

Không dùng màu accent hoặc CTA cho quá nhiều vùng lớn; đỏ chỉ dùng cho lỗi. Dùng tràn lan sẽ làm giảm
mức độ nổi bật của CTA và khiến giao diện nặng hơn.

### 3.2. Quy tắc phân bổ màu đề xuất

  -----------------------------------------------------------------------
  Vai trò                             Cách sử dụng
  ----------------------------------- -----------------------------------
  Page background                     Màu neutral, tạo nền tổng thể

  Card / surface                      Nền sáng, tách nội dung khỏi page
                                      background

  Primary text                        Màu tối, độ tương phản cao

  Secondary text                      Màu trung tính dịu hơn

  `--cta` `#111316`                   CTA chính (Post bounty, Apply)
                                      `--brand` `#1D5FBF`: focus, badge chưa đọc

  `--link`                            Liên kết điều hướng và liên kết
                                      trong nội dung

  `--tag-*`                           Phân loại bounty, kỹ năng và
                                      metadata

  Success                             Trạng thái thành công hoặc hoàn tất

  Warning                             Trạng thái cần chú ý

  Error                               Lỗi hoặc hành động không thành công
  -----------------------------------------------------------------------

### 3.3. Tiêu chí rà soát

-   Mỗi màu có vai trò rõ ràng.
-   Màu chữ và nền có độ tương phản đủ để đọc.
-   Không dùng nhiều màu nổi bật cạnh tranh cùng lúc.
-   Tag có màu nhất quán theo loại hoặc trạng thái.
-   Trạng thái success, warning và error không bị nhầm lẫn.
-   Giữ nguyên giá trị token hiện có trừ khi có lý do và phê duyệt rõ
    ràng.

## 4. Typography

**Quyết định:** Giữ `Geist` và `Geist Mono`. Không chuyển sang system
font.

Chỉ cần chuẩn hóa scale và cách sử dụng:

  Thành phần            Font           Kích thước tham khảo Độ đậm
  --------------------- ------------ ---------------------- ----------------------
  Page heading          Geist                      24--30px Semibold
  Section heading       Geist                      18--20px Semibold
  Card title            Geist                      16--18px Semibold
  Body                  Geist                      14--15px Regular
  Secondary text        Geist                      12--13px Regular
  Reward / số liệu      Geist Mono                 20--28px Medium hoặc Semibold
  Code / technical ID   Geist Mono                 12--14px Regular

Các kích thước trên là mức tham khảo để rà soát, không phải yêu cầu áp
dụng máy móc cho mọi màn hình.

**Tiêu chí:**

-   Heading, body, caption và metadata có phân cấp dễ nhận biết.
-   Không dùng quá nhiều cỡ chữ gần nhau nhưng không có mục đích.
-   Line-height đủ thoáng để đọc.
-   Số tiền thưởng, số dư, ID và dữ liệu kỹ thuật dùng Geist Mono nhất
    quán.
-   Không thay font family hiện tại.

## 5. Navbar

### 5.1. Đánh giá từ screenshot

Navbar hiện tại có các nhóm:

-   Logo Bloody-Roar.
-   Navigation: Bounties, Guide, My work.
-   Search.
-   Messages.
-   Notification.
-   CTA Post bounty.
-   Profile / account dropdown.

Vấn đề chính không nằm ở chiều cao đơn thuần mà nằm ở **mật độ thành
phần và phân bổ chiều ngang**.

  -----------------------------------------------------------------------
  Thành phần              Nhận xét                Đề xuất
  ----------------------- ----------------------- -----------------------
  Logo                    Tương đối ổn            Giữ nguyên, bảo đảm căn
                                                  giữa theo trục dọc

  Bounties / Guide / My   Active item hơi giống   Giữ active state nhưng
  work                    một button độc lập      dùng nền nhẹ, đồng bộ
                                                  với navigation

  Search                  Chiếm khá nhiều chiều   Thử giảm chiều rộng,
                          ngang                   giữ đủ chỗ cho
                                                  placeholder và thao tác
                                                  tìm kiếm

  Messages                Chữ và badge cùng thu   Giảm độ nổi bật của
                          hút chú ý               badge, căn chỉnh
                                                  baseline

  Notification            Hợp lý về chức năng     Giữ icon button, chuẩn
                                                  hóa kích thước vùng bấm

  Post bounty             Là CTA quan trọng       Giữ là hành động nổi
                                                  bật nhất trong navbar

  Profile                 Cụm avatar, tên, rating Thu gọn và phân cấp rõ
                          và dropdown chiếm diện  avatar, tên, thông tin
                          tích                    phụ
  -----------------------------------------------------------------------

### 5.2. Kích thước tham khảo

  Thuộc tính                Khoảng đề xuất
  ----------------------- ----------------
  Navbar height             56px (giữ nguyên)
  Logo area                     140--150px
  Search width                  340--380px
  Control height                  36--40px
  Khoảng cách giữa nhóm           16--24px

Đây là thông số khởi điểm để thử nghiệm trên layout thực tế, không phải
số đo bắt buộc.

**Giữ navbar 56px.** Navbar hiện đã cao 56px theo
`.agents/rules/claude-design-rules.md` và `apps/web/src/styles/claude-design.css`
(`.top`, kèm viền brand 3px phía trên). Chiều cao không phải vấn đề chính
trong screenshot; cần xử lý phân bổ chiều ngang, spacing và visual
hierarchy trước. Nếu sau Phase 1 vẫn muốn tăng chiều cao thì phải sửa
rules và được phê duyệt, vì đó là thay đổi design system (xem AC01).

### 5.3. Tiêu chí navbar sau khi tinh chỉnh

-   Logo, navigation, search và nhóm tài khoản được chia nhóm rõ.
-   Các thành phần căn chỉnh theo trục dọc.
-   Không có phần tử bị chen lấn hoặc co bất thường ở desktop.
-   Search không lấn át navigation và các hành động quan trọng.
-   `Post bounty` là CTA chính, không có nhiều CTA cạnh tranh.
-   Active, hover, focus và disabled state rõ ràng.
-   Responsive: navbar có phương án thu gọn phù hợp ở màn hình nhỏ.

## 6. Mật độ thông tin và Bounty Card

Screenshot cho thấy khu vực bounty chứa nhiều loại thông tin: reward,
title, description, status, tags, số lượng ứng tuyển và lượt xem. Đây là
dữ liệu cần thiết với một marketplace, nhưng cần được tổ chức theo thứ
tự ưu tiên.

### 6.1. Thứ tự ưu tiên đề xuất

1.  Reward và trạng thái bounty.
2.  Tiêu đề bounty.
3.  Mô tả ngắn.
4.  Tags / kỹ năng.
5.  Metadata: applications, views, deadline hoặc thông tin phụ.
6.  Hành động: View, Apply hoặc hành động tương ứng.

### 6.2. Tiêu chí

-   Reward dễ nhận biết nhưng không lấn át tiêu đề.
-   Tiêu đề là điểm đọc chính của card.
-   Mô tả có giới hạn dòng hợp lý; nội dung dài không làm card mất cân
    bằng.
-   Tags có kích thước và màu nhất quán.
-   Metadata dùng typography nhỏ hơn nội dung chính.
-   CTA rõ ràng và có thứ bậc; không phải mọi hành động đều có độ nổi
    bật như nhau.
-   Các card trong cùng một danh sách có cấu trúc nhất quán.

## 7. Phạm vi màn hình triển khai

Không nên làm lại cả 34 màn hình trong một lần khi design direction và
component chưa được xác nhận.

### Phase 1 --- Core experience

Ưu tiên bốn màn hình:

  -----------------------------------------------------------------------
  Màn hình                            Nội dung cần tập trung
  ----------------------------------- -----------------------------------
  Home (`app/page.tsx`, mẫu           Phân cấp nội dung, thống kê,
  `00_Bloody-Roar_home.html`)         featured bounty và khu vực khám phá

  Browse Bounties                     Danh sách, filter, sorting, search
  (`app/marketplace`, mẫu             và pagination
  `01_Browse_bounties.html`)

  Bounty Detail (`app/issues/[id]`,   Scope, acceptance criteria, reward,
  chưa có mẫu riêng, gần nhất là      trạng thái, discussion và apply
  `19_Apply_to_a_bounty.html`)

  Dashboard (`app/dashboard`, mẫu     My work, trạng thái công việc và
  `05_Client_dashboard.html` và       hoạt động người dùng
  `18_Developer_dashboard.html`)
  -----------------------------------------------------------------------

Bounty Detail đã có HTML mẫu mới `docs/claude-design/34_Bounty_detail.html`. Dashboard có hai biến thể theo vai trò
(client và developer); cần xác nhận làm cả hai hay chỉ một.

### Phase 2 --- Shared components

Chuẩn hóa các thành phần dùng chung:

-   Navbar, sidebar và footer.
-   Bounty card.
-   Search và filter.
-   Tabs.
-   Button.
-   Badge / tag.
-   Input và dropdown.
-   Modal.
-   Pagination.
-   Empty state, loading state và error state.

### Phase 3 --- Remaining screens

-   Áp dụng các component và quy tắc đã thống nhất cho những màn còn
    lại.
-   Kiểm tra các trạng thái tương tác.
-   Kiểm tra responsive.
-   Rà soát các trường hợp nội dung dài, dữ liệu trống và lỗi.

**Lý do chia phase:** Bốn màn hình đầu đại diện cho những luồng quan
trọng. Hoàn thiện chúng trước giúp xác nhận design direction và
component, giảm nguy cơ phải sửa lại hàng loạt màn hình.

## 8. Pagination

### 8.0. Hiện trạng

-   Backend dùng cursor pagination: query `issues` nhận `first` / `after`
    và trả `pageInfo { hasNextPage endCursor }` cùng `totalCount`
    (`apps/web/src/graphql/modules/issue/issue.module.ts`).
-   Browse Bounties đang hiển thị kiểu "Load more" với `PAGE_SIZE = 12`
    (`apps/web/src/components/marketplace/marketplace-view.tsx`).

Cursor pagination không cho nhảy thẳng tới trang N, nên numbered
pagination đầy đủ (bấm số trang, tới trang cuối) **bắt buộc phải thêm
tham số offset/page vào API**. Cần chọn một trong hai phương án:

-   **Phương án A (đề xuất):** Previous / Next, page size selector và dòng
    `Showing 1–15 of 276 bounties`, dựa trên cursor và `totalCount` có
    sẵn. Không đổi API.
-   **Phương án B:** Numbered pagination đầy đủ. Phải thêm offset/page vào
    query `issues`, nên cần ngoại lệ cho AC12 và test backend đi kèm.

### 8.1. Đề xuất

Sử dụng pagination kết hợp lựa chọn số lượng item mỗi trang. Số trang
và các phần tử đánh dấu (B) bên dưới chỉ áp dụng nếu chọn Phương án B.

Các lựa chọn page size:

-   15 items/page --- mặc định (hiện tại là 12, nên đây là thay đổi).
-   30 items/page.
-   50 items/page.

### 8.2. Thành phần cần có

-   Nút Previous và Next.
-   Số trang hiện tại (tính từ `totalCount` và page size).
-   (B) Các số trang lân cận.
-   (B) Dấu ba chấm khi danh sách có nhiều trang.
-   (B) Khả năng tới trang đầu và trang cuối nếu phù hợp với thiết kế.
-   Thông tin phạm vi bản ghi, ví dụ: `Showing 1–15 of 276 bounties`.
-   Page size selector.

### 8.3. Hành vi cần kiểm tra

-   Đổi trang không làm mất filter và sorting đang áp dụng.
-   Đổi page size đưa người dùng về trang 1 để tránh trang hiện tại
    không còn hợp lệ.
-   Không hiển thị trang vượt quá tổng số trang.
-   Loading và lỗi khi tải dữ liệu được thể hiện rõ.
-   Trên mobile, pagination không gây tràn ngang.

Đây là đề xuất cho Bloody-Roar, không phải khẳng định Stack Overflow
đang cung cấp chính xác các lựa chọn 15/30/50.

## 9. Tài liệu chuẩn --- `docs/claude-design/`

**Đề xuất: Có cập nhật HTML mẫu**, nhưng nên thực hiện sau khi Phase 1
được thống nhất.

Quy trình:

1.  Kiểm tra các HTML mẫu hiện tại.
2.  Liệt kê những component và quy tắc đã lỗi thời hoặc không còn khớp.
3.  Hoàn thiện và duyệt bốn màn hình ưu tiên.
4.  Cập nhật HTML mẫu theo design direction đã duyệt.
5.  Đồng bộ token, typography, spacing và component.
6.  Dùng các HTML mẫu đã cập nhật làm nguồn tham chiếu cho những màn
    hình còn lại.

**Nguyên tắc:** Không để giao diện đang triển khai và tài liệu design
mẫu mô tả hai hệ thống khác nhau.

Thư mục `docs/claude-design/` hiện có 35 màn HTML (`00`--`34`) và
`design-tokens.css`. Các file liên quan Phase 1:

-   Sửa: `00_Bloody-Roar_home.html`, `01_Browse_bounties.html`,
    `05_Client_dashboard.html`, `18_Developer_dashboard.html`.
-   Đã tạo: `34_Bounty_detail.html` (trang tĩnh, không dùng runtime của Claude Design).
-   Chỉ sửa nếu đổi token: `design-tokens.css` và
    `.agents/rules/claude-design-rules.md`.

Các màn còn lại (`02`--`33`) cập nhật ở ticket Phase 3.

## 10. "Taste skills"

Cụm từ "taste skills" chưa đủ thông tin để xác định đó là skill,
repository hay tài liệu nội bộ.

Có thể là:

-   Skill hướng dẫn AI đánh giá thẩm mỹ UI.
-   Design guideline hoặc tài liệu tham khảo.
-   Skill dành cho Claude Code.
-   Tài liệu nội bộ về tiêu chuẩn UI/UX.

Không nên tự suy đoán hoặc đưa một nguồn không xác thực thành yêu cầu
triển khai.

Cần yêu cầu người giao ticket cung cấp:

-   Tên chính xác của skill.
-   Link repository hoặc tài liệu.
-   Hướng dẫn cài đặt / sử dụng.
-   Phạm vi áp dụng và tiêu chí đánh giá.

Nếu không có nguồn cụ thể, có thể thay bằng các tiêu chí đánh giá UI rõ
ràng: visual hierarchy, spacing consistency, color balance, typography
và component consistency.

## 11. Acceptance Criteria --- Tiêu chí nghiệm thu

**Phạm vi US-158 (8 SP, Sprint 8 kết thúc 05/12/2026):** Navbar và bốn
màn Phase 1. Phase 2 (shared components còn lại), Phase 3 (các màn
`02`--`33`) và cập nhật HTML mẫu cho các màn đó tách thành ticket riêng.

### AC01 --- Design system

Giữ nguyên bảng màu "achromatic ledger" đang chạy
(`docs/design/ledger-palette-and-copy.md`): `--brand` = `--link`
`#1D5FBF`, `--cta` gần đen `#111316`, đỏ chỉ dùng cho lỗi. Giữ các token
`--tag-*`, font `Geist` / `Geist Mono` và các số đo layout trong
`.agents/rules/claude-design-rules.md` (navbar 56px, sidebar phải 300px,
cột stats của bounty card 112px). Rules đã được cập nhật cho khớp bảng
màu này; `docs/claude-design/design-tokens.css` và bản nhúng trong cả 35
màn đã đồng bộ sang bảng màu ledger.

### AC02 --- Color hierarchy

Màu chỉ lấy từ CSS variables trong `.br` / `.br.dark`, không có mã màu
hard-code mới. `--cta` chỉ dùng cho CTA chính (`Post bounty`, `Apply`);
`--brand` / `--link` cho liên kết, focus và badge chưa đọc; `--gold` chỉ
cho số tiền; `--ok`, `--warn`, `--bad` chỉ dùng cho trạng thái tương ứng.

### AC03 --- Navbar

Navbar giữ cao 56px. Ở độ rộng 1100px trở lên, logo, navigation, search
và nhóm tài khoản nằm trên một hàng, không bị cắt chữ, xuống dòng hoặc
chồng lấn. `Post bounty` là nút duy nhất dùng màu CTA trong navbar.
Dưới 900px navbar có phương án thu gọn.

### AC04 --- Typography

Chỉ dùng các cỡ chữ và độ đậm trong bảng ở mục 4. Mọi số tiền, số dư,
ID và hash dùng class `mono` (Geist Mono).

### AC05 --- Spacing

Padding, gap và margin của các màn Phase 1 dùng một thang spacing chung
(đề xuất 4 / 8 / 12 / 16 / 24px, chốt khi làm Phase 1). Border radius
dùng cùng một bộ giá trị cho các component cùng loại.

### AC06 --- Core screens

Home (`app/page.tsx`), Browse Bounties (`app/marketplace`), Bounty Detail
(`app/issues/[id]`) và Dashboard (`app/dashboard`) được cập nhật theo
design direction đã duyệt.

### AC07 --- Bounty cards

Bounty card giữ layout `.sum` (cột stats 112px bên trái). Tiêu đề là chữ
lớn nhất trong card; reward dùng Geist Mono; mô tả giới hạn tối đa 2
dòng; tags, deadline và application count dùng cỡ chữ secondary text.

### AC08 --- Pagination

Browse Bounties thay "Load more" bằng pagination có Previous / Next, lựa
chọn 15 / 30 / 50 items per page (mặc định 15) và dòng
`Showing x–y of N bounties`. Đổi trang giữ nguyên filter và sorting; đổi
page size đưa về trang 1. Numbered pagination đầy đủ chỉ làm nếu chọn
Phương án B ở mục 8.0.

### AC09 --- Component consistency

Button, input, dropdown, tag và pagination trên các màn Phase 1 có đủ
trạng thái default, hover, focus và disabled; danh sách và form có
trạng thái loading, empty và error.

### AC10 --- Responsive

Không có horizontal overflow hoặc thành phần chồng lấn ở các breakpoint
CSS hiện có: 560px, 820px, 900px và 1100px, cùng desktop từ 1280px trở
lên.

### AC11 --- Documentation

HTML mẫu của các màn Phase 1 trong `docs/claude-design/` được cập nhật
theo design direction đã duyệt (xem mục 9), và tạo mới mẫu cho Bounty
Detail.

### AC12 --- Regression

Không làm thay đổi nghiệp vụ, API, quyền truy cập hoặc luồng chức năng
hiện tại. Ngoại lệ duy nhất: nếu chọn Phương án B ở mục 8.0 thì được
thêm tham số offset/page vào query `issues`, kèm test backend.
`bun run typecheck`, `bun run lint` và `bun run test` trong `apps/web`
đều pass.

### Cách nghiệm thu

Agent không kiểm UI bằng screenshot hoặc click trình duyệt (theo
`AGENTS.md`). AC03, AC07, AC09 và AC10 do người review nghiệm thu bằng
mắt, đối chiếu với HTML mẫu đã duyệt; các AC còn lại kiểm qua code
review và lệnh CLI ở AC12.

------------------------------------------------------------------------

## 12. Thứ tự ưu tiên triển khai

  -----------------------------------------------------------------------
  Ưu tiên                 Hạng mục                Lý do
  ----------------------- ----------------------- -----------------------
  P0                      Navbar                  Xuất hiện xuyên suốt
                                                  sản phẩm, ảnh hưởng
                                                  trực tiếp đến điều
                                                  hướng

  P0                      Bounty card / Browse    Luồng khám phá bounty
                          Bounties                cốt lõi

  P0                      Bounty Detail           Nơi người dùng đánh giá
                                                  và ứng tuyển bounty

  P1                      Home                    Cải thiện trải nghiệm
                                                  khám phá ban đầu

  P1                      Dashboard               Cải thiện theo dõi công
                                                  việc

  P1                      Shared components       Tạo tính nhất quán giữa
                                                  các màn

  P2                      Remaining screens       Áp dụng design
                          (ticket riêng)          direction đã xác nhận

  P2                      HTML documentation      Đồng bộ nguồn tham
                          màn `02`--`33` (ticket  chiếu sau khi duyệt
                          riêng)                  thiết kế
  -----------------------------------------------------------------------

## 13. Kết luận và định hướng cuối cùng

Bloody-Roar không cần trở thành bản sao của Stack Overflow. Đây là
Bounty Marketplace, vì vậy cần giữ các yếu tố đặc trưng:

-   Reward.
-   Escrow.
-   Bounty status.
-   Developer profile.
-   Application / Apply flow.
-   Discussion và acceptance criteria.

Điều nên học từ Stack Overflow là cách xử lý một giao diện có nhiều
thông tin: rõ thứ bậc, dễ quét mắt, màu có chức năng và component nhất
quán.

**Định hướng đề xuất:**

> Giữ bản sắc Bloody-Roar và design system hiện tại; tinh chỉnh cách
> phân bổ màu, typography, spacing, mật độ thông tin và visual hierarchy
> theo hướng rõ ràng, nhất quán và chuyên nghiệp hơn. Ưu tiên Navbar,
> Browse Bounties, Bounty Detail và Dashboard trước khi áp dụng cho toàn
> bộ các màn hình còn lại.

------------------------------------------------------------------------

## 14. Những điểm cần xác nhận trước khi triển khai

1.  Xác nhận bốn màn hình ưu tiên trong Phase 1, và Dashboard làm cả
    client lẫn developer hay chỉ một.
2.  Xác nhận giữ navbar 56px (đề xuất) hay cho phép đổi rules.
3.  Chọn Phương án A hoặc B cho pagination (mục 8.0), và xác nhận đổi
    page size mặc định từ 12 sang 15.
4.  Cung cấp nguồn cụ thể cho "taste skills", nếu đây là requirement bắt
    buộc.
5.  Đồng ý tách Phase 2, Phase 3 và HTML mẫu của các màn còn lại thành
    ticket riêng.
6.  Xác nhận người nghiệm thu các AC về giao diện.

**Lưu ý về cơ sở đánh giá:** Nhận xét về giao diện Bloody-Roar trong tài
liệu này dựa trên screenshot được cung cấp. Chiều cao navbar, breakpoint,
cơ chế pagination và danh sách HTML mẫu đã được đối chiếu với mã nguồn;
các thông số còn lại là đề xuất thiết kế để kiểm chứng trên sản phẩm
thực tế. Các nguyên tắc tham
khảo Stack Overflow là định hướng thiết kế, không phải bản sao đặc tả
giao diện của Stack Overflow.
