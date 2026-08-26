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
  if (balance < estimatedCost) {
    throw new Error(
      `This wallet needs about ${formatEther(estimatedCost)} ETH for the prepared transaction, but has ${formatEther(balance)} ETH. Fund gas before retrying.`,
    );
  }
  return estimatedCost;
}
