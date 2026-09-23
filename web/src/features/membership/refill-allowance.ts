const uint256Max = (1n << 256n) - 1n;

/** User choice only; enrollment is a separate tier transaction. */
export function refillAllowanceAmount(
  mode: string,
  periods: string,
  price: bigint,
) {
  if (mode === "unlimited") return uint256Max;
  if (mode !== "finite")
    throw new Error("Choose a finite or unlimited approval.");
  if (!/^[1-9]\d*$/.test(periods))
    throw new Error("Enter a positive whole number of approval periods.");
  const count = BigInt(periods);
  if (price <= 0n || count > uint256Max / price)
    throw new Error("Approval amount exceeds the supported range.");
  return count * price;
}

export function refillAllowanceSteps(current: bigint, desired: bigint) {
  if (
    current < 0n ||
    desired < 0n ||
    current > uint256Max ||
    desired > uint256Max
  )
    throw new Error("Invalid allowance amount.");
  if (current === desired) return [];
  // Reset first also supports tokens that reject nonzero-to-nonzero approvals.
  return current > 0n && desired > 0n ? [0n, desired] : [desired];
}

/** Each step uses the caller's existing wagmi/viem transaction action. */
export async function applyRefillAllowance(
  current: bigint,
  desired: bigint,
  writeStep: (amount: bigint) => Promise<boolean>,
) {
  for (const amount of refillAllowanceSteps(current, desired)) {
    if (!(await writeStep(amount))) return false;
  }
  return true;
}
