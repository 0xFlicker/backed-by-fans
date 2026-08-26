import { getAddress, type PublicClient } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/direct-read", () => ({
  multicall3Address: "0xca11bde05977b3631167028862be2a173976ca11",
  readCatalogPage: vi.fn(),
  verifyMulticall3: vi.fn(),
}));
vi.mock("@/lib/authenticity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/authenticity")>()),
  verifyTierAuthenticity: vi.fn(),
}));
vi.mock("@/features/protocol/factory-authenticity", () => ({
  verifyFactoryAuthenticity: vi.fn(),
}));

import { discoverAccountPage } from "@/features/membership/account-discovery";
import { verifyFactoryAuthenticity } from "@/features/protocol/factory-authenticity";
import { verifyTierAuthenticity } from "@/lib/authenticity";
import { readCatalogPage, verifyMulticall3 } from "@/lib/direct-read";

const factory = getAddress("0x1111111111111111111111111111111111111111");
const token = getAddress("0x2222222222222222222222222222222222222222");
const wallet = getAddress("0x3333333333333333333333333333333333333333");
const tierA = getAddress("0x4444444444444444444444444444444444444444");
const tierB = getAddress("0x5555555555555555555555555555555555555555");
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

describe("bounded account discovery", () => {
  beforeEach(() => {
    vi.mocked(readCatalogPage).mockResolvedValue({
      capturedBlock: 80n,
      total: 20n,
      offset: 0n,
      limit: 12,
      addresses: [tierA, tierB],
      nextOffset: 2n,
    });
    vi.mocked(verifyFactoryAuthenticity).mockResolvedValue({
      status: "verified",
      capturedBlock: 80n,
      factory,
      paymentToken: token,
      protocolFeeBps: 100,
    });
    vi.mocked(verifyMulticall3).mockResolvedValue("missing");
    vi.mocked(verifyTierAuthenticity).mockImplementation(
      async (_client, input) =>
        input.tier === tierA
          ? {
              status: "verified",
              capturedBlock: 80n,
              factory,
              tier: tierA,
              paymentToken: token,
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
      results: [{ tier: tierA, claimableReward: 2n }],
      skipped: [expect.stringContaining(tierB)],
    });
    expect(readContract).toHaveBeenCalled();
    expect(
      readContract.mock.calls.every(([read]) => read.blockNumber === 80n),
    ).toBe(true);
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
        tokenId: 1n,
        active: true,
        claimableReward: 2n,
        claimableReferral: 3n,
        creatorProceeds: 0n,
      },
    ]);
    expect(multicall).toHaveBeenCalledTimes(2);
    expect(verifyTierAuthenticity).not.toHaveBeenCalled();
  });
});
