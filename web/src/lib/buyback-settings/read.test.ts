import { expect, it, vi } from "vitest";
import { zeroAddress, type PublicClient } from "viem";
import { readCalculator, estimateAsset } from "./read";
import type { PublicBuybacks } from "@/features/protocol/protocol-read";
import type { DeploymentAvailability } from "@/lib/config";
const mock = vi.hoisted(() => ({ snapshot: vi.fn() }));
vi.mock("@/features/protocol/protocol-read", () => ({
  readPublicBuybacks: mock.snapshot,
}));
it.each([
  { nextBoundary: 950n, scheduledMembers: 1n, checkpointsDue: true },
  { nextBoundary: 1000n, scheduledMembers: 1n, checkpointsDue: true },
  { nextBoundary: 1100n, scheduledMembers: 1n, checkpointsDue: false },
  { nextBoundary: 0n, scheduledMembers: 0n, checkpointsDue: false },
])(
  "aggregates funding and detects due checkpoints at $nextBoundary with $scheduledMembers scheduled",
  async ({ nextBoundary, scheduledMembers, checkpointsDue }) => {
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
        timestamp: 1000n,
        assetCoverage: { nextOffset: null },
      },
    });
    const readContract = vi.fn(async ({ functionName }) => {
      if (functionName === "reserveState")
        return {
          unearnedScaled: [0n, 0n, 0n, 12n * (1n << 128n) + 5n],
          status: {
            accountedThrough: 900n,
            complete: false,
            scheduledMembers,
            nextBoundary,
          },
        };
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
    expect(result.fees.get(zeroAddress)).toEqual({
      earned: 10n,
      reservedScaled: 12n * (1n << 128n) + 5n,
      checkpointsDue,
    });
    expect(result.fees.has(weth)).toBe(false);
    expect(
      readContract.mock.calls.every(([args]) => args.blockNumber === 42n),
    ).toBe(true);
  },
);

it("does not mistake native ETH for an unlaunched protocol token", async () => {
  const readContract = vi.fn();
  const asset: PublicBuybacks["assets"][number] = {
    status: "valid",
    asset: zeroAddress,
    data: {
      asset: zeroAddress,
      blockNumber: 42n,
      membership: {
        available: 1n,
        totalReceived: 1n,
        totalConvertedIn: 0n,
        totalSpent: 0n,
        totalBurned: 0n,
      },
      donation: {
        available: 0n,
        totalReceived: 0n,
        totalConvertedIn: 0n,
        totalSpent: 0n,
        totalBurned: 0n,
      },
      route: { pools: [] },
      limits: { minInput: 1n, maxInput: 1n, minInterval: 0n },
      revision: 0n,
      paused: false,
      lastBuyAt: 0n,
      metadata: { symbol: "ETH", decimals: 18, uiMultiplier: 10n ** 18n },
      conserved: true,
      eligibility: [],
    },
  };
  const snapshot: PublicBuybacks = {
    chainId: 31337,
    factory: zeroAddress,
    paymentTokens: [],
    rendererSchema: "0x",
    renderer: zeroAddress,
    rendererName: "FOUNDING SIX",
    rendererEngineCount: 6,
    rendererEngineNames: [],
    previewHarness: zeroAddress,
    mediaStoreFactory: zeroAddress,
    mediaStoreFactoryRuntimeCodehash: "0x",
    timestamp: 1000n,
    safe: zeroAddress,
    owners: [],
    threshold: 1n,
    vault: zeroAddress,
    executor: zeroAddress,
    protocolToken: zeroAddress,
    tierCount: 0n,
    buybacksPaused: false,
    globalMinInterval: 0n,
    lastBuyAt: 0n,
    assets: [asset],
    pons: {
      status: "unavailable",
      reason: "not-deployed",
      label: "Protocol token has not been deployed.",
    },
    assetCoverage: { offset: 0, count: 1, total: 1, nextOffset: null },
  };
  await expect(
    estimateAsset(
      { readContract } as unknown as PublicClient,
      snapshot,
      asset,
      42n,
      1n,
    ),
  ).rejects.toThrow("Protocol token has not been deployed.");
  expect(readContract).not.toHaveBeenCalled();
});
