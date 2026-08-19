// packages/shared/src/types/index.ts
// Shared TypeScript types across the monorepo (FE + BE)

// =============================================================================
// PAGINATION
// =============================================================================

export interface PaginationArgs {
  first?: number;
  after?: string; // cursor
  last?: number;
  before?: string;
}

export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string;
  endCursor?: string;
}

export interface Connection<T> {
  edges: Array<Edge<T>>;
  pageInfo: PageInfo;
  totalCount: number;
}

export interface Edge<T> {
  node: T;
  cursor: string;
}

// =============================================================================
// API RESPONSES
// =============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// =============================================================================
// SOCKET.IO EVENTS
// =============================================================================

export type ServerToClientEvents = {
  // Chat
  "message:new": (data: ChatMessagePayload) => void;
  "message:modified": (data: ChatMessagePayload) => void; // AI Guard modified

  // Notifications
  "notification:new": (data: NotificationPayload) => void;

  // Escrow
  "escrow:status": (data: EscrowStatusPayload) => void;
};

export type ClientToServerEvents = {
  // Chat
  "message:send": (data: SendMessagePayload, callback: (err?: string) => void) => void;

  // Room management
  "task:join": (issueId: string) => void;
  "task:leave": (issueId: string) => void;
};

export interface ChatMessagePayload {
  id: string;
  content: string;
  type: "TEXT" | "FILE";
  senderId: string;
  senderName?: string;
  senderAvatar?: string;
  issueId: string;
  wasModified: boolean;
  fileUrl?: string;
  fileName?: string;
  createdAt: string;
}

export interface SendMessagePayload {
  content: string;
  type: "TEXT" | "FILE";
  issueId: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  fileMime?: string;
}

export interface NotificationPayload {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  createdAt: string;
}

export interface EscrowStatusPayload {
  issueId: string;
  status: string;
  txHash?: string;
}

// =============================================================================
// UPLOAD
// =============================================================================

export interface PresignedUrlResponse {
  uploadUrl: string;
  fileUrl: string;
  key: string;
  expiresAt: number;
}
