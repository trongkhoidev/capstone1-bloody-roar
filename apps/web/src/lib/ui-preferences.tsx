"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ACTIVE_CHAIN } from "@/lib/web3/client";

export type UiTheme = "light" | "dark";

const messages = {
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
  networkNotice: `${ACTIVE_CHAIN.name} · escrow contract not connected yet`,
  comments: "Discussion",
  noComments: "No questions yet. Ask the first one.",
  noIssuesYet: "No bounties yet.",
  commentPlaceholder: "Ask about scope, criteria or timing...",
  addComment: "Post comment",
  signInToComment: "Connect a wallet to join the discussion",
  adminCannotCreateIssue: "Admin accounts cannot post tasks.",
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
  signInWalletDesc: `Connect a wallet on ${ACTIVE_CHAIN.name} and sign the SIWE message.`,
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
} as const;

type MessageKey = keyof typeof messages;

interface UiPreferences {
  theme: UiTheme;
  setTheme: (theme: UiTheme) => void;
  t: (key: MessageKey) => string;
}

const defaultPreferences: UiPreferences = {
  theme: "light",
  setTheme: () => undefined,
  t: (key) => messages[key] ?? "",
};

const UiPreferencesContext = createContext<UiPreferences>(defaultPreferences);

function applyPreferences(theme: UiTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.lang = "en";
  root.dataset.theme = theme;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
  root.style.colorScheme = theme;
  if (document.body) {
    document.body.dataset.theme = theme;
    document.body.classList.toggle("dark", theme === "dark");
    document.body.classList.toggle("light", theme === "light");
  }
}

export function UiPreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<UiTheme>("light");

  useEffect(() => {
    // Clean up any legacy language preference
    try {
      window.localStorage.removeItem("bloody-roar-language");
    } catch {
      // Ignore localStorage access restrictions
    }

    const savedTheme = window.localStorage.getItem("bloody-roar-theme");
    const systemPrefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
    const nextTheme: UiTheme = savedTheme === "dark" || savedTheme === "light" ? savedTheme : systemPrefersDark ? "dark" : "light";

    setThemeState(nextTheme);
    applyPreferences(nextTheme);
  }, []);

  const setTheme = useCallback((next: UiTheme) => {
    setThemeState(next);
    window.localStorage.setItem("bloody-roar-theme", next);
    applyPreferences(next);
  }, []);

  const value = useMemo<UiPreferences>(() => ({
    theme,
    setTheme,
    t: (key) => messages[key] ?? "",
  }), [theme, setTheme]);

  return <UiPreferencesContext.Provider value={value}>{children}</UiPreferencesContext.Provider>;
}

export function useUiPreferences() {
  return useContext(UiPreferencesContext);
}
