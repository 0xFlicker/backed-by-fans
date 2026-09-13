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

import {
  discoverAccountPage,
  readAccountOwnerPage,
} from "@/features/membership/account-discovery";
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

type Read = {
  functionName: string;
  args?: readonly unknown[];
  address?: string;
  blockNumber?: bigint;
};

function createClient(overrides: Record<string, unknown> = {}) {
  const answer = (read: Read): unknown => {
    if (Object.hasOwn(overrides, read.functionName)) {
      const override = overrides[read.functionName];
      if (override instanceof Error) throw override;
      return typeof override === "function" ? override(read) : override;
    }
    const id = read.args?.[0];
    switch (read.functionName) {
      case "name":
        return "Room";
      case "factory":
        return factory;
      case "paymentToken":
        return token;
      case "renderer":
        return renderer;
      case "isRegisteredTier":
      case "supportsInterface":
        return true;
      case "owner":
        return factory;
      case "ownerOf":
        return wallet;
      case "balanceOf":
        return 2n;
      case "tokensOfOwner":
        return {
          tokenIds: [1n, 2n],
          nextOffset: 2n,
          balance: 2n,
          complete: true,
        };
      case "isActiveToken":
        return id === 1n;
      case "expiresAt":
        return id === 1n ? 200n : 60n;
      case "claimableReward":
        return id === 1n ? 2n : 4n;
      case "claimableReferral":
        return 3n;
      case "creatorProceeds":
        return 0n;
      case "claimableRetiredReward":
        return [0n, 0n];
      case "hasClaimInterest":
        return true;
      default:
        throw new Error(`Unexpected contract read: ${read.functionName}`);
    }
  };
  const readContract = vi.fn(async (read: Read) => answer(read));
  const multicall = vi.fn(
    async (input: { contracts: Read[]; blockNumber: bigint }) =>
      input.contracts.map((read) => {
        try {
          return { status: "success", result: answer(read) };
        } catch (error) {
          return { status: "failure", error };
        }
      }),
  );
  const getBlockNumber = vi.fn(async () => 80n);
  const getBytecode = vi.fn(async () => "0x6000");
  const client = {
    readContract,
    multicall,
    getBlockNumber,
    getBytecode,
  } as unknown as PublicClient;
  return { client, readContract, multicall, getBlockNumber, getBytecode };
}

function onlyTierA() {
  vi.mocked(readCatalogPage).mockResolvedValue({
    capturedBlock: 80n,
    total: 1n,
    offset: 0n,
    limit: 12,
    addresses: [tierA],
    nextOffset: null,
  });
}

const emptyOwnerPage = {
  tokenIds: [],
  nextOffset: 0n,
  balance: 0n,
  complete: true,
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

  it("keeps every independent position and reports unavailable tiers for same-page retry", async () => {
    const { client, readContract } = createClient();
    const page = await discoverAccountPage(client, {
      deployment,
      wallet,
      offset: 0n,
    });
    expect(page).toMatchObject({
      capturedBlock: 80n,
      offset: 0n,
      scannedTo: 2n,
      nextOffset: 2n,
      scannedTiers: [tierA],
      results: [
        {
          tier: tierA,
          positions: [
            {
              tokenId: 1n,
              active: true,
              expiration: 200n,
              claimableReward: 2n,
            },
            {
              tokenId: 2n,
              active: false,
              expiration: 60n,
              claimableReward: 4n,
            },
          ],
          ownerBalance: 2n,
          nextOwnerOffset: 2n,
          ownerComplete: true,
        },
      ],
      skipped: [expect.stringContaining(tierB)],
    });
    expect(
      readContract.mock.calls.every(([read]) => read.blockNumber === 80n),
    ).toBe(true);
    expect(
      readContract.mock.calls
        .filter(([read]) => read.functionName === "ownerOf")
        .map(([read]) => read.args?.[0]),
    ).toEqual([1n, 2n]);
    expect(readCatalogPage).toHaveBeenCalledWith(
      client,
      factory,
      expect.objectContaining({ limit: 12, blockNumber: 80n }),
    );
  });

  it("pins catalog continuation to its supplied block instead of fetching a newer head", async () => {
    const { client, getBlockNumber } = createClient();
    await discoverAccountPage(client, {
      deployment,
      wallet,
      offset: 12n,
      blockNumber: 80n,
    });
    expect(getBlockNumber).not.toHaveBeenCalled();
    expect(readCatalogPage).toHaveBeenCalledWith(
      client,
      factory,
      expect.objectContaining({ offset: 12n, blockNumber: 80n, limit: 12 }),
    );
  });

  it("loads only the requested 100-position owner page at the captured block", async () => {
    const { client, readContract, getBlockNumber } = createClient({
      tokensOfOwner: {
        tokenIds: [101n],
        nextOffset: 101n,
        balance: 101n,
        complete: true,
      },
      ownerOf: wallet,
      isActiveToken: true,
      expiresAt: 300n,
      claimableReward: 9n,
    });
    const result = await readAccountOwnerPage(client, {
      deployment,
      wallet,
      tier: tierA,
      offset: 100n,
      blockNumber: 80n,
    });
    expect(result).toMatchObject({
      tier: tierA,
      positions: [
        { tokenId: 101n, active: true, expiration: 300n, claimableReward: 9n },
      ],
      ownerBalance: 101n,
      nextOwnerOffset: 101n,
      ownerComplete: true,
    });
    expect(getBlockNumber).not.toHaveBeenCalled();
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "tokensOfOwner",
        args: [wallet, 100n, 100n],
        blockNumber: 80n,
      }),
    );
    expect(
      readContract.mock.calls.every(([read]) => read.blockNumber === 80n),
    ).toBe(true);
  });

  it("marks the first owner page incomplete without reading the next page automatically", async () => {
    const ids = Array.from({ length: 100 }, (_, index) => BigInt(index + 1));
    const { client, readContract } = createClient({
      tokensOfOwner: {
        tokenIds: ids,
        nextOffset: 100n,
        balance: 101n,
        complete: false,
      },
    });
    const page = await discoverAccountPage(client, {
      deployment,
      wallet,
      offset: 0n,
    });
    expect(page.results[0]).toMatchObject({
      ownerBalance: 101n,
      nextOwnerOffset: 100n,
      ownerComplete: false,
    });
    expect(page.results[0].positions).toHaveLength(100);
    expect(
      readContract.mock.calls.filter(
        ([read]) => read.functionName === "tokensOfOwner",
      ),
    ).toHaveLength(1);
  });

  it("rejects an owner page whose token no longer belongs to the requested wallet", async () => {
    const { client } = createClient({ ownerOf: factory });
    await expect(
      readAccountOwnerPage(client, {
        deployment,
        wallet,
        tier: tierA,
        offset: 0n,
        blockNumber: 80n,
      }),
    ).rejects.toThrow();
  });

  it("skips a tier when a position read fails instead of fabricating a zero reward", async () => {
    const { client } = createClient({
      claimableReward: new Error("reward read unavailable"),
    });
    const page = await discoverAccountPage(client, {
      deployment,
      wallet,
      offset: 0n,
    });
    expect(page.results).toEqual([]);
    expect(page.skipped).toEqual(
      expect.arrayContaining([
        expect.stringContaining(tierA),
        expect.stringContaining(tierB),
      ]),
    );
  });

  it("keeps zero-NFT retired fractional interest without rounding it away", async () => {
    const { client } = createClient({
      tokensOfOwner: emptyOwnerPage,
      balanceOf: 0n,
      claimableReferral: 0n,
      claimableRetiredReward: [0n, 1n],
      hasClaimInterest: true,
    });
    const page = await discoverAccountPage(client, {
      deployment,
      wallet,
      offset: 0n,
    });
    expect(page.results).toEqual([
      expect.objectContaining({
        tier: tierA,
        positions: [],
        ownerBalance: 0n,
        retiredReward: 0n,
        retiredFractionalScaled: 1n,
      }),
    ]);
  });

  it("finds referral-only wallets before their first settlement", async () => {
    const { client } = createClient({
      tokensOfOwner: emptyOwnerPage,
      balanceOf: 0n,
      claimableReferral: 0n,
      hasClaimInterest: true,
    });
    const page = await discoverAccountPage(client, {
      deployment,
      wallet,
      offset: 0n,
    });
    expect(page.results).toEqual([
      expect.objectContaining({
        tier: tierA,
        positions: [],
        claimableReferral: 0n,
      }),
    ]);
  });

  it("retains creator-owned tiers without memberships or proceeds", async () => {
    onlyTierA();
    const { client } = createClient({
      owner: wallet,
      tokensOfOwner: emptyOwnerPage,
      balanceOf: 0n,
      claimableReferral: 0n,
      creatorProceeds: 0n,
    });
    const page = await discoverAccountPage(client, {
      deployment,
      wallet,
      offset: 0n,
    });
    expect(page.results).toEqual([
      expect.objectContaining({
        tier: tierA,
        creatorOwned: true,
        positions: [],
        creatorProceeds: 0n,
      }),
    ]);
  });

  it("omits verified tiers only after successfully proving no current interest", async () => {
    onlyTierA();
    const { client } = createClient({
      tokensOfOwner: emptyOwnerPage,
      balanceOf: 0n,
      claimableReferral: 0n,
      hasClaimInterest: false,
    });
    const page = await discoverAccountPage(client, {
      deployment,
      wallet,
      offset: 0n,
    });
    expect(page.results).toEqual([]);
    expect(page.skipped).toEqual([]);
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
    const { client } = createClient();
    await discoverAccountPage(client, { deployment, wallet, offset: 0n });
    expect(maximumActive).toBe(1);
    expect(verifyTierAuthenticity).toHaveBeenCalledTimes(2);
  });

  it("batches authenticated reads without adding a renderer registry requirement", async () => {
    onlyTierA();
    vi.mocked(verifyMulticall3).mockResolvedValue("verified");
    const { client, multicall, getBytecode } = createClient();
    const page = await discoverAccountPage(client, {
      deployment,
      wallet,
      offset: 0n,
    });
    expect(page.results).toEqual([
      expect.objectContaining({
        tier: tierA,
        positions: [
          expect.objectContaining({ tokenId: 1n }),
          expect.objectContaining({ tokenId: 2n }),
        ],
      }),
    ]);
    expect(page.skipped).toEqual([]);
    expect(multicall).toHaveBeenCalled();
    expect(
      multicall.mock.calls.every(([read]) => read.blockNumber === 80n),
    ).toBe(true);
    expect(getBytecode).not.toHaveBeenCalled();
    expect(verifyTierAuthenticity).toHaveBeenCalledWith(client, {
      deployment,
      tier: tierA,
      blockNumber: 80n,
    });
    const functions = multicall.mock.calls.flatMap(([read]) =>
      read.contracts.map(({ functionName }) => functionName),
    );
    expect(functions).toContain("ownerOf");
    expect(functions).toContain("isActiveToken");
    expect(functions).toContain("claimableReward");
    expect(functions).not.toContain("tokenOf");
  });

  it("rejects unregistered or unsupported batched tiers", async () => {
    onlyTierA();
    vi.mocked(verifyMulticall3).mockResolvedValue("verified");
    for (const failedCheck of ["factory registration", "required interfaces"]) {
      vi.mocked(verifyTierAuthenticity).mockResolvedValue({
        status: "interface-mismatch",
        address: tierA,
        label: "Unverified contract",
        failedChecks: [failedCheck],
      });
      const { client, readContract, multicall } = createClient();
      const page = await discoverAccountPage(client, {
        deployment,
        wallet,
        offset: 0n,
      });
      expect(page.results).toEqual([]);
      expect(page.skipped).toEqual([expect.stringContaining(tierA)]);
      expect(readContract).not.toHaveBeenCalled();
      expect(multicall).not.toHaveBeenCalled();
    }
  });

  it("does not convert failed batched position reads into zero balances", async () => {
    onlyTierA();
    vi.mocked(verifyMulticall3).mockResolvedValue("verified");
    const { client } = createClient({
      claimableReward: new Error("unavailable"),
    });
    const page = await discoverAccountPage(client, {
      deployment,
      wallet,
      offset: 0n,
    });
    expect(page.results).toEqual([]);
    expect(page.skipped).toEqual([expect.stringContaining(tierA)]);
  });
});
