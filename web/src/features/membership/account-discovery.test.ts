import { getAddress, zeroAddress, type PublicClient } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TierArtConfig, TierMediaConfig } from "@/contracts/types";

vi.mock("@/lib/direct-read", () => ({
  multicall3Address: "0xca11bde05977b3631167028862be2a173976ca11",
  readCatalogPage: vi.fn(),
  verifyMulticall3: vi.fn(),
}));
vi.mock("@/lib/authenticity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/authenticity")>()),
  verifyTierAuthenticity: vi.fn(),
}));
vi.mock("@/features/protocol/protocol-read", () => ({
  readProtocolDependencies: vi.fn(),
}));

import { discoverAccountPage } from "@/features/membership/account-discovery";
import { readProtocolDependencies } from "@/features/protocol/protocol-read";
import { verifyTierAuthenticity } from "@/lib/authenticity";
import { readCatalogPage, verifyMulticall3 } from "@/lib/direct-read";

const factory = getAddress("0x1111111111111111111111111111111111111111");
const token = getAddress("0x2222222222222222222222222222222222222222");
const wallet = getAddress("0x3333333333333333333333333333333333333333");
const tierA = getAddress("0x4444444444444444444444444444444444444444");
const tierB = getAddress("0x5555555555555555555555555555555555555555");
const renderer = getAddress("0x6666666666666666666666666666666666666666");
const protocolDependencies = {
  chainId: 46630,
  factory,
  paymentTokens: [token],
  rendererSchema: `0x${"03".repeat(32)}`,
  renderer,
  rendererName: "Founding Six",
  rendererEngineCount: 6,
  rendererEngineNames: ["One", "Two", "Three", "Four", "Five", "Six"],
  previewHarness: getAddress("0x8888888888888888888888888888888888888888"),
  mediaStoreFactory: getAddress("0x7777777777777777777777777777777777777777"),
  mediaStoreFactoryRuntimeCodehash: `0x${"02".repeat(32)}`,
} as const;
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
const deployment = {
  status: "ready" as const,
  chainId: 46630 as const,
  factoryAddress: factory,
  rendererAddress: renderer,
  previewHarnessAddress: protocolDependencies.previewHarness,
};

describe("bounded account discovery", () => {
  beforeEach(() => {
    vi.mocked(readProtocolDependencies).mockResolvedValue({
      status: "valid",
      capturedBlock: 80n,
      data: protocolDependencies,
    });
    vi.mocked(readCatalogPage).mockResolvedValue({
      capturedBlock: 80n,
      total: 20n,
      offset: 0n,
      limit: 12,
      addresses: [tierA, tierB],
      nextOffset: 2n,
    });
    vi.mocked(verifyMulticall3).mockResolvedValue("missing");
    vi.mocked(verifyTierAuthenticity).mockImplementation(
      async (_client, input) =>
        input.tier === tierA
          ? {
              status: "verified",
              capturedBlock: 80n,
              tier: tierA,
              tierIdentity,
              paymentToken: token,
              renderer,
              art,
              media,
              protocolDependencies,
            }
          : {
              status: "interface-mismatch",
              address: tierB,
              label: "Unverified contract",
              failedChecks: ["factory registration"],
            },
    );
  });

  it("keeps successful results and reports an unavailable tier for same-page retry", async () => {
    const readContract = vi.fn(
      ({ functionName }: { functionName: string; blockNumber: bigint }) => {
        const values: Record<string, unknown> = {
          name: "Room",
          tokenOf: 1n,
          claimableReferral: 3n,
          owner: factory,
          isActiveToken: true,
          claimableReward: 2n,
        };
        return Promise.resolve(values[functionName]);
      },
    );

    const page = await discoverAccountPage(
      {
        getBlockNumber: vi.fn().mockResolvedValue(80n),
        readContract,
      } as unknown as PublicClient,
      { deployment, wallet, offset: 0n },
    );

    expect(page).toMatchObject({
      capturedBlock: 80n,
      offset: 0n,
      scannedTo: 2n,
      nextOffset: 2n,
      scannedTiers: [tierA, tierB],
      results: [{ tier: tierA, claimableReward: 2n }],
      skipped: [expect.stringContaining(tierB)],
    });
    expect(readContract).toHaveBeenCalled();
    expect(
      readContract.mock.calls.every(([read]) => read.blockNumber === 80n),
    ).toBe(true);
  });

  it("inspects the no-Multicall fallback one tier at a time", async () => {
    let active = 0;
    let maximumActive = 0;
    vi.mocked(verifyTierAuthenticity).mockImplementation(
      async (_client, input) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await Promise.resolve();
        active -= 1;
        return {
          status: "interface-mismatch",
          address: input.tier,
          label: "Unverified contract",
          failedChecks: ["factory registration"],
        };
      },
    );

    await discoverAccountPage(
      {
        getBlockNumber: vi.fn().mockResolvedValue(80n),
      } as unknown as PublicClient,
      { deployment, wallet, offset: 0n },
    );

    expect(maximumActive).toBe(1);
    expect(verifyTierAuthenticity).toHaveBeenCalledTimes(2);
  });

  it("batches authenticity and claim reads when verified Multicall3 is available", async () => {
    vi.mocked(readCatalogPage).mockResolvedValue({
      capturedBlock: 80n,
      total: 1n,
      offset: 0n,
      limit: 12,
      addresses: [tierA],
      nextOffset: null,
    });
    vi.mocked(verifyMulticall3).mockResolvedValue("verified");
    const success = (result: unknown) => ({ status: "success", result });
    const multicall = vi
      .fn()
      .mockResolvedValueOnce([
        success(true),
        success(factory),
        success(token),
        success(renderer),
        ...Array.from({ length: 5 }, () => success(true)),
        success("Room"),
        success(1n),
        success(3n),
        success(factory),
      ])
      .mockResolvedValueOnce([success(true), success(2n)]);
    const client = {
      getBlockNumber: vi.fn().mockResolvedValue(80n),
      getBytecode: vi.fn().mockResolvedValue("0x6000"),
      multicall,
    } as unknown as PublicClient;

    const page = await discoverAccountPage(client, {
      deployment,
      wallet,
      offset: 0n,
    });

    expect(page.results).toEqual([
      {
        tier: tierA,
        name: "Room",
        creatorOwned: false,
        paymentToken: token,
        tokenId: 1n,
        active: true,
        claimableReward: 2n,
        claimableReferral: 3n,
        creatorProceeds: 0n,
      },
    ]);
    expect(multicall).toHaveBeenCalledTimes(2);
    expect(client.getBytecode).not.toHaveBeenCalled();
    expect(verifyTierAuthenticity).not.toHaveBeenCalled();
  });

  it("accepts a batched tier without consulting a renderer registry", async () => {
    vi.mocked(readCatalogPage).mockResolvedValue({
      capturedBlock: 80n,
      total: 1n,
      offset: 0n,
      limit: 12,
      addresses: [tierA],
      nextOffset: null,
    });
    vi.mocked(verifyMulticall3).mockResolvedValue("verified");
    const success = (result: unknown) => ({ status: "success", result });
    const multicall = vi
      .fn()
      .mockResolvedValueOnce([
        success(true),
        success(factory),
        success(token),
        success(renderer),
        ...Array.from({ length: 5 }, () => success(true)),
        success("Room"),
        success(1n),
        success(3n),
        success(factory),
      ])
      .mockResolvedValueOnce([success(true), success(2n)]);

    const page = await discoverAccountPage(
      {
        getBlockNumber: vi.fn().mockResolvedValue(80n),
        multicall,
      } as unknown as PublicClient,
      { deployment, wallet, offset: 0n },
    );

    expect(page.results).toHaveLength(1);
    expect(page.skipped).toEqual([]);
    expect(multicall).toHaveBeenCalledTimes(2);
  });

  it("retains a creator-owned tier even when it has no membership or proceeds", async () => {
    vi.mocked(readCatalogPage).mockResolvedValue({
      capturedBlock: 80n,
      total: 1n,
      offset: 0n,
      limit: 12,
      addresses: [tierA],
      nextOffset: null,
    });
    vi.mocked(verifyMulticall3).mockResolvedValue("missing");
    const readContract = vi.fn(({ functionName }: { functionName: string }) => {
      const values: Record<string, unknown> = {
        name: "Creator room",
        tokenOf: 0n,
        claimableReferral: 0n,
        owner: wallet,
        creatorProceeds: 0n,
      };
      return Promise.resolve(values[functionName]);
    });

    const page = await discoverAccountPage(
      {
        getBlockNumber: vi.fn().mockResolvedValue(80n),
        readContract,
      } as unknown as PublicClient,
      { deployment, wallet, offset: 0n },
    );

    expect(page.results).toEqual([
      {
        tier: tierA,
        name: "Creator room",
        creatorOwned: true,
        paymentToken: token,
        tokenId: 0n,
        active: false,
        claimableReward: 0n,
        claimableReferral: 0n,
        creatorProceeds: 0n,
      },
    ]);
  });
});
