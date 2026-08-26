import type { DeploymentAvailability } from "@/lib/config";

export type ReadState<T> =
  | { status: "loading"; label: string }
  | {
      status: "valid";
      data: T;
      capturedBlock: bigint;
      label?: string;
    }
  | {
      status: "stale";
      data: T;
      capturedBlock: bigint;
      latestBlock: bigint;
      label: string;
    }
  | {
      status: "partial";
      data?: Partial<T>;
      capturedBlock?: bigint;
      missing: string[];
      reason: "missing-multicall" | "incomplete-response";
      label: string;
    }
  | {
      status: "wrong-chain";
      expectedChainId: number;
      actualChainId: number;
      label: string;
    }
  | {
      status: "unavailable";
      reason: "not-deployed" | "rpc-unavailable" | "token-unconfirmed";
      label: string;
    }
  | { status: "rate-limited"; label: string; retryAfter?: number }
  | { status: "invalid-address"; value: string; label: string }
  | {
      status: "interface-mismatch";
      address: string;
      label: string;
      failedChecks: string[];
    };

export function classifyReadError(
  error: unknown,
):
  | { status: "rate-limited"; label: string }
  | { status: "unavailable"; label: string } {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (
    normalized.includes("429") ||
    normalized.includes("rate limit") ||
    normalized.includes("too many requests")
  ) {
    return {
      status: "rate-limited",
      label: "The public RPC is rate-limited. Wait briefly, then retry.",
    };
  }

  return {
    status: "unavailable",
    label:
      "Onchain state is unavailable. No balance or membership value was assumed.",
  };
}

export function isFreshValidState<T>(
  state: ReadState<T>,
): state is Extract<ReadState<T>, { status: "valid" }> {
  return state.status === "valid";
}

export function unavailableDeploymentState(
  deployment: Extract<DeploymentAvailability, { status: "unavailable" }>,
): ReadState<never> {
  return {
    status: "unavailable",
    reason:
      deployment.reason === "payment-token-unconfirmed"
        ? "token-unconfirmed"
        : "not-deployed",
    label: deployment.detail,
  };
}
