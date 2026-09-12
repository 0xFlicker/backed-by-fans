import { getAddress, zeroAddress, type Address, type PublicClient } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/direct-read", () => ({
  multicall3Address: "0xca11bde05977b3631167028862be2a173976ca11",
  readTierSnapshotState: vi.fn(),
  readTierAccounting: vi.fn(),
  verifyMulticall3: vi.fn(),
}));

import { readTierSupporterState } from "@/features/membership/membership-read";
import type {
  ProtocolDependencySnapshot,
  TierArtConfig,
  TierMediaConfig,
} from "@/contracts/types";
import {
  readTierSnapshotState,
  readTierAccounting,
  verifyMulticall3,
} from "@/lib/direct-read";

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
  protocolFeeBps: 100,
  rewardBps: 0,
  referralBps: 0,
  startingBoostBps: 10000,
  earlySupportGross: 0n,
  grossPaid: 0n,
  minimumPayment: 1n,
  accounting: {
    accountedThrough: 1000n,
    nextBoundary: 0n,
    scheduledMembers: 0n,
    scheduledExpirations: 0n,
    nextKind: 0,
    complete: true,
  },
  supplyCap: 0n,
  occupiedSupply: 0n,
  maxPrepaidPeriods: 0n,
  paused: false,
  renderer,
  protocolDependencies,
};

const vesting = {
  earned: {
    retired: 0n,
    retiredFractionalScaled: 0n,
    creator: 99n,
    member: 70n,
    referral: 50n,
    protocol: 1n,
    fractionalScaled: [0n, 15n, 1n, 8n] as const,
    status: { ...snapshotData.accounting, complete: false },
  },
  reserves: {
    unearnedScaled: [100n, 10n, 5n, 5n] as const,
    cancellationScaled: [0n, 0n, 0n, 0n] as const,
    unassignedMemberScaled: 0n,
    distributionDustScaled: 0n,
    indexCarryScaled: 3n,
    status: { ...snapshotData.accounting, complete: false },
  },
  allocation: undefined,
};

describe("supporter direct reads", () => {
  beforeEach(() => {
    vi.mocked(readTierAccounting).mockResolvedValue({
      ...vesting,
      preview: {
        lifecycle: 0,
        asOf: 1000n,
        processedSteps: 0n,
        ratesScaled: [0n, 0n, 0n, 0n],
        earnedDeltaScaled: [0n, 0n, 0n, 0n],
        settled: vesting.earned,
        current: vesting.earned,
      },
    });
    vi.mocked(verifyMulticall3).mockResolvedValue("missing");
    vi.mocked(readTierSnapshotState).mockResolvedValue({
      status: "valid",
      capturedBlock: 10n,
      data: snapshotData,
    });
  });
  function fixture(owner = creator, failOwner = false) {
    const requests: Record<string, unknown>[] = [];
    const response = (request: Record<string, unknown>) => {
      requests.push(request);
      if (request.functionName === "ownerOf" && failOwner)
        throw new Error("ERC721NonexistentToken");
      const values: Record<string, unknown> = {
        tokensOfOwner: {
          tokenIds: [7n, 9n],
          nextOffset: 2n,
          balance: 101n,
          complete: false,
        },
        ownerOf: owner,
        balanceOf: 20n,
        getEthBalance: 30n,
        allowance: 40n,
        claimableReferral: 50n,
        creatorProceeds: 99n,
        totalRewardShares: 600n,
        isActiveToken: true,
        isOccupied: true,
        timeBalances: [100n, 0n, 1000n],
        referralOf: [0, zeroAddress],
        sharesOf: 60n,
        claimableReward: 70n,
        rewardEligible: true,
        previewRefund: { recipient: owner, grossRefund: 100n, complete: true },
      };
      if (!(String(request.functionName) in values))
        throw new Error(`Unexpected ${request.functionName}`);
      return values[String(request.functionName)];
    };
    return {
      requests,
      client: {
        getBlock: vi.fn().mockResolvedValue({ timestamp: 1000n }),
        getBalance: vi.fn().mockResolvedValue(30n),
        readContract: vi.fn(async (request) => response(request)),
        multicall: vi.fn(async ({ contracts }) =>
          contracts.map((request: Record<string, unknown>) => ({
            status: "success",
            result: response(request),
          })),
        ),
      } as unknown as PublicClient,
    };
  }
  it("keeps creation explicit even when the wallet already owns multiple positions", async () => {
    const f = fixture();
    const state = await readTierSupporterState(f.client, {
      tier,
      deployment,
      wallet: creator,
    });
    expect(state).toMatchObject({
      status: "valid",
      data: {
        credential: undefined,
        ownerPage: { tokenIds: [7n, 9n], complete: false, balance: 101n },
        creatorProceeds: 99n,
      },
    });
    expect(f.requests.some((r) => r.functionName === "ownerOf")).toBe(false);
    expect(f.requests.every((r) => r.blockNumber === 10n)).toBe(true);
  });
  it.each(["missing", "verified"] as const)(
    "reads only the selected token with owner proof using %s multicall",
    async (mode) => {
      vi.mocked(verifyMulticall3).mockResolvedValue(mode);
      const f = fixture();
      const state = await readTierSupporterState(f.client, {
        tier,
        deployment,
        wallet: creator.toLowerCase() as Address,
        tokenId: 9n,
      });
      expect(state).toMatchObject({
        status: "valid",
        data: {
          credential: { tokenId: 9n, owner: creator, active: true },
          creatorProceeds: 99n,
        },
      });
      expect(f.requests.filter((r) => r.functionName === "ownerOf")).toEqual([
        expect.objectContaining({ args: [9n] }),
      ]);
      expect(vi.mocked(readTierAccounting)).toHaveBeenLastCalledWith(
        f.client,
        expect.objectContaining({
          tokenId: 9n,
          beneficiary: creator.toLowerCase(),
          blockNumber: 10n,
        }),
      );
    },
  );
  it("pins bounded continuation to the snapshot block and preserves incompleteness", async () => {
    const f = fixture();
    await readTierSupporterState(f.client, {
      tier,
      deployment,
      wallet: creator,
      ownerOffset: 100n,
    });
    expect(f.requests).toContainEqual(
      expect.objectContaining({
        functionName: "tokensOfOwner",
        args: [creator, 100n, 100n],
        blockNumber: 10n,
      }),
    );
  });
  it("rejects stale ownership instead of inferring access from another owned NFT", async () => {
    const f = fixture(token);
    expect(
      (
        await readTierSupporterState(f.client, {
          tier,
          deployment,
          wallet: creator,
          tokenId: 9n,
        })
      ).status,
    ).toBe("unavailable");
  });
  it("rejects an already-burned selected ID while unselected ended rewards remain separately readable", async () => {
    const f = fixture(creator, true);
    expect(
      (
        await readTierSupporterState(f.client, {
          tier,
          deployment,
          wallet: creator,
          tokenId: 9n,
        })
      ).status,
    ).toBe("unavailable");
    expect(
      (
        await readTierSupporterState(f.client, {
          tier,
          deployment,
          wallet: creator,
        })
      ).status,
    ).toBe("valid");
  });
  it("keeps proven ownership available when reward projection fails without inventing balances", async () => {
    vi.mocked(readTierAccounting).mockRejectedValueOnce(
      new Error("accounting unavailable"),
    );
    const f = fixture();
    const state = await readTierSupporterState(f.client, {
      tier,
      deployment,
      wallet: creator,
      tokenId: 9n,
    });
    expect(state).toMatchObject({
      status: "valid",
      data: {
        credential: { tokenId: 9n, owner: creator, active: true },
        vesting: undefined,
        vestingError: expect.any(String),
      },
    });
    expect(
      f.requests.some((request) => request.functionName === "previewRefund"),
    ).toBe(false);
  });
});
