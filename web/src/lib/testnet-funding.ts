import { robinhoodTestnet } from "viem/chains";

export const robinhoodTestnetFaucetUrl =
  "https://faucet.testnet.chain.robinhood.com/";

export type FundingReadiness = {
  gasShortfall: boolean;
  paymentTokenShortfall: boolean;
  ready: boolean;
  faucetUrl?: string;
};

export function testnetFundingReadiness(input: {
  chainId: number;
  gasBalance?: bigint;
  paymentTokenBalance?: bigint;
  requiredPayment?: bigint;
}): FundingReadiness {
  const gasShortfall =
    input.gasBalance !== undefined && input.gasBalance === 0n;
  const paymentTokenShortfall =
    input.paymentTokenBalance !== undefined &&
    input.requiredPayment !== undefined &&
    input.paymentTokenBalance < input.requiredPayment;
  return {
    gasShortfall,
    paymentTokenShortfall,
    ready: !gasShortfall && !paymentTokenShortfall,
    ...(input.chainId === robinhoodTestnet.id &&
    (gasShortfall || paymentTokenShortfall)
      ? { faucetUrl: robinhoodTestnetFaucetUrl }
      : {}),
  };
}
