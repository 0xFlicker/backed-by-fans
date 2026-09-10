import { expect, it, vi } from "vitest";
import { zeroAddress, type PublicClient } from "viem";
import { readRewardUsdPrices, formatRewardUsd } from "./reward-usd";
vi.mock("./buyback-policy/live", () => ({
  readPoolMarginal: vi.fn(async (_client, _pool, from) =>
    from === "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"
      ? { numerator: 400_000_000n, denominator: 1n }
      : { numerator: 1n, denominator: 5n },
  ),
}));
it("converts raw token units through native ETH into six-decimal USDG at one block", async () => {
  const usdg = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
  const stock = "0x1111111111111111111111111111111111111111";
  const readContract = vi.fn(async (request) =>
    request.functionName === "buybackVault"
      ? stock
      : { pools: [{ currency0: request.args[0], currency1: zeroAddress }] },
  );
  const client = {
    getBlockNumber: async () => 123n,
    readContract,
  } as unknown as PublicClient;
  const prices = await readRewardUsdPrices(client, stock, [
    usdg,
    zeroAddress,
    stock,
  ]);
  expect(formatRewardUsd(19_803_000n, prices[0].price, "en-US")).toBe("$19.80");
  expect(formatRewardUsd(10n ** 18n, prices[1].price, "en-US")).toBe(
    "$2,500.00",
  );
  expect(formatRewardUsd(10n ** 18n, prices[2].price, "en-US")).toBe("$500.00");
  expect(
    readContract.mock.calls.every(([request]) => request.blockNumber === 123n),
  ).toBe(true);
});
it("keeps tiny estimates visible and uses the chosen locale", () => {
  expect(formatRewardUsd(1n, { numerator: 1n, denominator: 1n }, "en-US")).toBe(
    "< $0.01",
  );
  expect(
    formatRewardUsd(1_230_000n, { numerator: 1n, denominator: 1n }, "de-DE"),
  ).toContain("1,23");
});
