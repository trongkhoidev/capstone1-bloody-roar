"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type UiLanguage = "en" | "vi";
export type UiTheme = "light" | "dark";

const messages = {
  en: {
    marketplace: "Marketplace",
    dashboard: "Dashboard",
    createBounty: "Post a bounty",
    admin: "Admin console",
    searchTasks: "Search tasks...",
    connectWallet: "Connect wallet",
    profile: "Profile",
    reputation: "Reputation",
    completedTasks: "Completed tasks",
    disconnect: "Disconnect wallet",
    language: "Language",
    theme: "Theme",
    lightTheme: "Switch to light theme",
    darkTheme: "Switch to dark theme",
    marketplaceTitle: "Bounty marketplace",
    marketplaceDescription: "Browse engineering work, apply with your wallet, and keep project decisions transparent.",
    openBounties: "Open bounties",
    openBountyPool: "Open bounty pool",
    activeDevelopers: "Active developers",
    opportunities: "opportunities to explore",
    networkNotice: "Base Sepolia · escrow actions pending contract integration",
    comments: "Questions and comments",
    noComments: "No comments yet. Start the discussion with a question or clarification.",
    commentPlaceholder: "Ask a question or add a clarification for this bounty...",
    addComment: "Add comment",
    signInToComment: "Connect a wallet to comment",
    demoComments: "Sample comments are read-only while the database is unavailable.",
    clientWorkspace: "Client workspace",
    switchToClient: "Switch to a client account to post a bounty",
    developerRoleExplanation: "Developer accounts can browse and apply to tasks. Choose the client role in your profile to publish a bounty and manage applicants.",
    openProfileSettings: "Open profile settings",
    describeWork: "Describe the work",
    clearAcceptance: "Set clear acceptance details and the reward token. Your bounty appears in the public marketplace after posting.",
    titleLabel: "Title",
    titleHint: "Use a specific title (10–120 characters).",
    descriptionLabel: "Description and acceptance criteria",
    categoryLabel: "Category",
    difficultyLabel: "Difficulty",
    notSpecified: "Not specified",
    skillsLabel: "Required skills",
    skillsPlaceholder: "Type a skill, or add several separated by commas",
    bountyAmount: "Bounty amount",
    allowedRange: "Allowed range",
    rewardToken: "Reward token",
    tokenWhitelist: "Only tokens listed in the platform whitelist can be used.",
    estimatedDuration: "Estimated duration",
    applicationDeadline: "Application deadline",
    githubRepository: "GitHub repository (optional)",
    cancel: "Cancel",
    publishBounty: "Publish bounty",
    profileHeading: "Your profile",
    profileIntro: "Help clients and developers understand your experience.",
    displayName: "Display name",
    aboutYou: "About you",
    skillsComma: "Skills (comma separated)",
    accountRole: "Account role",
    developerRole: "Developer · apply to tasks and deliver work",
    clientRole: "Client · post bounties and select a developer",
    switchRoles: "You can switch roles later. Existing assigned tasks and chat rooms stay attached to your account.",
    saveProfile: "Save profile",
    trustSignals: "Trust signals",
    github: "GitHub",
    verifiableCredentials: "Verifiable credentials",
    operations: "Operations",
    manageAccounts: "Manage accounts and record dispute proposals.",
    activeUsers: "Active users",
    openTasks: "Open tasks",
    inProgress: "In progress",
    openDisputes: "Open disputes",
    paidBounties: "Paid bounty totals",
    accounts: "Accounts",
    matchingAccounts: "matching accounts",
    suspend: "Suspend",
    restore: "Restore",
    disputes: "Disputes",
    reviewDisputes: "Review evidence and record a proposal for the challenge window.",
    noAccounts: "No accounts found.",
    noDisputes: "No disputes.",
    signInTitle: "Sign in to Bloody-Roar",
    signInWalletDesc: "Connect a wallet on Base Sepolia and confirm a SIWE signature",
    web3Wallets: "Web3 wallets",
    linkedAccounts: "Linked accounts",
    socialLoginUnavailable: "Social sign-in is not connected yet. Sign in with an EVM wallet, then link GitHub from your profile to verify your account.",
    connectBeforePosting: "Connect a wallet before posting",
    walletSessionPurpose: "A signed wallet session identifies the task owner and lets you manage applicants, deliveries, and future escrow actions.",
    descriptionHint: "Markdown is supported",
    titlePlaceholder: "e.g. Fix wallet connection on mobile Safari",
    descriptionPlaceholder: "What needs to be done? How will you verify it is complete? Include relevant context and links.",
    difficultyEasy: "Easy",
    difficultyMedium: "Medium",
    difficultyHard: "Hard",
    difficultyExpert: "Expert",
    skillExample: "e.g. 2–3 days",
    deadlineHint: "Choose a future date",
    avatarUrl: "Avatar URL",
    locationLabel: "Location",
    namePlaceholder: "Your name",
    locationPlaceholder: "City, country or remote",
    bioPlaceholder: "A short introduction or the kind of work you do.",
    verifiedAs: "Verified as",
    linkGithub: "Link GitHub account",
    linkGithubDescription: "Link GitHub to verify the account used for project work.",
    profileDetailsStored: "Profile details are stored in Bloody-Roar and shown to task participants.",
    wallet: "Wallet",
    noExternalCredentials: "No external credentials yet. EAS attestations can be added after that integration is enabled.",
    platformReputationExplanation: "Reputation is the platform review score. EAS attestations are separate signed credentials that other apps can verify.",
  },
  vi: {
    marketplace: "Chợ bounty",
    dashboard: "Bảng công việc",
    createBounty: "Đăng bounty",
    admin: "Quản trị hệ thống",
    searchTasks: "Tìm kiếm công việc...",
    connectWallet: "Kết nối ví",
    profile: "Hồ sơ",
    reputation: "Uy tín",
    completedTasks: "Bài đã hoàn thành",
    disconnect: "Ngắt kết nối ví",
    language: "Ngôn ngữ",
    theme: "Giao diện",
    lightTheme: "Chuyển sang giao diện sáng",
    darkTheme: "Chuyển sang giao diện tối",
    marketplaceTitle: "Chợ bounty",
    marketplaceDescription: "Khám phá công việc kỹ thuật, ứng tuyển bằng ví và theo dõi tiến độ minh bạch.",
    openBounties: "Bounty đang mở",
    openBountyPool: "Tổng tiền thưởng đang mở",
    activeDevelopers: "Nhà phát triển đang hoạt động",
    opportunities: "cơ hội đang chờ bạn",
    networkNotice: "Base Sepolia · escrow sẽ hoạt động sau khi tích hợp smart contract",
    comments: "Trao đổi về bounty",
    noComments: "Chưa có bình luận. Hãy đặt câu hỏi hoặc trao đổi thêm về yêu cầu.",
    commentPlaceholder: "Đặt câu hỏi hoặc bổ sung thông tin cho bounty này...",
    addComment: "Gửi bình luận",
    signInToComment: "Kết nối ví để bình luận",
    demoComments: "Bình luận mẫu ở chế độ chỉ đọc khi chưa kết nối được cơ sở dữ liệu.",
    clientWorkspace: "Không gian khách hàng",
    switchToClient: "Chuyển sang vai trò Client để đăng bounty",
    developerRoleExplanation: "Tài khoản Developer có thể xem và ứng tuyển. Chọn vai trò Client trong hồ sơ để đăng bounty và quản lý ứng viên.",
    openProfileSettings: "Mở cài đặt hồ sơ",
    describeWork: "Mô tả công việc",
    clearAcceptance: "Nêu rõ tiêu chí nghiệm thu và token thưởng. Bounty sẽ xuất hiện trên marketplace sau khi đăng.",
    titleLabel: "Tiêu đề",
    titleHint: "Đặt tiêu đề cụ thể (10–120 ký tự).",
    descriptionLabel: "Mô tả và tiêu chí nghiệm thu",
    categoryLabel: "Danh mục",
    difficultyLabel: "Độ khó",
    notSpecified: "Không chỉ định",
    skillsLabel: "Kỹ năng cần thiết",
    skillsPlaceholder: "Nhập một kỹ năng hoặc nhiều kỹ năng, cách nhau bằng dấu phẩy",
    bountyAmount: "Mức thưởng",
    allowedRange: "Khoảng cho phép",
    rewardToken: "Token thưởng",
    tokenWhitelist: "Chỉ dùng token có trong danh sách hỗ trợ của nền tảng.",
    estimatedDuration: "Thời lượng dự kiến",
    applicationDeadline: "Hạn ứng tuyển",
    githubRepository: "GitHub repository (không bắt buộc)",
    cancel: "Hủy",
    publishBounty: "Đăng bounty",
    profileHeading: "Hồ sơ của bạn",
    profileIntro: "Giúp khách hàng và nhà phát triển hiểu kinh nghiệm của bạn.",
    displayName: "Tên hiển thị",
    aboutYou: "Giới thiệu về bạn",
    skillsComma: "Kỹ năng (cách nhau bằng dấu phẩy)",
    accountRole: "Vai trò tài khoản",
    developerRole: "Developer · ứng tuyển và bàn giao công việc",
    clientRole: "Client · đăng bounty và chọn nhà phát triển",
    switchRoles: "Bạn có thể đổi vai trò sau. Công việc và phòng chat hiện tại vẫn gắn với tài khoản.",
    saveProfile: "Lưu hồ sơ",
    trustSignals: "Tín hiệu uy tín",
    github: "GitHub",
    verifiableCredentials: "Chứng chỉ có thể xác minh",
    operations: "Vận hành hệ thống",
    manageAccounts: "Quản lý tài khoản và lưu đề xuất xử lý tranh chấp.",
    activeUsers: "Người dùng hoạt động",
    openTasks: "Bounty đang mở",
    inProgress: "Đang thực hiện",
    openDisputes: "Tranh chấp đang mở",
    paidBounties: "Tổng bounty đã thanh toán",
    accounts: "Tài khoản",
    matchingAccounts: "tài khoản phù hợp",
    suspend: "Tạm khóa",
    restore: "Khôi phục",
    disputes: "Tranh chấp",
    reviewDisputes: "Xem bằng chứng và ghi đề xuất trong thời gian khiếu nại.",
    noAccounts: "Không tìm thấy tài khoản.",
    noDisputes: "Không có tranh chấp.",
    signInTitle: "Đăng nhập Bloody-Roar",
    signInWalletDesc: "Kết nối ví trên Base Sepolia và xác nhận chữ ký SIWE",
    web3Wallets: "Ví Web3",
    linkedAccounts: "Tài khoản liên kết",
    socialLoginUnavailable: "Đăng nhập mạng xã hội chưa được kết nối. Hãy đăng nhập bằng ví EVM, sau đó liên kết GitHub trong hồ sơ để xác minh tài khoản.",
    connectBeforePosting: "Kết nối ví trước khi đăng bounty",
    walletSessionPurpose: "Phiên đăng nhập có chữ ký xác định chủ bounty và cho phép bạn quản lý ứng viên, bài bàn giao và luồng escrow sau này.",
    descriptionHint: "Có hỗ trợ Markdown",
    titlePlaceholder: "Ví dụ: Sửa lỗi kết nối ví trên Safari điện thoại",
    descriptionPlaceholder: "Cần thực hiện điều gì? Bạn sẽ xác minh hoàn thành bằng cách nào? Hãy thêm bối cảnh và liên kết cần thiết.",
    difficultyEasy: "Dễ",
    difficultyMedium: "Trung bình",
    difficultyHard: "Khó",
    difficultyExpert: "Chuyên gia",
    skillExample: "Ví dụ: 2–3 ngày",
    deadlineHint: "Chọn ngày trong tương lai",
    avatarUrl: "Đường dẫn ảnh đại diện",
    locationLabel: "Vị trí",
    namePlaceholder: "Tên của bạn",
    locationPlaceholder: "Thành phố, quốc gia hoặc làm việc từ xa",
    bioPlaceholder: "Giới thiệu ngắn về bạn hoặc công việc bạn thường làm.",
    verifiedAs: "Đã xác minh",
    linkGithub: "Liên kết tài khoản GitHub",
    linkGithubDescription: "Liên kết GitHub để xác minh tài khoản dùng cho công việc.",
    profileDetailsStored: "Thông tin hồ sơ được lưu trên Bloody-Roar và hiển thị với người tham gia công việc.",
    wallet: "Ví",
    noExternalCredentials: "Chưa có chứng chỉ bên ngoài. Chứng thực EAS sẽ xuất hiện sau khi tích hợp được bật.",
    platformReputationExplanation: "Uy tín là điểm đánh giá trong nền tảng. Chứng thực EAS là credential có chữ ký riêng để ứng dụng khác xác minh.",
  },
} as const;

type MessageKey = keyof typeof messages.en;

interface UiPreferences {
  language: UiLanguage;
  theme: UiTheme;
  setLanguage: (language: UiLanguage) => void;
  setTheme: (theme: UiTheme) => void;
  t: (key: MessageKey) => string;
}

const defaultPreferences: UiPreferences = {
  language: "en",
  theme: "light",
  setLanguage: () => undefined,
  setTheme: () => undefined,
  t: (key) => messages.en[key],
};

const UiPreferencesContext = createContext<UiPreferences>(defaultPreferences);

function applyPreferences(language: UiLanguage, theme: UiTheme) {
  const root = document.documentElement;
  root.lang = language;
  root.dataset.theme = theme;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
  root.style.colorScheme = theme;
}

export function UiPreferencesProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<UiLanguage>("en");
  const [theme, setThemeState] = useState<UiTheme>("light");

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem("bloody-roar-language");
    const deviceLanguage = window.navigator.language.toLowerCase().startsWith("vi") ? "vi" : "en";
    const nextLanguage: UiLanguage = savedLanguage === "vi" || savedLanguage === "en" ? savedLanguage : deviceLanguage;

    const savedTheme = window.localStorage.getItem("bloody-roar-theme");
    const systemPrefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
    const nextTheme: UiTheme = savedTheme === "dark" || savedTheme === "light" ? savedTheme : systemPrefersDark ? "dark" : "light";

    setLanguageState(nextLanguage);
    setThemeState(nextTheme);
    applyPreferences(nextLanguage, nextTheme);
  }, []);

  const setLanguage = useCallback((next: UiLanguage) => {
    setLanguageState(next);
    window.localStorage.setItem("bloody-roar-language", next);
    applyPreferences(next, theme);
  }, [theme]);

  const setTheme = useCallback((next: UiTheme) => {
    setThemeState(next);
    window.localStorage.setItem("bloody-roar-theme", next);
    applyPreferences(language, next);
  }, [language]);

  const value = useMemo<UiPreferences>(() => ({
    language,
    theme,
    setLanguage,
    setTheme,
    t: (key) => messages[language][key],
  }), [language, theme, setLanguage, setTheme]);

  return <UiPreferencesContext.Provider value={value}>{children}</UiPreferencesContext.Provider>;
}

export function useUiPreferences() {
  return useContext(UiPreferencesContext);
}
