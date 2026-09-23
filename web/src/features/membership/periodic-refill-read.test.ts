import { describe, expect, it, vi } from "vitest";
import type { PublicClient } from "viem";
import { readPeriodicRefill, refillReasonLabel } from "./periodic-refill-read";

const tier = "0x0000000000000000000000000000000000000001" as const;
const owner = "0x0000000000000000000000000000000000000002" as const;
const executor = "0x0000000000000000000000000000000000000003" as const;
const quote = {
  tokenId: 7n,
  lifecycle: 0,
  owner,
  reason: 0,
  periods: 2n,
  balance: 55_000_000n,
  allowance: 40_000_000n,
  gross: 40_000_000n,
  effectiveReferral: executor,
  accounting: { complete: true },
};
function fixture() {
  const readContract = vi
    .fn()
    .mockImplementation(async ({ functionName }) =>
      functionName === "referralOf" ? [2, executor] : quote,
    );
  const client = {
    getBlock: vi.fn().mockResolvedValue({ number: 10n, timestamp: 1000n }),
    readContract,
  } as unknown as PublicClient;
  return { client, readContract };
}
describe("periodic refill reads", () => {
  it("pins the quote to a current block and preserves partial whole-period funding", async () => {
    const f = fixture();
    expect(await readPeriodicRefill(f.client, tier, 7n, 5n, owner)).toEqual({
      quote,
      referralStatus: 2,
      isOwner: true,
    });
    expect(f.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "previewRefill",
        args: [7n, 5n],
        blockNumber: 10n,
      }),
    );
  });
  it("does not grant owner controls to an executor or referral beneficiary", async () => {
    const f = fixture();
    expect(
      (await readPeriodicRefill(f.client, tier, 7n, 5n, executor)).isOwner,
    ).toBe(false);
    expect(
      (await readPeriodicRefill(f.client, tier, 7n, 5n, owner)).quote
        .effectiveReferral,
    ).toBe(executor);
  });
  it.each([
    [1, "Target covered"],
    [3, "Allowance too low"],
    [6, "Tier paused"],
    [8, "Periodic refill off"],
    [9, "Membership expired"],
  ])("labels reason %s without implying a payment", (reason, label) => {
    expect(refillReasonLabel(Number(reason))).toBe(label);
  });
  it("propagates read failure instead of displaying zero funds", async () => {
    const f = fixture();
    f.readContract.mockRejectedValue(new Error("Allowance read failed"));
    await expect(
      readPeriodicRefill(f.client, tier, 7n, 5n, owner),
    ).rejects.toThrow("Allowance read failed");
  });
});
