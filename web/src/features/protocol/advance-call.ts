import type { Address } from "viem";

export type AdvanceMode = "accounting" | "buyback" | "both";
export function advanceCall(
  mode: AdvanceMode,
  tiers: readonly { tier: Address; maxAccountingSteps: bigint }[],
  purchases: readonly { asset: Address; revision: bigint }[],
  deadline: bigint,
) {
  if (mode === "accounting")
    return { functionName: "advanceAccounting", args: [tiers] } as const;
  if (mode === "buyback")
    return { functionName: "buyback", args: [purchases, deadline] } as const;
  return {
    functionName: "advance",
    args: [tiers, purchases, deadline],
  } as const;
}
