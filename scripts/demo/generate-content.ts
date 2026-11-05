import * as fs from "node:fs";
import * as path from "node:path";

export const CONTENT_DIR = path.resolve(process.cwd(), "scripts/demo/content");
export const HARDHAT_CONTENT_DIR = path.resolve(process.cwd(), "scripts/demo/content/hardhat");

export function getContentDir(): string {
  return process.env.DEMO_ACCOUNTS === "hardhat" ? HARDHAT_CONTENT_DIR : CONTENT_DIR;
}

export interface ProfileContent {
  role: string;
  name: string;
  bio: string;
  skills: string[];
  githubUsername: string;
  location?: string;
  displayRole?: "CLIENT" | "DEVELOPER";
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

// 5. Hardhat Profiles (46 profiles for hh04..hh49)
export function generateHardhatProfiles(): ProfileContent[] {
  const names = [
    // 23 displayRole CLIENT (#4–#26)
    "Trần Hải Đăng", "Sarah Jenkins", "Nguyễn Nhật Nam", "Marcus Thorne", "Lê Hoàng Yến",
    "Aiden Gallagher", "Phạm Minh Khôi", "Chloe Zhao", "Đỗ Quốc Bảo", "Liam O'Connor",
    "Vũ Thuỳ Dương", "Elena Vasquez", "Hoàng Gia Bách", "Julian Sterling", "Bùi Phương Linh",
    "Naoki Tanaka", "Đặng Tuấn Anh", "Maya Lin", "Lý Trường Giang", "Oscar Lindqvist",
    "Trịnh Kim Ngân", "Siddharth Mehta", "Vương Đình Trọng",
    // 23 displayRole DEVELOPER (#27–#49)
    "Phan Quốc Huy", "Viktor Novak", "Đoàn Minh Trí", "Hannah Schmidt", "Ngô Đức Thịnh",
    "Mateo Rossi", "Lâm Tuấn Kiệt", "Freja Nielsen", "Tạ Hoàng Long", "Kenji Fujimoto",
    "Trương Vĩnh Phúc", "Devon Castillo", "Hồ Thanh Bình", "Priya Patel", "Nguyễn Quang Sáng",
    "Gabriel Santos", "Dương Văn Thắng", "Lucas Meyer", "Châu Quốc Dũng", "Zainab Al-Fassi",
    "Lê Trọng Nghĩa", "Dmitri Volkov", "Hoàng Đức Nam" // #49 spammer
  ];

  const locations = [
    "Hà Nội, Việt Nam", "TP. Hồ Chí Minh, Việt Nam", "Đà Nẵng, Việt Nam", "Singapore",
    "San Francisco, CA, USA", "Berlin, Germany", "Tokyo, Japan", "London, UK",
    "Sydney, Australia", "Seoul, South Korea", "Toronto, Canada", "Amsterdam, Netherlands"
  ];

  const skillPools: Record<string, string[]> = {
    client: ["Product Management", "Requirements Spec", "System Architecture", "Agile Leadership", "Acceptance QA", "DeFi Strategy"],
    developer: ["TypeScript", "Solidity", "Next.js", "React", "Node.js", "PostgreSQL", "Docker", "GraphQL", "Tailwind CSS", "Ethers.js", "Hardhat", "Foundry", "Go", "Python"],
  };

  const bios = [
    "Product Owner & DeFi Strategist focusing on decentralized marketplaces, trustless escrow, and on-chain arbitration.",
    "Senior Fullstack & Blockchain Engineer with 7+ years building high-throughput payment bridges and smart contracts.",
    "Smart Contract Security Auditor and Solidity enthusiast. Focused on gas optimization, reentrancy prevention, and formal verification.",
    "Frontend Specialist & UI/UX Craftsman creating pixel-perfect, accessible Web3 applications with Next.js and Tailwind.",
    "DevOps & Infrastructure Architect specializing in Kubernetes, automated CI/CD pipelines, and high-availability PostgreSQL.",
    "Data Scientist & AI Researcher building recommendation systems, NLP moderation pipelines, and anomaly detection models.",
    "Backend Core Engineer passionate about strict TypeScript, microservices, GraphQL Yoga, and real-time Socket.IO.",
    "QA Lead & Verification Engineer ensuring comprehensive BDD acceptance criteria coverage and regression resilience."
  ];

  const profiles: ProfileContent[] = [];
  for (let i = 4; i <= 49; i++) {
    const id = String(i).padStart(2, "0");
    const role = `hh${id}`;
    const nameIndex = i - 4;
    const name = names[nameIndex] || `User ${id}`;
    const displayRole: "CLIENT" | "DEVELOPER" = i <= 26 ? "CLIENT" : "DEVELOPER";
    const personaPool = displayRole === "CLIENT" ? skillPools.client! : skillPools.developer!;
    const skills = personaPool.slice(0, 3 + (i % 4));
    const bio = bios[nameIndex % bios.length]!;
    const location = locations[nameIndex % locations.length]!;
    const githubUsername = `hh-demo-${displayRole.toLowerCase()}-${id}`;
    profiles.push({ role, name, bio, skills, githubUsername, location, displayRole });
  }

  return profiles;
}

// 6. Hardhat Issues (200 issues across 9 categories, >= 2 testCases, bounties 20–2000 mUSDC)
export function generateHardhatIssues(): IssueContent[] {
  const categories: IssueContent["category"][] = [
    "BUG_FIX", "FEATURE", "SMART_CONTRACT", "AUDIT", "UI_UX",
    "DATA_SCIENCE", "DEVOPS", "DOCUMENTATION", "OTHER"
  ];

  const allRoles = Array.from({ length: 45 }, (_, i) => `hh${String(i + 4).padStart(2, "0")}`); // hh04..hh48

  const templates: Record<string, Array<{ title: string; desc: string; skills: string[]; codeSnippet?: string }>> = {
    BUG_FIX: [
      {
        title: "Khắc phục lỗi làm tròn sai số khi chia settlement 50/50",
        desc: "Hàm tính toán chia settlement clientBps đang bị sai lệch 1 wei ở các khoản tiền lẻ do ép kiểu BigInt sang Number trước khi tính toán. Cần áp dụng chuẩn math precision không làm tròn non-zero wei.",
        skills: ["Solidity", "BigInt", "TypeScript"],
        codeSnippet: "```solidity\n// Current bug: uint256 clientShare = (amount * clientBps) / 10000;\n// Expected: strictly checked invariant clientShare + devShare + fee == amount\n```"
      },
      {
        title: "Fix WebSocket connection leak on rapid room join and leave",
        desc: "Rapidly switching between arbitration chat rooms causes memory leak in Socket.IO adapter. Socket listeners are not detached on unmount, resulting in duplicate notification emissions.",
        skills: ["Node.js", "Socket.IO", "React", "Memory Profiling"],
        codeSnippet: "```typescript\nsocket.on('task:message', handleMsg);\n// Cleanup function missing socket.off in useEffect\n```"
      },
      {
        title: "Sửa lỗi transaction intent bị kẹt ở trạng thái SUBMITTED khi RPC timeout",
        desc: "Khi local node hoặc RPC trả về timeout, transaction intent vẫn ở trạng thái SUBMITTED thay vì chuyển FAILED sau expiry window. Cần bổ sung worker sweep job kiểm tra tx confirmation.",
        skills: ["PostgreSQL", "Prisma", "Worker", "Indexer"],
      },
      {
        title: "Resolve race condition in developer reservation lock under high concurrency",
        desc: "Concurrent requests to selectDeveloper on the same bounty produce PostgreSQL serialization error 40P01. Need row-level locking (`SELECT ... FOR UPDATE`) on the target reservation.",
        skills: ["PostgreSQL", "Prisma", "Transactions"],
      },
      {
        title: "Khắc phục lỗi upload file ảnh avatar vượt quá giới hạn 5MB không báo lỗi rõ ràng",
        desc: "Endpoint `/api/uploads` trả về HTTP 500 thay vì 413 Payload Too Large khi người dùng upload file quá dung lượng quy định. Cần validate header Content-Length và parse multipart stream an toàn.",
        skills: ["Next.js", "Zod", "API Security"],
      }
    ],
    FEATURE: [
      {
        title: "Tích hợp EIP-2612 permit signature cho việc cấp quyền nạp mUSDC không tốn gas",
        desc: "Xây dựng luồng permit 1-click cho phép client phê duyệt mUSDC và nạp escrow trong cùng một transaction intent, giảm thao tác approve truyền thống.",
        skills: ["Solidity", "EIP-2612", "Ethers.js", "Next.js"],
        codeSnippet: "```solidity\nfunction depositWithPermit(\n    string calldata escrowId, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s\n) external;\n```"
      },
      {
        title: "Xây dựng hệ thống thông báo realtime qua WebSocket cho sự kiện Escrow",
        desc: "Người dùng nhận thông báo ngay lập tức trên thanh Navbar khi có đơn ứng tuyển mới, khi client nạp tiền, hoặc khi phán quyết ban đầu được ban hành bởi trọng tài.",
        skills: ["Socket.IO", "React", "Tailwind CSS", "Zustand"],
      },
      {
        title: "Phát triển công cụ preview Markdown kèm hỗ trợ Mermaid diagram cho mô tả task",
        desc: "Cho phép client vẽ sơ đồ kiến trúc hệ thống trực tiếp trong bài đăng nhiệm vụ bằng cú pháp Mermaid, render trực quan cho developer trước khi ứng tuyển.",
        skills: ["Markdown", "Mermaid.js", "React", "Next.js"],
      },
      {
        title: "Implement automated CSV export for project earnings and transaction ledger",
        desc: "Developer and clients can export complete accounting statements including transaction hashes, block numbers, fee deductions, and counterpart wallet addresses.",
        skills: ["TypeScript", "CSV Generation", "Stream API"],
      },
      {
        title: "Thêm tính năng bookmark và theo dõi danh sách bounty yêu thích",
        desc: "Cho phép developer đánh dấu các bài toán quan tâm để nhận thông báo khi có bình luận mới hoặc khi thời hạn ứng tuyển sắp kết thúc.",
        skills: ["Next.js", "GraphQL", "Prisma"],
      }
    ],
    SMART_CONTRACT: [
      {
        title: "Viết hợp đồng TimeLockController điều phối Safe arbiter nâng cấp parameters",
        desc: "Triển khai module quản trị phi tập trung đảm bảo mọi thay đổi về phí nền tảng 2.5% hoặc thời hạn tranh chấp 72h phải trải qua cửa sổ delay 48 giờ trên chain.",
        skills: ["Solidity", "Timelock", "Safe", "Foundry"],
        codeSnippet: "```solidity\ncontract BloodyRoarTimelock is TimelockController {\n    uint256 public constant MIN_DELAY = 2 days;\n}\n```"
      },
      {
        title: "Tối ưu hóa gas cho hàm batchClaim bằng cách đóng gói storage layout",
        desc: "Khi developer claim tiền từ nhiều task hoàn tất cùng lúc, hàm batchClaim tiêu tốn 120k gas. Cần pack struct và tận dụng transient storage nếu khả thi.",
        skills: ["Solidity", "Gas Optimization", "Yul", "EVM"],
      },
      {
        title: "Xây dựng module Staking bảo chứng uy tín cho các bài toán giá trị cao (>1000 USDC)",
        desc: "Yêu cầu developer khóa tạm thời một lượng token staking trước khi nhận task lớn nhằm đảm bảo trách nhiệm bàn giao đúng tiến độ cam kết.",
        skills: ["Solidity", "ERC-20", "Escrow", "Hardhat"],
      },
      {
        title: "Add emergency pause and circuit breaker pattern controlled by 2-of-3 Safe",
        desc: "Implement circuit breaker to pause new deposits during abnormal volatility while allowing pending dispute resolutions and claims to continue unhindered.",
        skills: ["Solidity", "Pausable", "OpenZeppelin", "Security"],
      },
      {
        title: "Triển khai ERC-1271 contract signature verification cho Safe multi-sig",
        desc: "Hỗ trợ xác thực chữ ký off-chain của Safe multi-sig wallet khi ký các manifest bằng chứng tranh chấp và funding intents.",
        skills: ["ERC-1271", "Safe SDK", "Cryptography", "Solidity"],
      }
    ],
    AUDIT: [
      {
        title: "Đánh giá an toàn reentrancy trên toàn bộ external calls trong BloodyRoarEscrow",
        desc: "Kiểm tra kỹ lưỡng mô hình Checks-Effects-Interactions ở các hàm release, settle, và claimFunds. Đảm bảo SafeERC20 wrapper không mở ra vector tấn công tái nhập.",
        skills: ["Security Audit", "Slither", "Foundry", "Reentrancy"],
        codeSnippet: "```solidity\n// Verify that state changes precede token transfers in all resolution paths\n```"
      },
      {
        title: "Audit time-lock boundary edge cases in 7-day review timeout and challenge window",
        desc: "Conduct formal verification on review timeout timestamps. Verify that boundary condition `block.timestamp >= deadline + 7 days` is immune to miner timestamp manipulation.",
        skills: ["Security Audit", "Formal Verification", "Slither"],
      },
      {
        title: "Kiểm tra bảo mật API upload và chống path traversal attack",
        desc: "Rà soát toàn bộ middleware xử lý file tĩnh tại `/api/uploads`. Đảm bảo file extension, content-type sniffing và sanitization tên file ngăn chặn thực thi mã độc.",
        skills: ["AppSec", "Penetration Testing", "Node.js"],
      },
      {
        title: "Audit GraphQL query depth and rate limiting against denial of service",
        desc: "Verify that nested relation queries (e.g. issues -> applications -> user -> postedIssues) cannot trigger CPU starvation or database connection exhaustion.",
        skills: ["GraphQL Yoga", "Security", "Rate Limiting"],
      },
      {
        title: "Đánh giá an toàn của ThirdwebAuth SIWE session cookie và replay prevention",
        desc: "Kiểm tra tính duy nhất của nonce, thời gian hết hạn cookie, cờ HttpOnly, SameSite=Lax, và khả năng thu hồi phiên đăng nhập khi ví bị xâm phạm.",
        skills: ["SIWE", "Web3 Security", "Authentication"],
      }
    ],
    UI_UX: [
      {
        title: "Thiết kế responsive modal timeline tranh chấp theo chuẩn Claude Design",
        desc: "Xây dựng giao diện xem tiến trình tranh chấp gồm 4 giai đoạn: EVIDENCE_PERIOD, INITIAL_RULING, CHALLENGE và FINAL_RULING kèm đồng hồ đếm ngược trực quan.",
        skills: ["Next.js", "Tailwind CSS", "Framer Motion", "UI/UX"],
      },
      {
        title: "Xây dựng dark mode theme hoàn chỉnh với high contrast typography",
        desc: "Áp dụng bảng màu obsidian, blood-red và chrome-gold theo thiết kế BloodyRoar. Đảm bảo độ tương phản WCAG 2.1 AA trên mọi màn hình di động.",
        skills: ["CSS Variables", "Tailwind CSS", "Accessibility"],
      },
      {
        title: "Optimize marketplace filter bar with multi-category selection and URL state",
        desc: "Cải thiện bộ lọc marketplace: cho phép chọn nhiều danh mục, thanh trượt khoảng bounty, lọc theo kỹ năng và tự động đồng bộ hóa với URL search params.",
        skills: ["React", "useSearchParams", "Next.js"],
      },
      {
        title: "Bổ sung keyboard shortcuts cho việc điều hướng và duyệt danh sách task",
        desc: "Thêm phím tắt (J/K để chuyển task, Enter để mở chi tiết, Esc để đóng modal, / để tìm kiếm) nâng cao trải nghiệm power user.",
        skills: ["React", "Accessibility", "Keyboard UX"],
      },
      {
        title: "Thiết kế trang thống kê uy tín và huy hiệu thành tích của Developer",
        desc: "Hiển thị biểu đồ radar năng lực kỹ năng, điểm đánh giá trung bình 5 sao, tỷ lệ bàn giao đúng hạn và tổng giá trị USDC đã tích lũy.",
        skills: ["Recharts", "UI/UX", "Next.js"],
      }
    ],
    DATA_SCIENCE: [
      {
        title: "Xây dựng thuật toán xếp hạng uy tín developer dựa trên PageRank và lịch sử task",
        desc: "Tính toán điểm uy tín tổng hợp kết hợp đánh giá từ client, độ khó của nhiệm vụ đã hoàn thành, và độ tin cậy của các bên từng hợp tác trong mạng lưới.",
        skills: ["Python", "Algorithms", "NetworkX", "Data Science"],
      },
      {
        title: "Phát hiện hành vi gian lận và thông đồng đẩy giá bounty bất thường",
        desc: "Áp dụng mô hình clustering và anomaly detection để phát hiện các cặp client-developer tạo giao dịch ảo nhằm tăng điểm uy tín phi thực tế.",
        skills: ["Machine Learning", "Scikit-Learn", "Anomaly Detection"],
      },
      {
        title: "Phân tích dự đoán thời gian hoàn thành task dựa trên độ phức tạp và category",
        desc: "Huấn luyện mô hình hồi quy ước tính số ngày cần thiết để giải quyết bài toán, giúp client đặt deadline thực tế hơn khi đăng tin tuyển dụng.",
        skills: ["Python", "Pandas", "Regression Models"],
      },
      {
        title: "Xây dựng hệ thống gợi ý bài toán phù hợp với sở trường của từng Developer",
        desc: "Tạo vector embedding từ hồ sơ kỹ năng của developer và mô tả bài đăng, tính cosine similarity để hiển thị danh sách Recommended Bounties.",
        skills: ["Vector Embeddings", "FastAPI", "Information Retrieval"],
      },
      {
        title: "Tự động trích xuất kỹ năng bắt buộc từ mô tả bài toán bằng LLM",
        desc: "Xử lý văn bản tự nhiên để tự động gắn thẻ tags kỹ năng (ví dụ: Solidity, Ethers.js, Next.js) khi khách hàng nhập mô tả tự do.",
        skills: ["NLP", "LLM", "Prompt Engineering"],
      }
    ],
    DEVOPS: [
      {
        title: "Thiết lập pipeline GitHub Actions tự động kiểm tra typecheck, lint và e2e backend",
        desc: "Cấu hình CI chạy tuần tự `bun run typecheck`, `bun run lint` và `bun run test:e2e:backend` trên môi trường Linux Ubuntu sạch trước khi cho phép merge PR.",
        skills: ["GitHub Actions", "CI/CD", "DevOps"],
        codeSnippet: "```yaml\nname: Verification Gate\non: [pull_request]\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: oven-sh/setup-bun@v2\n      - run: bun run typecheck && bun run lint\n```"
      },
      {
        title: "Cấu hình Prometheus và Grafana dashboard giám sát độ trễ RPC và worker queue",
        desc: "Thu thập metrics về số block đã scan, thời gian xử lý mỗi batch event, tỷ lệ lỗi RPC connection và dung lượng connection pool của PostgreSQL.",
        skills: ["Prometheus", "Grafana", "Monitoring", "Docker"],
      },
      {
        title: "Tối ưu hóa Docker multi-stage build cho Next.js 14 standalone container",
        desc: "Giảm kích thước Docker production image từ 1.2GB xuống dưới 150MB bằng cách dùng alpine base image và chỉ copy static assets cùng standalone server.",
        skills: ["Docker", "Alpine", "Container Optimization"],
      },
      {
        title: "Thiết lập môi trường local staging hoàn chỉnh với docker-compose",
        desc: "Tạo script 1-lệnh dựng cụm PostgreSQL, Hardhat node, Redis, Worker và Web server phục vụ cho việc kiểm thử tự động của cả team.",
        skills: ["Docker Compose", "Bash", "Local Dev"],
      },
      {
        title: "Bảo vệ endpoint GraphQL chống tấn công DDoS với Cloudflare WAF",
        desc: "Cấu hình rate limiting dựa trên IP, kiểm tra header Origin, chặn bot tự động quét lỗ hổng và giám sát lưu lượng bất thường vào cổng 4000.",
        skills: ["Cloudflare", "WAF", "Network Security"],
      }
    ],
    DOCUMENTATION: [
      {
        title: "Biên soạn tài liệu toàn diện về chu trình Escrow Flow từ Reservation đến Settlement",
        desc: "Viết hướng dẫn chi tiết kèm sơ đồ sequence diagram minh họa từng bước: chọn ứng viên, nạp ký quỹ, nộp kết quả, yêu cầu sửa và thanh toán.",
        skills: ["Technical Writing", "Mermaid", "Documentation"],
      },
      {
        title: "Soạn thảo hướng dẫn tích hợp SDK BloodyRoar cho ứng dụng bên thứ ba",
        desc: "Tài liệu hóa các hàm SDK: khởi tạo client, đăng nhập SIWE, tạo transaction intent, lắng nghe webhook realtime và tra cứu trạng thái ký quỹ.",
        skills: ["OpenAPI", "SDK Docs", "Markdown"],
      },
      {
        title: "Xây dựng sổ tay quy trình giải quyết tranh chấp công bằng cho Trọng tài",
        desc: "Quy định rõ tiêu chí đánh giá bằng chứng, khung tỷ lệ phân chia phán quyết (clientBps), thời hạn đối tụng 72 giờ và quy chế thách thức phán quyết.",
        skills: ["Legal Tech", "Dispute Resolution", "Guidelines"],
      },
      {
        title: "Document complete local development workflow with Hardhat and PostgreSQL",
        desc: "Cung cấp cẩm nang chi tiết cho kỹ sư mới: khởi động môi trường local, cấu hình biến môi trường, sinh dữ liệu demo và debug indexer.",
        skills: ["Developer Guide", "Markdown", "Onboarding"],
      },
      {
        title: "Biên tập bộ câu hỏi thường gặp (FAQ) về biểu phí và an toàn tài sản ký quỹ",
        desc: "Giải thích minh bạch về cách tính phí nền tảng 2.5%, cơ chế bảo vệ tiền đặt cọc khi developer không bàn giao và quyền lợi của các bên tham gia.",
        skills: ["Content Writing", "FAQ", "Customer Support"],
      }
    ],
    OTHER: [
      {
        title: "Nghiên cứu tích hợp Layer 2 Arbitrum và Optimism cho chi phí giao dịch thấp",
        desc: "Đánh giá tính khả thi kỹ thuật của việc mở rộng hợp đồng BloodyRoar sang các L2 rollups hàng đầu để tiết kiệm tối đa gas cho người dùng.",
        skills: ["Research", "Layer 2", "Rollups", "EVM"],
      },
      {
        title: "Tổ chức chương trình Bug Bounty cộng đồng cho các Smart Contract Core",
        desc: "Thiết lập thể lệ trao thưởng từ 500 đến 10.000 USDC cho các lỗ hổng nghiêm trọng được phát hiện trước khi triển khai Mainnet.",
        skills: ["Bug Bounty", "Community", "Security"],
      },
      {
        title: "Đánh giá hiệu năng và độ ổn định của Bun runtime so với Node 20",
        desc: "Thực hiện bài kiểm thử tải trọng (load testing) đo lường throughput, mức tiêu thụ RAM và thời gian khởi động cold start giữa 2 runtime.",
        skills: ["Benchmarking", "Bun", "Node.js", "Performance"],
      },
      {
        title: "Xây dựng bộ quy chuẩn đạo đức và nguyên tắc giải quyết bất đồng kỹ thuật",
        desc: "Đưa ra các tiêu chuẩn khách quan giúp client và developer dễ dàng tìm được tiếng nói chung khi đánh giá nghiệm thu sản phẩm phần mềm.",
        skills: ["Governance", "Standards", "Ethics"],
      },
      {
        title: "Tối ưu hóa Lighthouse SEO và OpenGraph metadata cho bài đăng bounty",
        desc: "Đảm bảo trang chi tiết bài toán đạt 100 điểm Lighthouse SEO, hiển thị thẻ preview đẹp mắt khi chia sẻ liên kết trên Telegram, Twitter và Discord.",
        skills: ["SEO", "OpenGraph", "Web Vitals"],
      }
    ]
  };

  const bountyScale = [30, 50, 75, 100, 150, 200, 280, 400, 600, 850, 1200, 1500, 2000];
  const difficulties: IssueContent["difficulty"][] = ["Easy", "Medium", "Hard", "Expert"];
  const timeEstimates = ["2 days", "3 days", "5 days", "1 week", "2 weeks"];
  const deliveryDaysList = [2, 3, 5, 7, 14];

  const issues: IssueContent[] = [];
  let count = 0;

  for (let i = 1; i <= 200; i++) {
    count++;
    const key = `issue_${String(count).padStart(3, "0")}`;
    const cat = categories[(count - 1) % categories.length]!;
    const tmpls = templates[cat]!;
    const tmpl = tmpls[(count - 1) % tmpls.length]!;

    // Distribute clientRole across all 45 user roles (proving equal client/dev permissions)
    const clientRole = allRoles[(count - 1) % allRoles.length]!;

    const bounty = bountyScale[(count - 1) % bountyScale.length]!;
    const difficulty = difficulties[(count - 1) % difficulties.length]!;
    const timeEst = timeEstimates[(count - 1) % timeEstimates.length]!;
    const deliveryDays = deliveryDaysList[(count - 1) % deliveryDaysList.length]!;
    const hasAttachment = count % 5 === 0;

    let desc = `${tmpl.desc}\n\nRepository: https://github.com/bloody-roar-demo/task-${count}\nAcceptance Criteria: Toàn bộ tiêu chí nghiệm thu bên dưới phải pass 100% trước khi bàn giao.`;
    if (tmpl.codeSnippet) {
      desc += `\n\nTham khảo đoạn mã liên quan:\n${tmpl.codeSnippet}`;
    }

    // Every issue has at least 2 test cases!
    const testCases: IssueContent["testCases"] = [
      {
        title: `Tiêu chí kiểm thử chức năng chính cho task #${count}`,
        description: "Kiểm tra luồng xử lý chuẩn theo đặc tả yêu cầu, trả về kết quả chính xác.",
        given: "Môi trường test và database đã được khởi tạo sạch",
        when: "Thực thi tính năng theo đúng tham số đầu vào quy định",
        then: "Kết quả trả về HTTP 200 OK và dữ liệu cập nhật chính xác trên DB",
        priority: "CRITICAL",
        isEdgeCase: false,
      },
      {
        title: `Tiêu chí kiểm thử ngoại lệ và biên lỗi #${count}`,
        description: "Đảm bảo hệ thống bắt lỗi chuẩn khi dữ liệu đầu vào không hợp lệ hoặc xảy ra tranh chấp tài nguyên.",
        given: "Dữ liệu đầu vào sai định dạng hoặc tài khoản không đủ quyền hạn",
        when: "Gửi yêu cầu thực thi thao tác nghiệp vụ",
        then: "Hệ thống trả về mã lỗi thích hợp và không làm thay đổi trạng thái dữ liệu",
        priority: "NORMAL",
        isEdgeCase: true,
      },
    ];

    if (count % 3 === 0) {
      testCases.push({
        title: `Tiêu chí kiểm thử hiệu năng và đồng thời #${count}`,
        description: "Kiểm tra khả năng chịu tải và chống race condition khi có 10 requests cùng lúc.",
        given: "10 kết nối đồng thời cùng gửi thao tác",
        when: "Tất cả requests được gửi đi cùng một thời điểm",
        then: "Chỉ request hợp lệ đầu tiên được chấp nhận, 9 requests sau nhận mã lỗi xung đột an toàn",
        priority: "NORMAL",
        isEdgeCase: true,
      });
    }

    issues.push({
      key,
      clientRole,
      title: `${tmpl.title} (Hardhat #${count})`,
      description: desc,
      category: cat,
      bountyAmount: bounty,
      difficulty,
      timeEstimate: timeEst,
      deliveryDays,
      githubRepo: `https://github.com/bloody-roar-demo/task-${count}`,
      requiredSkills: tmpl.skills,
      hasAttachment,
      testCases,
    });
  }

  return issues;
}

// 7. Hardhat Comments (800 comments with replies distributed across issues)
export function generateHardhatComments(issuesCount = 200): CommentContent[] {
  const commentTemplates = [
    "Cho mình hỏi task này có cần hỗ trợ tương thích ngược với Bun runtime 1.4 không bạn?",
    "I have extensive experience with this pattern in production. Can start immediately and deliver within 48h.",
    "Bạn có thể cung cấp thêm log chi tiết hoặc unit test case mẫu để reproduce lỗi được không?",
    "Đã review kỹ đặc tả và repository đính kèm. Sẵn sàng nhận nhiệm vụ và cam kết chất lượng.",
    "Does this task require gas optimization benchmarks before and after changes?",
    "Tiêu chí nghiệm thu này có yêu cầu viết thêm E2E test cho luồng giao dịch on-chain không?",
    "Mình đề xuất hướng tiếp cận dùng batch execution để giảm tối đa chi phí gas cho người dùng.",
    "Great initiative! Happy to collaborate on the smart contract security audit part.",
    "Cho mình hỏi bounty này thanh toán bằng token mUSDC trên chain local 31337 đúng không bạn?",
    "I can optimize the query execution plan with an index on composite columns."
  ];

  const replyTemplates = [
    "Đúng rồi bạn nhé, toàn bộ project chạy chuẩn trên Bun runtime và Node 20 LTS.",
    "Cảm ơn bạn đã quan tâm! Test coverage tối thiểu cần đạt 85% cho các module core.",
    "Mình vừa cập nhật thêm log và đoạn code minh họa trong phần mô tả bài toán rồi nhé.",
    "Ý kiến tối ưu gas rất hay, bạn hãy nêu rõ phương án trong đơn ứng tuyển để mình duyệt nhé.",
    "Chính xác bạn nhé, tiền thưởng sẽ được ký quỹ 100% qua hợp đồng BloodyRoarEscrow."
  ];

  const allRoles = Array.from({ length: 46 }, (_, i) => `hh${String(i + 4).padStart(2, "0")}`); // hh04..hh49
  const comments: CommentContent[] = [];
  let count = 0;

  // 600 top-level comments
  for (let i = 0; i < 600; i++) {
    count++;
    const issueIndex = (i % issuesCount) + 1;
    const authorRole = allRoles[i % allRoles.length]!;
    const body = commentTemplates[i % commentTemplates.length]!;
    comments.push({
      key: `comment_${String(count).padStart(3, "0")}`,
      issueIndex,
      authorRole,
      body: `${body} (Ref #${count})`,
      isReply: false,
    });
  }

  // 200 replies
  for (let i = 0; i < 200; i++) {
    count++;
    const issueIndex = (i % issuesCount) + 1;
    const authorRole = allRoles[(i + 5) % allRoles.length]!;
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

// 8. Hardhat Chat Rooms (50 rooms for the funded tasks)
export function generateHardhatChatRooms(issuesCount = 50): ChatRoomContent[] {
  const allRoles = Array.from({ length: 45 }, (_, i) => `hh${String(i + 4).padStart(2, "0")}`);
  const rooms: ChatRoomContent[] = [];

  for (let r = 1; r <= issuesCount; r++) {
    const issueKey = `issue_${String(r).padStart(3, "0")}`;
    const clientRole = allRoles[(r - 1) % allRoles.length]!;
    const devRole = allRoles[(r + 10) % allRoles.length]!;

    const messages: ChatMessageContent[] = [
      { senderRole: clientRole, text: "Chào bạn, mình đã duyệt đơn và ký quỹ tiền thưởng on-chain thành công." },
      { senderRole: devRole, text: "Cảm ơn bạn! Mình đã nhận được thông báo ký quỹ và bắt đầu clone repo về máy." },
      { senderRole: devRole, text: "Mình đã tái hiện được vấn đề và chuẩn bị viết unit test kiểm chứng." },
      { senderRole: clientRole, text: "Tuyệt vời, nhớ chú ý kiểm tra cả trường hợp concurrency và edge case nhé." },
      { senderRole: devRole, text: "Đã thêm các test case cần thiết và chạy pass 100% trên môi trường local." },
      { senderRole: devRole, text: "Mình gửi kèm file log kết quả benchmark và test run nhé.", hasFile: true },
      { senderRole: clientRole, text: "Log chi tiết lắm, bạn có thể tạo submission draft và nộp lên hệ thống được rồi." },
      { senderRole: devRole, text: "Đã tạo draft submission và chuẩn bị gọi prepareSubmitWork on-chain." },
      { senderRole: devRole, text: "Đã gửi giao dịch delivery on-chain thành công, nhờ bạn review nghiệm thu nhé!" },
      { senderRole: clientRole, text: "Mình đang pull code về kiểm tra lần cuối. Kết quả rất tốt và đúng hạn!" },
    ];

    // Intentionally inject contact info into 3 rooms (for AI Guard redaction demonstration)
    if (r === 1) {
      messages.push({ senderRole: devRole, text: "Nếu cần trao đổi gấp bạn có thể nhắn tin qua số 0912345678 nhé!" });
    } else if (r === 2) {
      messages.push({ senderRole: clientRole, text: "Bạn gửi bản thiết kế vào email client.support@demo-portal.fake giúp mình." });
    } else if (r === 3) {
      messages.push({ senderRole: devRole, text: "Call qua điện thoại 0988776655 để sync nhanh 5 phút được không bạn?" });
    }

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

export function writeAllContent(targetDir?: string): void {
  const dir = targetDir || getContentDir();
  const isHardhat = dir === HARDHAT_CONTENT_DIR || process.env.DEMO_ACCOUNTS === "hardhat";

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const profiles = isHardhat ? generateHardhatProfiles() : generateProfiles();
  const issues = isHardhat ? generateHardhatIssues() : generateIssues();
  const comments = isHardhat ? generateHardhatComments(200) : generateComments(150);
  const chatRooms = isHardhat ? generateHardhatChatRooms(50) : generateChatRooms(35);

  fs.writeFileSync(path.join(dir, "profiles.json"), JSON.stringify(profiles, null, 2), "utf-8");
  fs.writeFileSync(path.join(dir, "issues.json"), JSON.stringify(issues, null, 2), "utf-8");
  fs.writeFileSync(path.join(dir, "comments.json"), JSON.stringify(comments, null, 2), "utf-8");
  fs.writeFileSync(path.join(dir, "chat.json"), JSON.stringify(chatRooms, null, 2), "utf-8");

  console.log(`Generated demo content in ${dir}:`);
  console.log(`- profiles.json: ${profiles.length} profiles`);
  console.log(`- issues.json:   ${issues.length} issues`);
  console.log(`- comments.json: ${comments.length} comments`);
  console.log(`- chat.json:     ${chatRooms.length} chat rooms`);
}

if ((import.meta as unknown as { main?: boolean }).main) {
  const customDir = process.argv[2];
  writeAllContent(customDir);
}
