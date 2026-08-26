import { describe, expect, it, vi } from "vitest";
import { getAddress, type Address, type PublicClient } from "viem";

import {
  maxCatalogPageLimit,
  readCatalogPage,
  readTierSummaries,
  validateTierRouteParam,
  verifyMulticall3,
} from "@/lib/direct-read";

const factory = getAddress("0x1111111111111111111111111111111111111111");
const tierA = getAddress("0x2222222222222222222222222222222222222222");
const tierB = getAddress("0x3333333333333333333333333333333333333333");

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
});
