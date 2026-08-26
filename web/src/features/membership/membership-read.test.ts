import { getAddress, type PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/direct-read", () => ({
  readTierSnapshotState: vi.fn(),
}));

import { readTierSupporterState } from "@/features/membership/membership-read";
import { readTierSnapshotState } from "@/lib/direct-read";

const tier = getAddress("0x1111111111111111111111111111111111111111");
const factory = getAddress("0x2222222222222222222222222222222222222222");
const token = getAddress("0x3333333333333333333333333333333333333333");
const creator = getAddress("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
const deployment = {
  status: "ready" as const,
  chainId: 46630 as const,
  factoryAddress: factory,
  usdgAddress: token,
  factoryRuntimeCodeHash: `0x${"01".repeat(32)}` as const,
  rendererRuntimeCodeHash: `0x${"02".repeat(32)}` as const,
  deployerRuntimeCodeHash: `0x${"03".repeat(32)}` as const,
  usdgRuntimeCodeHash: `0x${"04".repeat(32)}` as const,
};

describe("supporter direct reads", () => {
  it("reads creator proceeds for the same address regardless of checksum casing", async () => {
    vi.mocked(readTierSnapshotState).mockResolvedValue({
      status: "valid",
      capturedBlock: 10n,
      data: {
        address: tier,
        factory,
        paymentToken: token,
        creator,
        name: "Room",
        symbol: "ROOM",
        description: "",
        imageURI: "",
        externalURI: "",
        pricePerPeriod: 1n,
        periodDuration: 30n,
        rewardBps: 0,
        referralBps: 0,
        supplyCap: 0n,
        occupiedSupply: 0n,
        maxPrepaidPeriods: 0n,
        paused: false,
      },
    });
    const readContract = vi.fn(({ functionName }: { functionName: string }) => {
      const values: Record<string, unknown> = {
        tokenOf: 0n,
        balanceOf: 0n,
        allowance: 0n,
        claimableReferral: 0n,
        creatorProceeds: 99n,
      };
      return Promise.resolve(values[functionName]);
    });
    const client = {
      getBlock: vi.fn().mockResolvedValue({ timestamp: 1_000n }),
      getBalance: vi.fn().mockResolvedValue(0n),
      readContract,
    } as unknown as PublicClient;

    const state = await readTierSupporterState(client, {
      tier,
      deployment,
      wallet: creator.toLowerCase() as `0x${string}`,
    });

    expect(state).toMatchObject({
      status: "valid",
      data: { creatorProceeds: 99n, credential: undefined },
    });
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "creatorProceeds" }),
    );
  });
});
