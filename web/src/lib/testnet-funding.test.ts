import { describe, expect, it } from "vitest";
import { robinhood, robinhoodTestnet } from "viem/chains";

import {
  robinhoodTestnetFaucetUrl,
  testnetFundingReadiness,
} from "@/lib/testnet-funding";

describe("testnet funding readiness", () => {
  it("distinguishes gas and payment-token shortfalls", () => {
    expect(
      testnetFundingReadiness({
        chainId: robinhoodTestnet.id,
        gasBalance: 0n,
        paymentTokenBalance: 4n,
        requiredPayment: 5n,
      }),
    ).toEqual({
      gasShortfall: true,
      paymentTokenShortfall: true,
      ready: false,
      faucetUrl: robinhoodTestnetFaucetUrl,
    });
  });

  it("does not offer the testnet faucet on mainnet", () => {
    expect(
      testnetFundingReadiness({
        chainId: robinhood.id,
        gasBalance: 0n,
        paymentTokenBalance: 0n,
        requiredPayment: 1n,
      }).faucetUrl,
    ).toBeUndefined();
  });
});
