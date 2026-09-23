import { describe, expect, it, vi } from "vitest";
import { zeroAddress, type PublicClient } from "viem";
import { readCancellation } from "./cancellation-read";

const tier = "0x0000000000000000000000000000000000000001" as const;
const owner = "0x0000000000000000000000000000000000000002" as const;
const operator = "0x0000000000000000000000000000000000000003" as const;
function fixture(remaining = 500n, live = true) {
  const quote = {
    owner: live ? owner : zeroAddress,
    cancellationEligible: live,
    lifecycle: live ? 0 : 2,
  };
  const readContract = vi.fn(
    async ({ functionName }: { functionName: string }) => {
      if (functionName === "timeBalances") return [remaining, 0n, 1000n];
      if (functionName === "previewCancellation") return quote;
      if (functionName === "getApproved") return operator;
      if (functionName === "isApprovedForAll") return false;
      throw new Error(`Unexpected read: ${functionName}`);
    },
  );
  const client = {
    getBlock: vi.fn().mockResolvedValue({ number: 10n, timestamp: 1000n }),
    readContract,
  } as unknown as PublicClient;
  return { client, readContract, quote };
}
describe("protected cancellation reads", () => {
  it("pins all reads to one block and uses a two-minute chain-time deadline", async () => {
    const f = fixture();
    expect(await readCancellation(f.client, tier, 7n, operator)).toEqual({
      quote: f.quote,
      authorized: true,
    });
    expect(f.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "previewCancellation",
        args: [7n, 1120n, 25n],
        blockNumber: 10n,
      }),
    );
    expect(
      f.readContract.mock.calls.every(
        ([request]) => "blockNumber" in request && request.blockNumber === 10n,
      ),
    ).toBe(true);
  });
  it("shortens the deadline to one second before expiration", async () => {
    const f = fixture(50n);
    await readCancellation(f.client, tier, 7n, owner);
    expect(f.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "previewCancellation",
        args: [7n, 1049n, 25n],
      }),
    );
  });
  it("does not invent a protected quote when no future live deadline exists", async () => {
    const f = fixture(1n);
    await expect(readCancellation(f.client, tier, 7n, owner)).rejects.toThrow(
      "No time remains",
    );
  });
  it("returns known retired status without an owner or approval read", async () => {
    const f = fixture(0n, false);
    expect(await readCancellation(f.client, tier, 7n, owner)).toEqual({
      quote: f.quote,
      authorized: false,
    });
    expect(f.readContract).toHaveBeenCalledTimes(2);
  });
  it("surfaces unknown IDs and RPC errors instead of fabricating a zero quote", async () => {
    const f = fixture();
    f.readContract.mockRejectedValueOnce(new Error("Unknown token"));
    await expect(readCancellation(f.client, tier, 99n, owner)).rejects.toThrow(
      "Unknown token",
    );
  });
});
