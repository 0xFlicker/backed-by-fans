import { expect, it, vi } from "vitest";
import { zeroAddress, type PublicClient } from "viem";
import { readCalculator } from "./read";
import type { DeploymentAvailability } from "@/lib/config";
const mock = vi.hoisted(() => ({ snapshot: vi.fn() }));
vi.mock("@/features/protocol/protocol-read", () => ({
  readPublicBuybacks: mock.snapshot,
}));
it("combines WETH earnings into ETH without counting future fees as earned", async () => {
  const factory = "0x1111111111111111111111111111111111111111",
    vault = "0x2222222222222222222222222222222222222222",
    tier = "0x3333333333333333333333333333333333333333",
    weth = "0x4444444444444444444444444444444444444444";
  mock.snapshot.mockResolvedValue({
    status: "valid",
    capturedBlock: 42n,
    data: {
      factory,
      vault,
      tierCount: 1n,
      assetCoverage: { nextOffset: null },
    },
  });
  const readContract = vi.fn(async ({ functionName, args }) => {
    if (functionName === "protocolFeeState")
      return args[0] === 1n
        ? { uncheckpointedEarned: 2n, unearned: 5n }
        : { uncheckpointedEarned: 3n, unearned: 7n };
    return {
      tiers: [tier],
      paymentToken: weth,
      protocolFeeEarnedHeld: 10n,
      totalMinted: 2n,
      canonicalAsset: zeroAddress,
    }[functionName as "tiers"];
  });
  const result = await readCalculator(
    { readContract } as unknown as PublicClient,
    {} as DeploymentAvailability,
  );
  expect(result.fees.get(zeroAddress)).toEqual({ earned: 15n, future: 12n });
  expect(result.fees.has(weth)).toBe(false);
  expect(
    readContract.mock.calls.every(([args]) => args.blockNumber === 42n),
  ).toBe(true);
});
