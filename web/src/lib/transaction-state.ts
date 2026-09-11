import {
  BaseError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  type Abi,
  type Hash,
} from "viem";
import { membershipTierAbi } from "@/contracts";

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
  | "uncertain"
  | "cancelled"
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
  | { type: "RESET" }
  | { type: "SIMULATE" }
  | { type: "SIMULATED"; approvalRequired: boolean }
  | { type: "APPROVED" }
  | { type: "SIGN" }
  | { type: "SIGNED" }
  | { type: "SUBMITTED"; hash: Hash }
  | { type: "CONFIRM" }
  | { type: "RECONCILE" }
  | { type: "RECONCILED" }
  | {
      type: "REPLACED";
      replacementHash: Hash;
      reason: "repriced" | "replaced" | "cancelled";
    }
  | { type: "UNCERTAIN"; error: string }
  | { type: "CANCELLED"; error: string }
  | { type: "REVERTED"; error: string }
  | { type: "FAILED"; error: string }
  | { type: "RETRY" };

export const initialTransactionState: TransactionState = {
  phase: "idle",
  message: "Ready when you are.",
};

export function isTransactionInFlight(phase: TransactionPhase) {
  return [
    "simulation",
    "approval",
    "signature",
    "submission",
    "confirmation",
    "reconciliation",
    "replacement",
  ].includes(phase);
}

export function transactionReducer(
  state: TransactionState,
  event: TransactionEvent,
): TransactionState {
  switch (event.type) {
    case "RESET":
      return initialTransactionState;
    case "SIMULATE":
      return { phase: "simulation", message: "Checking the transaction." };
    case "SIMULATED":
      return event.approvalRequired
        ? {
            phase: "approval",
            message: "Payment-token approval is required first.",
          }
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
        message: "Confirmed. Finishing the check.",
      };
    case "RECONCILE":
      return {
        ...state,
        phase: "reconciliation",
        message: "Finishing the check.",
      };
    case "RECONCILED":
      return {
        ...state,
        phase: "confirmed",
        message: "Complete.",
        error: undefined,
      };
    case "REPLACED":
      return {
        ...state,
        phase: "replacement",
        message:
          event.reason === "cancelled"
            ? "Your wallet submitted a cancellation. Waiting for it to finish."
            : "Your wallet replaced this action. Waiting for it to finish.",
        replacementHash: event.replacementHash,
      };
    case "UNCERTAIN":
      return {
        ...state,
        phase: "uncertain",
        message:
          "The final result is not clear yet. Check your wallet and refresh before continuing.",
        error: event.error,
      };
    case "CANCELLED":
      return {
        ...state,
        phase: "cancelled",
        message: "This action was cancelled.",
        error: event.error,
      };
    case "REVERTED":
      return {
        ...state,
        phase: "reverted",
        message: "This action was rejected.",
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
      if (reverted.data?.errorName === "ClaimAccountingBehind")
        return "Membership accounting needs to catch up. Review the refreshed action to continue.";
      if (reverted.data?.errorName === "ClaimFailed") {
        const reason = reverted.data.args?.[2];
        if (typeof reason === "string" && reason.startsWith("0x")) {
          try {
            const underlying = decodeErrorResult({
              abi: membershipTierAbi as Abi,
              data: reason as `0x${string}`,
            });
            const detail =
              underlying.errorName === "Error"
                ? String(underlying.args?.[0])
                : underlying.errorName.replace(/([a-z])([A-Z])/g, "$1 $2");
            return `${detail}. No funds were claimed.`;
          } catch {
            // Unknown external token errors are not necessarily in the tier ABI.
            return "The payment could not be completed. No funds were claimed.";
          }
        }
        return "The payment could not be completed. No funds were claimed.";
      }
      if (reverted.data?.errorName === "MinimumPaymentChanged")
        return "The currency minimum changed. Refresh and review the membership terms before publishing.";
      if (reverted.data?.errorName === "PaymentBelowMinimum")
        return "This payment is below the membership minimum. Review the minimum amount and try again.";
      if (reverted.data?.errorName === "AccountingBehind")
        return "Membership accounting needs to catch up. Advance accounting, refresh this action and try again.";
      return reverted.reason || reverted.shortMessage;
    }
    return error.shortMessage;
  }

  if (error instanceof Error && error.message.trim()) return error.message;
  return "The transaction failed for an unknown reason.";
}
