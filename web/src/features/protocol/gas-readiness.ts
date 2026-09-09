import { formatEther, type Address, type PublicClient } from "viem";

const gasSafetyNumerator = 12n;
const gasSafetyDenominator = 10n;

export async function assertSufficientGas(
  client: PublicClient,
  account: Address,
  request: unknown,
) {
  const [balance, gas, gasPrice] = await Promise.all([
    client.getBalance({ address: account }),
    client.estimateContractGas(request as never),
    client.getGasPrice(),
  ]);
  const estimatedCost =
    (gas * gasPrice * gasSafetyNumerator + gasSafetyDenominator - 1n) /
    gasSafetyDenominator;
  const value =
    typeof request === "object" &&
    request !== null &&
    "value" in request &&
    typeof request.value === "bigint"
      ? request.value
      : 0n;
  if (balance < estimatedCost + value) {
    throw new Error(
      `This wallet needs about ${formatEther(estimatedCost + value)} ETH for the prepared transaction${value > 0n ? " including its ETH amount and network fee" : ""}, but has ${formatEther(balance)} ETH. Fund gas before retrying.`,
    );
  }
  return estimatedCost;
}
