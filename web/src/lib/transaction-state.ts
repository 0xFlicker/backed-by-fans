import { BaseError, ContractFunctionRevertedError, type Hash } from "viem";

export type TransactionPhase =
  | "idle"
  | "simulation"
  | "approval"
  | "signature"
  | "submission"
  | "confirmation"
  | "reconciliation"
  | "confirmed"
  | "replacement"
  | "dropped"
  | "reverted"
  | "retry";

export type TransactionState = {
  phase: TransactionPhase;
  message: string;
  hash?: Hash;
  replacementHash?: Hash;
  error?: string;
};

export type TransactionEvent =
  | { type: "SIMULATE" }
  | { type: "SIMULATED"; approvalRequired: boolean }
  | { type: "APPROVED" }
  | { type: "SIGN" }
  | { type: "SIGNED" }
  | { type: "SUBMITTED"; hash: Hash }
  | { type: "CONFIRM" }
  | { type: "RECONCILE" }
  | { type: "RECONCILED" }
  | { type: "REPLACED"; replacementHash: Hash }
  | { type: "DROPPED"; error: string }
  | { type: "REVERTED"; error: string }
  | { type: "FAILED"; error: string }
  | { type: "RETRY" };

export const initialTransactionState: TransactionState = {
  phase: "idle",
  message: "Ready when you are.",
};

export function transactionReducer(
  state: TransactionState,
  event: TransactionEvent,
): TransactionState {
  switch (event.type) {
    case "SIMULATE":
      return { phase: "simulation", message: "Checking the transaction." };
    case "SIMULATED":
      return event.approvalRequired
        ? { phase: "approval", message: "USDG approval is required first." }
        : { phase: "signature", message: "Ready for your wallet signature." };
    case "APPROVED":
    case "SIGN":
      return { phase: "signature", message: "Confirm in your wallet." };
    case "SIGNED":
      return { phase: "submission", message: "Submitting to Robinhood Chain." };
    case "SUBMITTED":
      return {
        phase: "confirmation",
        message: "Submitted. Waiting for confirmation.",
        hash: event.hash,
      };
    case "CONFIRM":
      return {
        ...state,
        phase: "confirmation",
        message: "Confirmed onchain. Checking the resulting state.",
      };
    case "RECONCILE":
      return {
        ...state,
        phase: "reconciliation",
        message: "Reconciling with a fresh onchain read.",
      };
    case "RECONCILED":
      return {
        ...state,
        phase: "confirmed",
        message: "Complete and reconciled onchain.",
      };
    case "REPLACED":
      return {
        ...state,
        phase: "replacement",
        message:
          "Your wallet replaced this transaction. Tracking the new hash.",
        replacementHash: event.replacementHash,
      };
    case "DROPPED":
      return {
        ...state,
        phase: "dropped",
        message: "The transaction was dropped before confirmation.",
        error: event.error,
      };
    case "REVERTED":
      return {
        ...state,
        phase: "reverted",
        message: "The contract rejected this transaction.",
        error: event.error,
      };
    case "FAILED":
      return {
        ...state,
        phase: "retry",
        message:
          "The transaction did not complete. Review the reason and retry.",
        error: event.error,
      };
    case "RETRY":
      return {
        phase: "simulation",
        message: "Checking the transaction again.",
      };
  }
}

export function decodeTransactionError(error: unknown): string {
  if (error instanceof BaseError) {
    const reverted = error.walk(
      (cause) => cause instanceof ContractFunctionRevertedError,
    );
    if (reverted instanceof ContractFunctionRevertedError) {
      return reverted.reason || reverted.shortMessage;
    }
    return error.shortMessage;
  }

  if (error instanceof Error && error.message.trim()) return error.message;
  return "The transaction failed for an unknown reason.";
}
