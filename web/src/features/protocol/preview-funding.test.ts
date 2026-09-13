import { expect, it, vi } from "vitest";
import { zeroAddress, type Address, type PublicClient } from "viem";
import { previewFunding } from "./preview-funding";
const factory = "0x1111111111111111111111111111111111111111" as Address;
const vault = "0x2222222222222222222222222222222222222222" as Address;
function fixture(incomplete = false) {
  const tiers = Array.from(
    { length: 101 },
    (_, i) => `0x${(i + 100).toString(16).padStart(40, "0")}` as Address,
  );
  const readContract = vi.fn(async (request) => {
    expect(request.blockNumber).toBe(50n);
    switch (request.functionName) {
      case "tiers":
        return tiers.slice(
          Number(request.args[0]),
          Number(request.args[0] + request.args[1]),
        );
      case "paymentToken":
        return factory;
      case "canonicalAsset":
        return zeroAddress;
      case "previewAccounting":
        expect(request.args).toEqual([0n, zeroAddress, zeroAddress, 256n]);
        return {
          asOf: 100n,
          ratesScaled: [0n, 0n, 0n, 0n],
          current: {
            fractionalScaled: [0n, 0n, 0n, 0n],
            protocol: 3n,
            status: {
              nextBoundary: 0n,
              complete: !(incomplete && request.address === tiers[100]),
            },
          },
        };
      default:
        throw new Error("Unexpected read");
    }
  });
  return { client: { readContract } as unknown as PublicClient, readContract };
}
it("sums all pages and canonicalizes payment assets at the same block", async () => {
  const { client, readContract } = fixture();
  const totals = await previewFunding(
    client,
    { factory, vault, tierCount: 101n },
    50n,
  );
  expect(totals.get(zeroAddress)).toMatchObject({
    amount: 303n,
    complete: true,
  });
  expect(
    readContract.mock.calls.filter(([r]) => r.functionName === "tiers"),
  ).toHaveLength(2);
});
it("does not represent a bounded partial projection as the full total", async () => {
  const { client } = fixture(true);
  expect(
    (
      await previewFunding(client, { factory, vault, tierCount: 101n }, 50n)
    ).get(zeroAddress)?.complete,
  ).toBe(false);
});
it("fails instead of reporting zero when a tier read fails", async () => {
  const { client, readContract } = fixture();
  readContract.mockRejectedValueOnce(new Error("RPC unavailable"));
  await expect(
    previewFunding(client, { factory, vault, tierCount: 101n }, 50n),
  ).rejects.toThrow("RPC unavailable");
});
