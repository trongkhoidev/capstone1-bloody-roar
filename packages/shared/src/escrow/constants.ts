// packages/shared/src/escrow/constants.ts
// Số trên chuỗi lấy từ BloodyRoarEscrow.sol. test/escrow-core/constants.test.ts đối chiếu với contract để bắt lệch.
// Số ngoài chuỗi (reservation, intent, deadline tối đa) theo QĐ-16, QĐ-18, QĐ-19.
export const ESCROW_CONSTANTS = {
  REVIEW_DAYS: 7,
  EVIDENCE_HOURS: 72,
  CHALLENGE_DAYS: 7,
  FINAL_NOTICE_HOURS: 24,
  ARBITER_STALL_DAYS: 30,
  FEE_BPS: 250,
  MAX_DELIVERY_DAYS: 180,
  RESERVATION_HOURS: 24,
  INTENT_MINUTES: 30,
} as const;
