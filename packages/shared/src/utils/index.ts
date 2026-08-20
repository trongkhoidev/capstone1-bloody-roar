// packages/shared/src/utils/index.ts
// Shared utility functions

import { z } from "zod";

// =============================================================================
// WALLET / ADDRESS
// =============================================================================

/** Normalize an Ethereum address to checksum format */
export function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

/** Check if a string is a valid Ethereum address */
export function isValidAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

/** Shorten an address for display: 0x1234...5678 */
export function shortenAddress(address: string, chars = 4): string {
  if (!isValidAddress(address)) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

// =============================================================================
// CURRENCY
// =============================================================================

/** Format a number as USDT */
export function formatUSDT(amount: number | string | bigint): string {
  const num = typeof amount === "bigint" ? Number(amount) / 1e6 : Number(amount);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
    .format(num)
    .replace("$", "")
    .trim() + " USDT";
}

// =============================================================================
// DATE / TIME
// =============================================================================

/** Format a date to a relative time string */
export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

/** Calculate days remaining until a deadline */
export function daysUntil(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// =============================================================================
// FILE SIZE
// =============================================================================

/** Format bytes to human-readable file size */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// =============================================================================
// VALIDATION SCHEMAS (Zod)
// =============================================================================

export const createIssueSchema = z.object({
  title: z.string().min(10, "Title must be at least 10 characters").max(200),
  description: z.string().min(50, "Description must be at least 50 characters"),
  category: z.enum([
    "BUG_FIX", "FEATURE", "SMART_CONTRACT", "AUDIT",
    "UI_UX", "DATA_SCIENCE", "DEVOPS", "DOCUMENTATION", "OTHER",
  ]),
  bountyAmount: z.number().min(10, "Minimum bounty is 10 USDT").max(100_000),
  requiredSkills: z.array(z.string()).min(1, "Add at least one required skill").max(10),
  difficulty: z.enum(["Easy", "Medium", "Hard", "Expert"]).optional(),
  timeEstimate: z.string().max(50).optional(),
});

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  bio: z.string().max(500).optional(),
  skills: z.array(z.string()).max(20).optional(),
  location: z.string().max(100).optional(),
});

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(10_000),
  issueId: z.string().min(1),
  type: z.enum(["TEXT", "FILE"]).default("TEXT"),
  fileUrl: z.string().url().optional(),
  fileName: z.string().max(255).optional(),
  fileSize: z.number().int().positive().optional(),
  fileMime: z.string().max(100).optional(),
});

export const applyIssueSchema = z.object({
  issueId: z.string().min(1),
  message: z.string().min(20, "Please write at least 20 characters").max(1000).optional(),
});

export type CreateIssueInput = z.infer<typeof createIssueSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ApplyIssueInput = z.infer<typeof applyIssueSchema>;
