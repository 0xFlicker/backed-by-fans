import { formatEther, type Address, type PublicClient } from "viem";

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
  const requestedGas =
    typeof request === "object" &&
    request !== null &&
    "gas" in request &&
    typeof request.gas === "bigint"
      ? request.gas
      : 0n;
  const fundedGas = requestedGas > gas ? requestedGas : gas;
  const estimatedCost = fundedGas * gasPrice;
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
