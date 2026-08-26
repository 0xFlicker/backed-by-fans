import type { Hash } from "viem";

import {
  decodeTransactionError,
  type TransactionEvent,
} from "@/lib/transaction-state";

export type WriteReceipt = { status: "success" | "reverted" };

export async function executeTransaction<
  Request,
  Result,
  ApprovalRequest = never,
>(input: {
  simulate: () => Promise<Request>;
  submit: (request: Request) => Promise<Hash>;
  wait: (
    hash: Hash,
    onReplaced: (replacementHash: Hash) => void,
  ) => Promise<WriteReceipt>;
  reconcile: () => Promise<Result>;
  dispatch: (event: TransactionEvent) => void;
  approval?: {
    simulate: () => Promise<ApprovalRequest>;
    submit: (request: ApprovalRequest) => Promise<Hash>;
    wait: (
      hash: Hash,
      onReplaced: (replacementHash: Hash) => void,
    ) => Promise<WriteReceipt>;
  };
}): Promise<Result | undefined> {
  let stage: "before-submit" | "submitted" | "confirmed" = "before-submit";

  try {
    input.dispatch({ type: "SIMULATE" });
    if (input.approval) {
      const approvalRequest = await input.approval.simulate();
      input.dispatch({ type: "SIMULATED", approvalRequired: true });
      const approvalHash = await input.approval.submit(approvalRequest);
      stage = "submitted";
      input.dispatch({ type: "SUBMITTED", hash: approvalHash });
      const approvalReceipt = await input.approval.wait(
        approvalHash,
        (replacementHash) =>
          input.dispatch({ type: "REPLACED", replacementHash }),
      );
      if (approvalReceipt.status === "reverted") {
        input.dispatch({
          type: "REVERTED",
          error: "The USDG approval reverted onchain.",
        });
        return undefined;
      }
      stage = "confirmed";
      input.dispatch({ type: "APPROVED" });
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
    const receipt = await input.wait(hash, (replacementHash) =>
      input.dispatch({ type: "REPLACED", replacementHash }),
    );
    if (receipt.status === "reverted") {
      input.dispatch({
        type: "REVERTED",
        error: "The confirmed transaction reverted onchain.",
      });
      return undefined;
    }
    stage = "confirmed";
    input.dispatch({ type: "CONFIRM" });
    input.dispatch({ type: "RECONCILE" });
    const result = await input.reconcile();
    input.dispatch({ type: "RECONCILED" });
    return result;
  } catch (error) {
    input.dispatch({
      type: stage === "submitted" ? "DROPPED" : "FAILED",
      error: decodeTransactionError(error),
    });
    return undefined;
  }
}
