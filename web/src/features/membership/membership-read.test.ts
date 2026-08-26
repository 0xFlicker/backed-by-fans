import { getAddress, zeroAddress, type PublicClient } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/direct-read", () => ({
  multicall3Address: "0xca11bde05977b3631167028862be2a173976ca11",
  readTierSnapshotState: vi.fn(),
  verifyMulticall3: vi.fn(),
}));

import { readTierSupporterState } from "@/features/membership/membership-read";
import { readTierSnapshotState, verifyMulticall3 } from "@/lib/direct-read";

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
  usdgImplementationAddress:
    "0x5555555555555555555555555555555555555555" as const,
  usdgImplementationRuntimeCodeHash: `0x${"05".repeat(32)}` as const,
};

describe("supporter direct reads", () => {
  beforeEach(() => {
    vi.mocked(verifyMulticall3).mockResolvedValue("missing");
  });

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

  it("batches wallet and credential reads through verified Multicall3", async () => {
    const wallet = getAddress("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
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
    vi.mocked(verifyMulticall3).mockResolvedValue("verified");
    const success = (result: unknown) => ({ status: "success", result });
    const multicall = vi
      .fn()
      .mockResolvedValueOnce([
        success(1n),
        success(20n),
        success(30n),
        success(40n),
        success(50n),
      ])
      .mockResolvedValueOnce([
        success(wallet),
        success(true),
        success(true),
        success(2_000n),
        success([100n, 20n]),
        success([1, zeroAddress]),
        success(60n),
        success(70n),
        success([80n, 0n]),
      ]);
    const client = {
      getBlock: vi.fn().mockResolvedValue({ timestamp: 1_000n }),
      getBalance: vi.fn(),
      multicall,
      readContract: vi.fn(),
    } as unknown as PublicClient;

    const state = await readTierSupporterState(client, {
      tier,
      deployment,
      wallet,
    });

    expect(state).toMatchObject({
      status: "valid",
      data: {
        walletUsdgBalance: 20n,
        walletEthBalance: 30n,
        allowance: 40n,
        claimableReferral: 50n,
        credential: {
          tokenId: 1n,
          paidSeconds: 100n,
          grantSeconds: 20n,
          refundableGross: 80n,
        },
      },
    });
    expect(multicall).toHaveBeenCalledTimes(2);
    expect(client.readContract).not.toHaveBeenCalled();
    expect(client.getBalance).not.toHaveBeenCalled();
  });
});
