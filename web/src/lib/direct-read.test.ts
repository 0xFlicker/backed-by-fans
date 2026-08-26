import { describe, expect, it, vi } from "vitest";
import { getAddress, keccak256, type Address, type PublicClient } from "viem";

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return { ...actual, keccak256: vi.fn(actual.keccak256) };
});
vi.mock("@/lib/authenticity", () => ({
  verifyTierAuthenticity: vi.fn(),
}));

import { verifyTierAuthenticity } from "@/lib/authenticity";

import {
  maxCatalogPageLimit,
  multicall3RuntimeHash,
  readCatalogPage,
  readTierSnapshotState,
  readTierSummaries,
  validateTierRouteParam,
  verifyMulticall3,
} from "@/lib/direct-read";

const factory = getAddress("0x1111111111111111111111111111111111111111");
const tierA = getAddress("0x2222222222222222222222222222222222222222");
const tierB = getAddress("0x3333333333333333333333333333333333333333");
const deployment = {
  status: "ready" as const,
  chainId: 46630 as const,
  factoryAddress: factory,
  usdgAddress: tierB,
  factoryRuntimeCodeHash: `0x${"01".repeat(32)}` as const,
  rendererRuntimeCodeHash: `0x${"02".repeat(32)}` as const,
  deployerRuntimeCodeHash: `0x${"03".repeat(32)}` as const,
  usdgRuntimeCodeHash: `0x${"04".repeat(32)}` as const,
};

function client(value: Partial<PublicClient>) {
  return value as PublicClient;
}

describe("direct reads", () => {
  it("validates and checksums direct tier routes", () => {
    expect(validateTierRouteParam(tierA.toLowerCase())).toBe(tierA);
    expect(validateTierRouteParam("not-an-address")).toBeUndefined();
  });

  it("paginates the append-only registry at one captured block", async () => {
    const getBlockNumber = vi.fn().mockResolvedValue(44n);
    const readContract = vi
      .fn()
      .mockResolvedValueOnce(3n)
      .mockResolvedValueOnce([tierA, tierB] as Address[]);

    const page = await readCatalogPage(
      client({ getBlockNumber, readContract } as Partial<PublicClient>),
      factory,
      { offset: 0n, limit: 2 },
    );

    expect(page).toEqual({
      capturedBlock: 44n,
      total: 3n,
      offset: 0n,
      limit: 2,
      addresses: [tierA, tierB],
      nextOffset: 2n,
    });
    expect(readContract).toHaveBeenCalledTimes(2);
    for (const call of readContract.mock.calls) {
      expect(call[0].blockNumber).toBe(44n);
    }
  });

  it("rejects unbounded or empty catalog pages", async () => {
    const emptyClient = client({});
    await expect(
      readCatalogPage(emptyClient, factory, { limit: 0 }),
    ).rejects.toThrow(RangeError);
    await expect(
      readCatalogPage(emptyClient, factory, {
        limit: maxCatalogPageLimit + 1,
      }),
    ).rejects.toThrow(RangeError);
  });

  it("distinguishes missing and mismatched Multicall3 bytecode", async () => {
    await expect(
      verifyMulticall3(
        client({ getBytecode: vi.fn().mockResolvedValue(undefined) }),
        1n,
      ),
    ).resolves.toBe("missing");
    await expect(
      verifyMulticall3(
        client({ getBytecode: vi.fn().mockResolvedValue("0x6000") }),
        1n,
      ),
    ).resolves.toBe("mismatch");
  });

  it("uses bounded direct reads and marks the result partial without verified Multicall3", async () => {
    const values = [
      "Front Row",
      "FRONT",
      factory,
      1_000_000n,
      2_592_000n,
      false,
    ];
    const readContract = vi.fn(({ functionName }: { functionName: string }) => {
      const index = [
        "name",
        "symbol",
        "owner",
        "pricePerPeriod",
        "periodDuration",
        "paused",
      ].indexOf(functionName);
      return Promise.resolve(values[index]);
    });
    const result = await readTierSummaries(
      client({
        getBytecode: vi.fn().mockResolvedValue(undefined),
        readContract,
      } as Partial<PublicClient>),
      [tierA],
      12n,
    );

    expect(result).toMatchObject({
      status: "partial",
      reason: "missing-multicall",
      capturedBlock: 12n,
      missing: [expect.stringContaining("missing")],
      data: [
        {
          address: tierA,
          name: "Front Row",
          symbol: "FRONT",
          pricePerPeriod: 1_000_000n,
        },
      ],
    });
    expect(readContract).toHaveBeenCalledTimes(6);
  });

  it("batches a verified tier snapshot into one Multicall3 read", async () => {
    vi.mocked(verifyTierAuthenticity).mockResolvedValue({
      status: "verified",
      capturedBlock: 12n,
      factory,
      tier: tierA,
      paymentToken: tierB,
    });
    vi.mocked(keccak256).mockReturnValueOnce(multicall3RuntimeHash);
    const success = (result: unknown) => ({ status: "success", result });
    const values = [
      "Front Row",
      "FRONT",
      factory,
      1_000_000n,
      2_592_000n,
      false,
      "Description",
      "ipfs://image",
      "https://example.com",
      500,
      250,
      100n,
      2n,
      12n,
      tierB,
      factory,
    ];
    const multicall = vi
      .fn()
      .mockResolvedValue(values.map((value) => success(value)));
    const readContract = vi.fn();
    const result = await readTierSnapshotState(
      client({
        getBytecode: vi.fn().mockResolvedValue("0x6000"),
        getBlockNumber: vi.fn().mockResolvedValue(12n),
        multicall,
        readContract,
      } as Partial<PublicClient>),
      { tier: tierA, deployment },
    );

    expect(result).toMatchObject({
      status: "valid",
      capturedBlock: 12n,
      data: { name: "Front Row", creator: factory, occupiedSupply: 2n },
    });
    expect(multicall).toHaveBeenCalledTimes(1);
    expect(readContract).not.toHaveBeenCalled();
  });
});
