import type { Hash, PublicClient } from "viem";

import {
  decodeTransactionError,
  type TransactionEvent,
} from "@/lib/transaction-state";

export type Replacement = {
  hash: Hash;
  reason: "repriced" | "replaced" | "cancelled";
};

export type WriteReceipt = {
  status: "success" | "reverted" | "cancelled";
};

export async function waitForWriteReceipt(
  client: PublicClient,
  hash: Hash,
  onReplaced: (replacement: Replacement) => void,
): Promise<WriteReceipt> {
  let cancelled = false;
  const receipt = await client.waitForTransactionReceipt({
    hash,
    onReplaced: (replacement) => {
      cancelled ||= replacement.reason === "cancelled";
      onReplaced({
        hash: replacement.transaction.hash,
        reason: replacement.reason,
      });
    },
  });
  return { status: cancelled ? "cancelled" : receipt.status };
}

export async function reconcileTransaction<Result>(input: {
  reconcile: () => Promise<Result | undefined>;
  dispatch: (event: TransactionEvent) => void;
  priorError?: string;
}): Promise<Result | undefined> {
  input.dispatch({ type: "RECONCILE" });
  try {
    const result = await input.reconcile();
    if (result === undefined) {
      input.dispatch({
        type: "UNCERTAIN",
        error:
          input.priorError ??
          "The requested postcondition is not visible at the latest checked block.",
      });
      return undefined;
    }
    input.dispatch({ type: "RECONCILED" });
    return result;
  } catch (error) {
    const detail = decodeTransactionError(error);
    input.dispatch({
      type: "UNCERTAIN",
      error: input.priorError ? `${input.priorError} ${detail}` : detail,
    });
    return undefined;
  }
}

export async function executeTransaction<
  Request,
  Result,
  ApprovalRequest = never,
>(input: {
  simulate: () => Promise<Request>;
  submit: (request: Request) => Promise<Hash>;
  wait: (
    hash: Hash,
    onReplaced: (replacement: Replacement) => void,
  ) => Promise<WriteReceipt>;
  reconcile: () => Promise<Result | undefined>;
  dispatch: (event: TransactionEvent) => void;
  approval?: {
    simulate: () => Promise<ApprovalRequest>;
    submit: (request: ApprovalRequest) => Promise<Hash>;
    wait: (
      hash: Hash,
      onReplaced: (replacement: Replacement) => void,
    ) => Promise<WriteReceipt>;
  };
}): Promise<Result | undefined> {
  let stage: "before-submit" | "approval-submitted" | "submitted" =
    "before-submit";

  try {
    input.dispatch({ type: "SIMULATE" });
    if (input.approval) {
      const approvalRequest = await input.approval.simulate();
      input.dispatch({ type: "SIMULATED", approvalRequired: true });
      const approvalHash = await input.approval.submit(approvalRequest);
      stage = "approval-submitted";
      input.dispatch({ type: "SUBMITTED", hash: approvalHash });
      const approvalReceipt = await input.approval.wait(
        approvalHash,
        (replacement) =>
          input.dispatch({
            type: "REPLACED",
            replacementHash: replacement.hash,
            reason: replacement.reason,
          }),
      );
      if (approvalReceipt.status === "cancelled") {
        input.dispatch({
          type: "CANCELLED",
          error: "The wallet cancelled the USDG approval replacement.",
        });
        return undefined;
      }
      if (approvalReceipt.status === "reverted") {
        input.dispatch({
          type: "REVERTED",
          error: "The USDG approval reverted onchain.",
        });
        return undefined;
      }
      stage = "before-submit";
      input.dispatch({ type: "APPROVED" });
      // Approval confirmation proves only the allowance write. Failures from
      // this point until the protected write is submitted are safe to retry.
    }
    const request = await input.simulate();
    if (!input.approval) {
      input.dispatch({ type: "SIMULATED", approvalRequired: false });
    }
    input.dispatch({ type: "SIGN" });
    const hash = await input.submit(request);
    stage = "submitted";
    input.dispatch({ type: "SIGNED" });
    input.dispatch({ type: "SUBMITTED", hash });
    const receipt = await input.wait(hash, (replacement) =>
      input.dispatch({
        type: "REPLACED",
        replacementHash: replacement.hash,
        reason: replacement.reason,
      }),
    );
    if (receipt.status === "cancelled") {
      input.dispatch({
        type: "CANCELLED",
        error: "The wallet cancelled the action replacement.",
      });
      return undefined;
    }
    if (receipt.status === "reverted") {
      input.dispatch({
        type: "REVERTED",
        error: "The confirmed transaction reverted onchain.",
      });
      return undefined;
    }
    input.dispatch({ type: "CONFIRM" });
    return reconcileTransaction({
      dispatch: input.dispatch,
      reconcile: input.reconcile,
    });
  } catch (error) {
    const detail = decodeTransactionError(error);
    if (stage === "submitted") {
      return reconcileTransaction({
        dispatch: input.dispatch,
        reconcile: input.reconcile,
        priorError: detail,
      });
    }
    input.dispatch({
      type: "FAILED",
      error:
        stage === "approval-submitted"
          ? `${detail} No protected action was submitted; recheck the USDG allowance before continuing.`
          : detail,
    });
    return undefined;
  }
}
