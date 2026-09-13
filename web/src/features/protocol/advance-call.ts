import type { Address } from "viem";

export type AdvanceMode = "accounting" | "buyback" | "both";
export function advanceCall(
  mode: AdvanceMode,
  tiers: readonly { tier: Address; maxAccountingSteps: bigint }[],
  purchases: readonly { asset: Address; revision: bigint }[],
  deadline: bigint,
) {
  tiers = [...tiers].sort((a, b) =>
    a.tier.toLowerCase().localeCompare(b.tier.toLowerCase()),
  );
  purchases = [...purchases].sort((a, b) =>
    a.asset.toLowerCase().localeCompare(b.asset.toLowerCase()),
  );
  if (mode === "accounting")
    return { functionName: "advanceAccounting", args: [tiers] } as const;
  if (mode === "buyback")
    return { functionName: "buyback", args: [purchases, deadline] } as const;
  return {
    functionName: "advance",
    args: [tiers, purchases, deadline],
  } as const;
}
