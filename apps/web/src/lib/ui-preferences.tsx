"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type UiLanguage = "en" | "vi";
export type UiTheme = "light" | "dark";

const messages = {
  en: {
    marketplace: "Bounties",
    dashboard: "My work",
    createBounty: "Post bounty",
    admin: "Operations",
    searchTasks: "Search bounties...",
    connectWallet: "Connect wallet",
    profile: "Profile",
    reputation: "Reputation",
    completedTasks: "Completed bounties",
    disconnect: "Disconnect wallet",
    language: "Language",
    theme: "Theme",
    preferences: "Preferences",
    light: "Light",
    dark: "Dark",
    lightTheme: "Use light theme",
    darkTheme: "Use dark theme",
    marketplaceTitle: "Bounties",
    marketplaceDescription: "Engineering work with the reward held in escrow. Apply with your wallet.",
    openBounties: "Open bounties",
    openBountyPool: "Rewards in open bounties",
    activeDevelopers: "Active developers",
    opportunities: "bounties to apply for",
    networkNotice: "Base Sepolia · escrow contract not connected yet",
    comments: "Discussion",
    noComments: "No questions yet. Ask the first one.",
    commentPlaceholder: "Ask about scope, criteria or timing...",
    addComment: "Post comment",
    signInToComment: "Connect a wallet to join the discussion",
    demoComments: "Showing sample comments. The database is unavailable, so replies are read-only.",
    clientWorkspace: "Client workspace",
    switchToClient: "Switch to a client account to post bounties",
    developerRoleExplanation: "Developer accounts browse and apply. To post a bounty and review applicants, switch to the client role in your profile.",
    openProfileSettings: "Open profile settings",
    describeWork: "Describe the work",
    clearAcceptance: "Write the acceptance criteria and pick a reward token. The bounty goes live on the marketplace as soon as you publish.",
    titleLabel: "Title",
    titleHint: "10–120 characters. Say what gets built or fixed.",
    descriptionLabel: "Scope and acceptance criteria",
    categoryLabel: "Category",
    difficultyLabel: "Difficulty",
    notSpecified: "Not set",
    skillsLabel: "Required skills",
    skillsPlaceholder: "Add skills, separated by commas",
    bountyAmount: "Reward amount",
    allowedRange: "Allowed range",
    rewardToken: "Reward token",
    tokenWhitelist: "Only tokens on the platform whitelist are accepted.",
    estimatedDuration: "Estimated duration",
    applicationDeadline: "Application deadline",
    githubRepository: "GitHub repository (optional)",
    cancel: "Cancel",
    publishBounty: "Publish bounty",
    profileHeading: "Your profile",
    profileIntro: "Clients and developers see this before they work with you.",
    displayName: "Display name",
    aboutYou: "About you",
    skillsComma: "Skills (comma separated)",
    accountRole: "Account role",
    developerRole: "Developer · apply and deliver",
    clientRole: "Client · post bounties and hire",
    switchRoles: "You can switch later. Assigned bounties and chat rooms stay on your account.",
    saveProfile: "Save profile",
    trustSignals: "Trust signals",
    github: "GitHub",
    verifiableCredentials: "Verifiable credentials",
    operations: "Operations",
    manageAccounts: "Suspend or restore accounts and log ruling proposals.",
    activeUsers: "Active users",
    openTasks: "Open bounties",
    inProgress: "In progress",
    openDisputes: "Open disputes",
    paidBounties: "Rewards paid out",
    accounts: "Accounts",
    matchingAccounts: "matching accounts",
    suspend: "Suspend",
    restore: "Restore",
    disputes: "Disputes",
    reviewDisputes: "Review evidence and record a proposal before the challenge window closes.",
    noAccounts: "No accounts found.",
    noDisputes: "No open disputes.",
    signInTitle: "Sign in to Bloody-Roar",
    signInWalletDesc: "Connect a wallet on Base Sepolia and sign the SIWE message.",
    web3Wallets: "Web3 wallets",
    linkedAccounts: "Linked accounts",
    socialLoginUnavailable: "Social sign-in is not available yet. Sign in with an EVM wallet, then link GitHub in your profile to verify your account.",
    connectBeforePosting: "Connect a wallet before posting",
    walletSessionPurpose: "Your signed wallet session proves you own the bounty. It also covers applicants, deliveries and escrow actions.",
    descriptionHint: "Markdown is supported",
    titlePlaceholder: "e.g. Fix wallet connection on mobile Safari",
    descriptionPlaceholder: "What needs doing, and how will you know it is done? Add context and links.",
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
    bioPlaceholder: "What you build and what you have shipped.",
    verifiedAs: "Verified as",
    linkGithub: "Link GitHub account",
    linkGithubDescription: "Link GitHub to prove which account does your project work.",
    profileDetailsStored: "Bloody-Roar stores these details and shows them to people on your bounties.",
    wallet: "Wallet",
    noExternalCredentials: "No external credentials yet. EAS attestations will appear once that integration is on.",
    platformReputationExplanation: "Reputation is the score from platform reviews. EAS attestations are separate signed credentials other apps can verify.",
  },
  vi: {
    marketplace: "Bounty",
    dashboard: "Việc của tôi",
    createBounty: "Đăng bounty",
    admin: "Vận hành",
    searchTasks: "Tìm bounty, kỹ năng...",
    connectWallet: "Kết nối ví",
    profile: "Hồ sơ",
    reputation: "Uy tín",
    completedTasks: "Bounty đã hoàn thành",
    disconnect: "Ngắt kết nối ví",
    language: "Ngôn ngữ",
    theme: "Giao diện",
    preferences: "Cài đặt hiển thị",
    light: "Sáng",
    dark: "Tối",
    lightTheme: "Dùng giao diện sáng",
    darkTheme: "Dùng giao diện tối",
    marketplaceTitle: "Bounty",
    marketplaceDescription: "Công việc kỹ thuật với tiền thưởng được khóa trong escrow. Ứng tuyển bằng ví của bạn.",
    openBounties: "Bounty đang mở",
    openBountyPool: "Tiền thưởng đang mở",
    activeDevelopers: "Developer đang hoạt động",
    opportunities: "bounty chờ bạn ứng tuyển",
    networkNotice: "Base Sepolia · escrow chưa kết nối smart contract",
    comments: "Thảo luận",
    noComments: "Chưa có câu hỏi nào. Hỏi đầu tiên đi.",
    commentPlaceholder: "Hỏi về phạm vi, tiêu chí hoặc thời hạn...",
    addComment: "Đăng bình luận",
    signInToComment: "Kết nối ví để tham gia thảo luận",
    demoComments: "Đang hiện bình luận mẫu. Chưa kết nối được cơ sở dữ liệu nên chỉ xem được.",
    clientWorkspace: "Không gian Client",
    switchToClient: "Chuyển sang tài khoản Client để đăng bounty",
    developerRoleExplanation: "Tài khoản Developer xem và ứng tuyển bounty. Muốn đăng bounty và duyệt ứng viên, đổi sang vai trò Client trong hồ sơ.",
    openProfileSettings: "Mở cài đặt hồ sơ",
    describeWork: "Mô tả công việc",
    clearAcceptance: "Ghi rõ tiêu chí nghiệm thu và chọn token thưởng. Bounty lên marketplace ngay sau khi bạn đăng.",
    titleLabel: "Tiêu đề",
    titleHint: "10–120 ký tự. Ghi rõ việc cần làm hoặc cần sửa.",
    descriptionLabel: "Phạm vi và tiêu chí nghiệm thu",
    categoryLabel: "Danh mục",
    difficultyLabel: "Độ khó",
    notSpecified: "Chưa chọn",
    skillsLabel: "Kỹ năng cần thiết",
    skillsPlaceholder: "Thêm kỹ năng, cách nhau bằng dấu phẩy",
    bountyAmount: "Mức thưởng",
    allowedRange: "Khoảng cho phép",
    rewardToken: "Token thưởng",
    tokenWhitelist: "Chỉ nhận token có trong danh sách của nền tảng.",
    estimatedDuration: "Thời lượng dự kiến",
    applicationDeadline: "Hạn ứng tuyển",
    githubRepository: "Repo GitHub (không bắt buộc)",
    cancel: "Hủy",
    publishBounty: "Đăng bounty",
    profileHeading: "Hồ sơ của bạn",
    profileIntro: "Client và developer sẽ đọc phần này trước khi làm việc với bạn.",
    displayName: "Tên hiển thị",
    aboutYou: "Giới thiệu về bạn",
    skillsComma: "Kỹ năng (cách nhau bằng dấu phẩy)",
    accountRole: "Vai trò tài khoản",
    developerRole: "Developer · ứng tuyển và bàn giao",
    clientRole: "Client · đăng bounty và thuê developer",
    switchRoles: "Đổi vai trò lúc nào cũng được. Bounty đang làm và phòng chat vẫn giữ nguyên.",
    saveProfile: "Lưu hồ sơ",
    trustSignals: "Tín hiệu uy tín",
    github: "GitHub",
    verifiableCredentials: "Chứng chỉ có thể xác minh",
    operations: "Vận hành",
    manageAccounts: "Khóa hoặc mở tài khoản, ghi đề xuất xử lý tranh chấp.",
    activeUsers: "Người dùng hoạt động",
    openTasks: "Bounty đang mở",
    inProgress: "Đang thực hiện",
    openDisputes: "Tranh chấp đang mở",
    paidBounties: "Tiền thưởng đã thanh toán",
    accounts: "Tài khoản",
    matchingAccounts: "tài khoản phù hợp",
    suspend: "Tạm khóa",
    restore: "Khôi phục",
    disputes: "Tranh chấp",
    reviewDisputes: "Xem bằng chứng và ghi đề xuất trước khi hết thời hạn khiếu nại.",
    noAccounts: "Không tìm thấy tài khoản.",
    noDisputes: "Không có tranh chấp đang mở.",
    signInTitle: "Đăng nhập Bloody-Roar",
    signInWalletDesc: "Kết nối ví trên Base Sepolia, rồi ký thông điệp SIWE.",
    web3Wallets: "Ví Web3",
    linkedAccounts: "Tài khoản liên kết",
    socialLoginUnavailable: "Chưa hỗ trợ đăng nhập mạng xã hội. Đăng nhập bằng ví EVM, rồi liên kết GitHub trong hồ sơ để xác minh.",
    connectBeforePosting: "Kết nối ví trước khi đăng bounty",
    walletSessionPurpose: "Phiên ví đã ký xác nhận bạn là chủ bounty. Phiên này cũng dùng để quản lý ứng viên, bài bàn giao và escrow.",
    descriptionHint: "Có hỗ trợ Markdown",
    titlePlaceholder: "Ví dụ: Sửa lỗi kết nối ví trên Safari điện thoại",
    descriptionPlaceholder: "Cần làm gì, và làm sao biết là xong? Thêm bối cảnh và liên kết nếu có.",
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
    bioPlaceholder: "Bạn làm gì và đã giao những sản phẩm nào.",
    verifiedAs: "Đã xác minh",
    linkGithub: "Liên kết tài khoản GitHub",
    linkGithubDescription: "Liên kết GitHub để chứng minh tài khoản nào làm việc cho bạn.",
    profileDetailsStored: "Bloody-Roar lưu thông tin này và hiển thị cho người cùng làm bounty với bạn.",
    wallet: "Ví",
    noExternalCredentials: "Chưa có chứng chỉ bên ngoài. Chứng thực EAS sẽ hiện khi bật tích hợp.",
    platformReputationExplanation: "Uy tín là điểm từ đánh giá trên nền tảng. Chứng thực EAS là chứng chỉ có chữ ký riêng, ứng dụng khác có thể xác minh.",
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
  if (typeof document !== "undefined" && document.body) {
    document.body.dataset.theme = theme;
    document.body.classList.toggle("dark", theme === "dark");
    document.body.classList.toggle("light", theme === "light");
  }
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
