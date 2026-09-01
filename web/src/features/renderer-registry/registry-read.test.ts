import { getAddress, type PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";

import { readCreatedRendererAddresses } from "@/features/renderer-registry/registry-read";

const registry = getAddress("0x1111111111111111111111111111111111111111");
const creator = getAddress("0x2222222222222222222222222222222222222222");

describe("readCreatedRendererAddresses", () => {
  it("reads every bounded registry page in creation order", async () => {
    const addresses = Array.from({ length: 101 }, (_, index) =>
      getAddress(`0x${(index + 1).toString(16).padStart(40, "0")}`),
    );
    const readContract = vi
      .fn()
      .mockImplementation(({ functionName, args }) => {
        if (functionName === "createdRendererCount") return 101n;
        const offset = Number(args[1]);
        const limit = Number(args[2]);
        return addresses.slice(offset, offset + limit);
      });

    await expect(
      readCreatedRendererAddresses(
        { readContract } as unknown as PublicClient,
        registry,
        creator,
      ),
    ).resolves.toEqual(addresses);
    expect(readContract).toHaveBeenCalledTimes(3);
  });

  it("does not request a page for an empty creator list", async () => {
    const readContract = vi.fn().mockResolvedValue(0n);

    await expect(
      readCreatedRendererAddresses(
        { readContract } as unknown as PublicClient,
        registry,
        creator,
      ),
    ).resolves.toEqual([]);
    expect(readContract).toHaveBeenCalledOnce();
  });
});
