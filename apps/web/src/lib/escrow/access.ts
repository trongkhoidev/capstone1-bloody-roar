export type EscrowAction = "DEPOSIT" | "RELEASE" | "CANCEL" | "DISPUTE";

type EscrowParticipants = {
  clientId: string;
  developerId: string;
};

export class EscrowAccessError extends Error {
  readonly code = "FORBIDDEN";

  constructor(message: string) {
    super(message);
    this.name = "EscrowAccessError";
  }
}

export function assertEscrowAccess(
  userId: string,
  action: EscrowAction,
  escrow: EscrowParticipants,
): void {
  if (action === "DEPOSIT" || action === "RELEASE") {
    if (escrow.clientId !== userId) {
      throw new EscrowAccessError("Only the escrow client can perform this action");
    }
    return;
  }
  if (escrow.clientId !== userId && escrow.developerId !== userId) {
    throw new EscrowAccessError("Only escrow participants can perform this action");
  }
}
