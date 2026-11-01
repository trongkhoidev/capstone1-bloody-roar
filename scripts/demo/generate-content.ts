import * as fs from "node:fs";
import * as path from "node:path";

export const CONTENT_DIR = path.resolve(process.cwd(), "scripts/demo/content");

export interface ProfileContent {
  role: string;
  name: string;
  bio: string;
  skills: string[];
  githubUsername: string;
}

export interface IssueContent {
  key: string;
  clientRole: string;
  title: string;
  description: string;
  category:
    | "BUG_FIX"
    | "FEATURE"
    | "SMART_CONTRACT"
    | "AUDIT"
    | "UI_UX"
    | "DATA_SCIENCE"
    | "DEVOPS"
    | "DOCUMENTATION"
    | "OTHER";
  bountyAmount: number;
  difficulty: "Easy" | "Medium" | "Hard" | "Expert";
  timeEstimate: string;
  deliveryDays: number;
  githubRepo: string;
  requiredSkills: string[];
  hasAttachment: boolean;
  testCases?: Array<{
    title: string;
    description: string;
    given: string;
    when: string;
    then: string;
    priority: "CRITICAL" | "NORMAL" | "LOW";
    isEdgeCase: boolean;
  }> | undefined;
}

export interface CommentContent {
  key: string;
  issueIndex: number;
  authorRole: string;
  body: string;
  isReply: boolean;
}

export interface ChatMessageContent {
  senderRole: string;
  text: string;
  hasFile?: boolean;
  isEdited?: boolean;
  isDeleted?: boolean;
}

export interface ChatRoomContent {
  roomIndex: number;
  issueKey: string;
  clientRole: string;
  developerRole: string;
  messages: ChatMessageContent[];
}

// 1. Generate 40 profiles
export function generateProfiles(): ProfileContent[] {
  const names = [
    // 10 clients
    "Nguyen Quoc Trung", "Alex Rivera", "Le Thi Mai Anh", "David K. Miller", "Tran Minh Duc",
    "Elena Rostova", "Pham Hoang Nam", "Kenji Sato", "Doan Thu Trang", "Michael Vance",
    // 22 developers
    "Vu Tuan Kiet", "Lucas Silva", "Hoang Van Long", "Chloe Martin", "Ngo Quang Huy",
    "Dmitri Ivanov", "Dang Thai Son", "Priya Sharma", "Bui Duc Thinh", "Marcus Aurelius",
    "Phan Thanh Dat", "Sophia Taylor", "Dinh Trong Khoi", "Carlos Mendez", "Ta Bao Ngoc",
    "Yuki Takahashi", "Nguyen Huu Phuc", "Oliver Brown", "Ly Gia Huy", "Fatima Al-Mansoor",
    "Trinh Cong Minh", "Jan Kowalski",
    // 8 both
    "Le Xuan Bach", "Emma Watson", "Nguyen Ngoc Lan", "Arthur Pendelton",
    "Cao Tien Dung", "Lukas Weber", "Do Quynh Chi", "Devon Miles"
  ];

  const skillPools: Record<string, string[]> = {
    client: ["Product Management", "Requirements Spec", "System Design", "Agile", "Acceptance Testing"],
    developer: ["TypeScript", "React", "Next.js", "Node.js", "Solidity", "PostgreSQL", "Docker", "Go", "Python", "GraphQL", "Tailwind CSS"],
    both: ["Fullstack Dev", "Solidity", "Architecture", "Smart Contracts", "DeFi", "Web3", "Next.js"],
  };

  const bios = [
    "Product Owner focusing on Web3 developer platforms and decentralized task marketplaces.",
    "Engineering Lead with 8+ years building high-throughput payment rails and microservices.",
    "Fullstack Typescript developer, passionate about clean architecture and strict type-safety.",
    "Solidity engineer and smart contract security auditor. Open source contributor.",
    "DevOps architect specializing in Kubernetes, automated CI/CD pipelines and infrastructure as code.",
    "Data Scientist and ML engineer working on NLP, time-series forecasting and recommendation systems.",
    "UI/UX frontend specialist crafting responsive, accessible, pixel-perfect user interfaces.",
    "Blockchain researcher exploring EVM scalability, rollups, and zero-knowledge primitives."
  ];

  const profiles: ProfileContent[] = [];
  for (let i = 1; i <= 40; i++) {
    const id = String(i).padStart(2, "0");
    const role = `user${id}`;
    const name = names[i - 1] || `User ${id}`;
    const persona = i <= 10 ? "client" : i <= 32 ? "developer" : "both";
    const pool = skillPools[persona]!;
    const skills = pool.slice(0, 3 + (i % 3));
    const bio = bios[i % bios.length]!;
    const githubUsername = `demo-${persona}-${id}`;
    profiles.push({ role, name, bio, skills, githubUsername });
  }

  return profiles;
}

// 2. Generate 150 issues
export function generateIssues(): IssueContent[] {
  const categories: IssueContent["category"][] = [
    "BUG_FIX", "FEATURE", "SMART_CONTRACT", "AUDIT", "UI_UX",
    "DATA_SCIENCE", "DEVOPS", "DOCUMENTATION", "OTHER"
  ];

  const clientRoles = [
    "user01", "user02", "user03", "user04", "user05",
    "user06", "user07", "user08", "user09", "user10",
    "user33", "user34", "user35", "user36"
  ];

  const issueTemplates: Record<string, Array<{ title: string; desc: string; skills: string[] }>> = {
    BUG_FIX: [
      {
        title: "Fix race condition in WebSocket session connection pool during reconnection",
        desc: "When a client drops TCP connection and immediately reconnects within 200ms, the previous session socket is not cleaned up in Redis adapter. Causes duplicate event delivery and memory leak. Reproducible under `npm run test:socket-reconnect`.",
        skills: ["Node.js", "WebSocket", "Redis", "TypeScript"],
      },
      {
        title: "Sửa lỗi floating point precision khi tính toán platform fee 2.5%",
        desc: "Hàm tính phí platformFeeBps ở frontend đang dùng Number thay vì BigNumber/Decimal, dẫn đến sai lệch 1 wei ở các khoản tiền lẻ. Cần chuyển hoàn toàn sang bigint theo chuẩn packages/shared/money.",
        skills: ["TypeScript", "BigInt", "Ethers.js"],
      },
      {
        title: "Resolve database transaction deadlocks on concurrent funding reservations",
        desc: "Concurrent requests to selectDeveloper on the same bounty produce PostgreSQL serialization error 40P01. Need to ensure explicit row-level locking (`SELECT ... FOR UPDATE`) on the issue record.",
        skills: ["PostgreSQL", "Prisma", "Transactions"],
      },
    ],
    FEATURE: [
      {
        title: "Tích hợp EIP-712 structured signing cho luồng nộp bằng chứng tranh chấp",
        desc: "Hiện tại evidence manifest chỉ upload metadata JSON. Cần cho phép các bên ký hash của manifest qua `_signTypedData` để đảm bảo tính toàn vẹn và chống giả mạo khi gửi lên chain.",
        skills: ["Solidity", "EIP-712", "TypeScript", "Next.js"],
      },
      {
        title: "Implement optimistic UI update for instant task comments and reactions",
        desc: "Add Apollo/TanStack Query optimistic cache mutation when user posts a comment. If API returns 429 or network error, revert smoothly and show retry indicator with toast notification.",
        skills: ["React", "TanStack Query", "UI/UX"],
      },
      {
        title: "Xây dựng dashboard thống kê thu nhập và danh tiếng cho developer",
        desc: "Tạo trang `/dashboard/earnings` hiển thị biểu đồ phân tích USDC đã nhận, số lượng bài hoàn thành đúng hạn, điểm uy tín trung bình và lịch sử thanh toán escrow on-chain.",
        skills: ["Next.js", "Recharts", "Tailwind CSS"],
      },
    ],
    SMART_CONTRACT: [
      {
        title: "Add reentrancy guards and ERC-20 SafeERC20 wrapper on settlement distribution",
        desc: "Review mutual settlement execution on BloodyRoarEscrow contract. Ensure `nonReentrant` modifier is strictly ordered and tokens with transfer hooks (ERC-777/ERC-1363) cannot hijack state.",
        skills: ["Solidity", "Smart Contract", "Hardhat"],
      },
      {
        title: "Optimize gas usage for multi-sig batch execution in Safe arbiter proxy",
        desc: "The executeTransaction call on Safe v1.4.1 consumes ~85k gas. Profile calldata layout and storage reads to minimize L1 data fee on Base Sepolia.",
        skills: ["Solidity", "Safe", "Gas Optimization"],
      },
    ],
    AUDIT: [
      {
        title: "Audit time-lock boundary edge cases in 7-day review timeout and challenge window",
        desc: "Conduct comprehensive formal verification on review timeout timestamps. Verify that boundary condition `block.timestamp >= deadline + 7 days` is immune to 15-second miner skew.",
        skills: ["Security Audit", "Slither", "Foundry"],
      },
      {
        title: "Kiểm tra bảo mật API endpoint upload và xác thực chữ ký SIWE",
        desc: "Đánh giá khả năng replay attack của SIWE nonce, thời gian hết hạn JWT session, và kiểm tra quyền truy cập file nhạy cảm trong bucket local uploads.",
        skills: ["Security", "JWT", "SIWE", "Web3"],
      },
    ],
    UI_UX: [
      {
        title: "Thiết kế responsive modal chi tiết tranh chấp và tiến trình bỏ phiếu Safe",
        desc: "Xây dựng giao diện xem timeline tranh chấp theo thiết kế Claude Design: hiển thị rõ giai đoạn EVIDENCE_PERIOD, INITIAL_RULING, CHALLENGE và FINAL_RULING với countdown timer thực tế.",
        skills: ["Figma", "Tailwind CSS", "Framer Motion"],
      },
      {
        title: "Refactor marketplace filter bar with multi-category selection and URL query sync",
        desc: "Improve issue discovery experience. Filter bar should support multiple categories, skill tags, bounty range slider, and sync seamlessly with `useSearchParams`.",
        skills: ["React", "Next.js", "Accessibility"],
      },
    ],
    DATA_SCIENCE: [
      {
        title: "Xây dựng model AI đề xuất developer phù hợp dựa trên mô tả bài toán và kỹ năng",
        desc: "Tạo pipeline embedding từ issue title + description, tính toán cosine similarity với developer profile vector để xếp hạng ứng viên trong tab Review Applicants.",
        skills: ["Python", "FastAPI", "Vector Search", "Embeddings"],
      },
      {
        title: "Detect anomalous bidding patterns and spam submissions with clustering",
        desc: "Implement automated heuristic scoring to detect Sybil accounts bidding on bounties without relevant portfolio history. Flag high-risk submissions for admin review.",
        skills: ["Python", "Scikit-learn", "Data Science"],
      },
    ],
    DEVOPS: [
      {
        title: "Setup automated GitHub Actions workflow for Base Sepolia fork testing",
        desc: "Configure CI pipeline to run Hardhat fork tests against Base Sepolia RPC. Include caching for Foundry dependencies and automated report upload to artifact storage.",
        skills: ["GitHub Actions", "Docker", "DevOps"],
      },
      {
        title: "Tối ưu hóa cấu hình Docker multi-stage build cho Next.js 14 standalone output",
        desc: "Giảm kích thước Docker image của web server từ 1.2GB xuống dưới 180MB bằng cách dùng alpine image và chỉ copy các file cần thiết từ `.next/standalone`.",
        skills: ["Docker", "Alpine", "CI/CD"],
      },
    ],
    DOCUMENTATION: [
      {
        title: "Viết tài liệu hướng dẫn tích hợp Smart Contract Escrow cho đối tác thứ ba",
        desc: "Soạn thảo tài liệu API chi tiết: cách tạo reservation, chuẩn EIP-712 funding intent, lắng nghe sự kiện Deposited và giải quyết tranh chấp qua Safe SDK.",
        skills: ["Technical Writing", "Markdown", "OpenAPI"],
      },
      {
        title: "Document complete local development workflow with Hardhat and PostgreSQL",
        desc: "Provide comprehensive guide for onboarding new backend developers: Docker setup, migrations, local seed, AI mock server and running E2E suites.",
        skills: ["Documentation", "Developer Experience"],
      },
    ],
    OTHER: [
      {
        title: "Tối ưu hóa Lighthouse SEO và Core Web Vitals cho trang chủ và danh sách bounty",
        desc: "Cải thiện LCP (Largest Contentful Paint) và CLS (Cumulative Layout Shift). Thêm OpenGraph meta tags động cho từng bài đăng bounty để chia sẻ trên Twitter/LinkedIn.",
        skills: ["SEO", "Performance", "Web Vitals"],
      },
      {
        title: "Implement internationalization (i18n) support for English and Vietnamese",
        desc: "Setup next-intl or custom dictionary translation system for platform navigation, status labels, and error messages.",
        skills: ["i18n", "Next.js", "React"],
      },
    ],
  };

  const issues: IssueContent[] = [];
  let count = 0;

  for (let c = 0; c < categories.length; c++) {
    const cat = categories[c]!;
    // 17 for first 6, 16 for next 3 = 150 total
    const numForCat = c < 6 ? 17 : 16;
    const templates = issueTemplates[cat]!;

    for (let i = 0; i < numForCat; i++) {
      count++;
      const key = `issue_${String(count).padStart(3, "0")}`;
      const tmpl = templates[i % templates.length]!;
      const clientRole = clientRoles[(count - 1) % clientRoles.length]!;

      // Bounty from 0.5 to 5.0 USDC
      const bounty = Number((0.5 + ((count * 13) % 46) * 0.1).toFixed(1));
      const diffs: IssueContent["difficulty"][] = ["Easy", "Medium", "Hard", "Expert"];
      const difficulty = diffs[count % diffs.length]!;
      const timeEst = `${2 + (count % 10)} days`;

      // 2 special issues for missed delivery (1-2 days)
      const deliveryDays = count === 1 || count === 2 ? 4 : 4 + (count % 11);

      const hasAttachment = count % 5 === 0; // 20%
      const hasCriteria = count <= 40; // 40 issues

      let testCases: IssueContent["testCases"] = undefined;
      if (hasCriteria) {
        testCases = [
          {
            title: `Acceptance Criteria 1 for ${tmpl.title.slice(0, 30)}`,
            description: "Verify normal execution path meets all functional specifications",
            given: "User is authenticated and on correct network chain",
            when: "Action is triggered with valid parameters",
            then: "State transitions correctly and events are emitted",
            priority: "CRITICAL",
            isEdgeCase: false,
          },
          {
            title: `Edge Case Validation for ${tmpl.title.slice(0, 30)}`,
            description: "Ensure invalid inputs and boundary conditions are rejected safely",
            given: "Input parameters exceed permitted bounds or timestamps are in past",
            when: "Action is submitted",
            then: "Request fails with descriptive GraphQL error code without side effects",
            priority: "NORMAL",
            isEdgeCase: true,
          },
        ];
      }

      issues.push({
        key,
        clientRole,
        title: `${tmpl.title} #${count}`,
        description: `${tmpl.desc}\n\nRepository: https://github.com/demo-org/bloody-service-${count}\nAcceptance: Tất cả test tự động phải pass và code review sạch.`,
        category: cat,
        bountyAmount: bounty,
        difficulty,
        timeEstimate: timeEst,
        deliveryDays,
        githubRepo: `https://github.com/demo-org/bloody-service-${count}`,
        requiredSkills: tmpl.skills,
        hasAttachment,
        testCases,
      });
    }
  }

  return issues;
}

// 3. Generate 500 comments (at least 100 replies)
export function generateComments(issuesCount = 150): CommentContent[] {
  const commentTemplates = [
    "Cho mình hỏi yêu cầu này có cần tương thích với bản Node 20 LTS không bạn?",
    "I have experience with this exact issue in production. Can take this up and deliver within 48 hours.",
    "Bạn có thể cung cấp thêm log chi tiết hoặc reproduce steps trên môi trường staging không?",
    "Đã review kỹ spec và repo liên quan. Sẵn sàng bắt đầu ngay khi được accept.",
    "Does this require backward compatibility with legacy schema migrations?",
    "Phần test coverage yêu cầu tối thiểu bao nhiêu % vậy bạn?",
    "Mình đề xuất tiếp cận dùng Redis Streams thay vì PubSub thông thường để tránh mất tin.",
    "Great initiative! Happy to collaborate on the smart contract security review part.",
    "Cho hỏi bounty này thanh toán bằng canonical USDC trên Base Sepolia đúng không?",
    "I can optimize the query execution plan with an index on composite columns."
  ];

  const replyTemplates = [
    "Đúng rồi bạn nhé, repo chạy hoàn toàn trên Node 20 và Bun runtime.",
    "Thanks for asking! Minimum unit test coverage should be at least 80%.",
    "Mình vừa cập nhật thêm reproduction steps trong description rồi nhé.",
    "Ý kiến dùng Redis Streams rất hay, bạn có thể giải thích thêm trong đơn ứng tuyển.",
    "Chính xác, toàn bộ tiền bounty được khóa an toàn qua Escrow contract trên Base Sepolia."
  ];

  const devRoles = Array.from({ length: 22 }, (_, i) => `user${String(i + 11).padStart(2, "0")}`);
  const clientRoles = Array.from({ length: 10 }, (_, i) => `user${String(i + 1).padStart(2, "0")}`);

  const comments: CommentContent[] = [];
  let count = 0;

  // First 400 top-level comments
  for (let i = 0; i < 400; i++) {
    count++;
    const issueIndex = (i % issuesCount) + 1;
    const authorRole = devRoles[i % devRoles.length]!;
    const body = commentTemplates[i % commentTemplates.length]!;
    comments.push({
      key: `comment_${String(count).padStart(3, "0")}`,
      issueIndex,
      authorRole,
      body: `${body} (Ref #${count})`,
      isReply: false,
    });
  }

  // 100 replies
  for (let i = 0; i < 100; i++) {
    count++;
    const issueIndex = (i % issuesCount) + 1;
    const authorRole = clientRoles[i % clientRoles.length]!;
    const body = replyTemplates[i % replyTemplates.length]!;
    comments.push({
      key: `comment_${String(count).padStart(3, "0")}`,
      issueIndex,
      authorRole,
      body: `@dev ${body} (Reply #${i + 1})`,
      isReply: true,
    });
  }

  return comments;
}

// 4. Generate 35 chat rooms with dialogues
export function generateChatRooms(issuesCount = 35): ChatRoomContent[] {
  const devRoles = Array.from({ length: 22 }, (_, i) => `user${String(i + 11).padStart(2, "0")}`);
  const clientRoles = Array.from({ length: 10 }, (_, i) => `user${String(i + 1).padStart(2, "0")}`);

  const rooms: ChatRoomContent[] = [];

  for (let r = 1; r <= issuesCount; r++) {
    const issueKey = `issue_${String(r).padStart(3, "0")}`;
    const clientRole = clientRoles[(r - 1) % clientRoles.length]!;
    const devRole = devRoles[(r - 1) % devRoles.length]!;

    const messages: ChatMessageContent[] = [
      { senderRole: clientRole, text: "Chào bạn, mình đã chọn bạn làm task này và escrow đã được nạp thành công." },
      { senderRole: devRole, text: "Cảm ơn bạn! Mình đang clone repo và dựng môi trường local để reproduce lỗi." },
      { senderRole: devRole, text: "Mình đã tái hiện được vấn đề ở hàm xử lý sự kiện. Đang viết unit test kiểm chứng." },
      { senderRole: clientRole, text: "Tuyệt vời, chú ý trường hợp concurrency khi có nhiều request đồng thời nhé." },
      { senderRole: devRole, text: "Đã thêm test race condition và fix hoạt động tốt, 100% test suites pass." },
      { senderRole: devRole, text: "Mình gửi kèm file log kết quả chạy benchmark local nhé.", hasFile: true },
      { senderRole: clientRole, text: "Log chi tiết lắm, bạn có thể tạo submission draft và nộp lên hệ thống được rồi." },
      { senderRole: devRole, text: "Đã tạo draft submission và chuẩn bị gọi prepareSubmitWork on-chain." },
      { senderRole: devRole, text: "Đã gửi giao dịch delivery lên Base Sepolia thành công, nhờ bạn review nhé!" },
      { senderRole: clientRole, text: "Đang pull code về review và chạy E2E check. Kết quả rất tốt!" },
    ];

    // Intentionally inject contact info into 3 rooms (to showcase AI Guard redaction)
    if (r === 1) {
      messages.push({ senderRole: devRole, text: "Nếu cần trao đổi gấp bạn có thể nhắn tin cho mình qua số 0912345678 nhé!" });
    } else if (r === 2) {
      messages.push({ senderRole: clientRole, text: "Bạn gửi bản thiết kế vào email client.support@demo-portal.fake giúp mình." });
    } else if (r === 3) {
      messages.push({ senderRole: devRole, text: "Call qua điện thoại 0988776655 để sync nhanh 5 phút được không bạn?" });
    }

    // Add extra back-and-forth messages so each room has 12-25 messages
    messages.push(
      { senderRole: clientRole, text: "Code clean, format chuẩn theo eslint và prettier của dự án.", isEdited: true },
      { senderRole: devRole, text: "Tin nhắn này gửi nhầm.", isDeleted: true },
      { senderRole: devRole, text: "Cảm ơn bạn đã review nhanh và hỗ trợ nhiệt tình!" }
    );

    rooms.push({
      roomIndex: r,
      issueKey,
      clientRole,
      developerRole: devRole,
      messages,
    });
  }

  return rooms;
}

export function writeAllContent(): void {
  if (!fs.existsSync(CONTENT_DIR)) {
    fs.mkdirSync(CONTENT_DIR, { recursive: true });
  }

  const profiles = generateProfiles();
  const issues = generateIssues();
  const comments = generateComments(150);
  const chatRooms = generateChatRooms(35);

  fs.writeFileSync(path.join(CONTENT_DIR, "profiles.json"), JSON.stringify(profiles, null, 2), "utf-8");
  fs.writeFileSync(path.join(CONTENT_DIR, "issues.json"), JSON.stringify(issues, null, 2), "utf-8");
  fs.writeFileSync(path.join(CONTENT_DIR, "comments.json"), JSON.stringify(comments, null, 2), "utf-8");
  fs.writeFileSync(path.join(CONTENT_DIR, "chat.json"), JSON.stringify(chatRooms, null, 2), "utf-8");

  console.log(`Generated demo content in ${CONTENT_DIR}:`);
  console.log(`- profiles.json: ${profiles.length} profiles`);
  console.log(`- issues.json:   ${issues.length} issues`);
  console.log(`- comments.json: ${comments.length} comments`);
  console.log(`- chat.json:     ${chatRooms.length} chat rooms`);
}

if ((import.meta as unknown as { main?: boolean }).main) {
  writeAllContent();
}
