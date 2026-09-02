import { getAddress, zeroAddress, type PublicClient } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/direct-read", () => ({
  multicall3Address: "0xca11bde05977b3631167028862be2a173976ca11",
  readTierSnapshotState: vi.fn(),
  verifyMulticall3: vi.fn(),
}));

import { readTierSupporterState } from "@/features/membership/membership-read";
import type {
  ProtocolDependencySnapshot,
  TierArtConfig,
  TierMediaConfig,
} from "@/contracts/types";
import { readTierSnapshotState, verifyMulticall3 } from "@/lib/direct-read";

const tier = getAddress("0x1111111111111111111111111111111111111111");
const factory = getAddress("0x2222222222222222222222222222222222222222");
const token = getAddress("0x3333333333333333333333333333333333333333");
const creator = getAddress("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
const deployment = {
  status: "ready" as const,
  chainId: 46630 as const,
  factoryAddress: factory,
  rendererAddress: getAddress("0x4444444444444444444444444444444444444444"),
  previewHarnessAddress: getAddress(
    "0x6666666666666666666666666666666666666666",
  ),
};
const renderer = getAddress("0x4444444444444444444444444444444444444444");
const protocolDependencies: ProtocolDependencySnapshot = {
  chainId: 46630,
  factory,
  paymentTokens: [token],
  rendererSchema: `0x${"03".repeat(32)}`,
  renderer,
  rendererName: "Founding Six",
  rendererEngineCount: 6,
  rendererEngineNames: ["One", "Two", "Three", "Four", "Five", "Six"],
  previewHarness: deployment.previewHarnessAddress,
  mediaStoreFactory: getAddress("0x5555555555555555555555555555555555555555"),
  mediaStoreFactoryRuntimeCodehash: `0x${"02".repeat(32)}`,
};
const art: TierArtConfig = {
  engine: 0,
  collectionSeed: 1n,
  palette: 0,
  intensity: 50,
  density: 50,
  symmetry: 50,
  typographyScale: 50,
  typographyStyle: 0,
  textVisibility: 1,
  imageFit: 0,
  focalX: 50,
  focalY: 50,
  grain: 50,
  mediaMix: 50,
  primary: 50,
  secondary: 50,
  tertiary: 50,
};
const media: TierMediaConfig = {
  mime: 0,
  store: zeroAddress,
  length: 0,
  digest: `0x${"00".repeat(32)}`,
  runtimeCodehash: `0x${"00".repeat(32)}`,
};
const tierIdentity = `0x${"ab".repeat(32)}` as const;
const snapshotData = {
  address: tier,
  factory,
  paymentToken: token,
  creator,
  name: "Room",
  symbol: "ROOM",
  description: "",
  externalURI: "",
  tierIdentity,
  art,
  media,
  pricePerPeriod: 1n,
  periodDuration: 30n,
  rewardBps: 0,
  referralBps: 0,
  supplyCap: 0n,
  occupiedSupply: 0n,
  maxPrepaidPeriods: 0n,
  paused: false,
  renderer,
  protocolDependencies,
};

describe("supporter direct reads", () => {
  beforeEach(() => {
    vi.mocked(verifyMulticall3).mockResolvedValue("missing");
    vi.mocked(readTierSnapshotState).mockResolvedValue({
      status: "valid",
      capturedBlock: 10n,
      data: snapshotData,
    });
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
        externalURI: "",
        tierIdentity,
        art,
        media,
        pricePerPeriod: 1n,
        periodDuration: 30n,
        rewardBps: 0,
        referralBps: 0,
        supplyCap: 0n,
        occupiedSupply: 0n,
        maxPrepaidPeriods: 0n,
        paused: false,
        renderer,
        protocolDependencies,
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
        externalURI: "",
        tierIdentity,
        art,
        media,
        pricePerPeriod: 1n,
        periodDuration: 30n,
        rewardBps: 0,
        referralBps: 0,
        supplyCap: 0n,
        occupiedSupply: 0n,
        maxPrepaidPeriods: 0n,
        paused: false,
        renderer,
        protocolDependencies,
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
        success(1n),
        success(true),
        success(true),
        success([100n, 20n, 1_880n]),
        success([1, zeroAddress]),
        success(60n),
        success(70n),
        success(true),
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
        walletPaymentTokenBalance: 20n,
        walletEthBalance: 30n,
        allowance: 40n,
        claimableReferral: 50n,
        credential: {
          tokenId: 1n,
          minted: true,
          paidSeconds: 100n,
          grantSeconds: 20n,
          rewardEligible: true,
          refundableGross: 80n,
        },
      },
    });
    expect(multicall).toHaveBeenCalledTimes(2);
    expect(client.readContract).not.toHaveBeenCalled();
    expect(client.getBalance).not.toHaveBeenCalled();
  });

  it("reads creator proceeds through verified Multicall3 without a membership", async () => {
    vi.mocked(verifyMulticall3).mockResolvedValue("verified");
    const success = (result: unknown) => ({ status: "success", result });
    const multicall = vi
      .fn()
      .mockResolvedValueOnce([
        success(0n),
        success(20n),
        success(30n),
        success(40n),
        success(50n),
      ])
      .mockResolvedValueOnce([success(99n)]);
    const client = {
      getBlock: vi.fn().mockResolvedValue({ timestamp: 1_000n }),
      multicall,
    } as unknown as PublicClient;

    const state = await readTierSupporterState(client, {
      tier,
      deployment,
      wallet: creator,
    });

    expect(state).toMatchObject({
      status: "valid",
      data: { creatorProceeds: 99n, credential: undefined },
    });
    expect(multicall).toHaveBeenCalledTimes(2);
  });

  it("keeps a burned member's permanent record and accrued reward readable", async () => {
    const wallet = getAddress("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
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
        success(0n),
        success(false),
        success(false),
        success([0n, 0n, 2_000n]),
        success([1, zeroAddress]),
        success(60n),
        success(70n),
        success(false),
        { status: "failure" },
      ]);
    const client = {
      getBlock: vi.fn().mockResolvedValue({ timestamp: 2_100n }),
      multicall,
    } as unknown as PublicClient;

    const state = await readTierSupporterState(client, {
      tier,
      deployment,
      wallet,
    });

    expect(state).toMatchObject({
      status: "valid",
      data: {
        credential: {
          tokenId: 1n,
          owner: wallet,
          minted: false,
          active: false,
          occupied: false,
          expiration: 2_000n,
          rewardEligible: false,
          claimableReward: 70n,
          refundableGross: 0n,
        },
      },
    });
  });
});
