import { getAddress, type PublicClient } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/direct-read", () => ({
  readCatalogPage: vi.fn(),
}));
vi.mock("@/lib/authenticity", () => ({
  verifyTierAuthenticity: vi.fn(),
}));

import { discoverAccountPage } from "@/features/membership/account-discovery";
import { verifyTierAuthenticity } from "@/lib/authenticity";
import { readCatalogPage } from "@/lib/direct-read";

const factory = getAddress("0x1111111111111111111111111111111111111111");
const token = getAddress("0x2222222222222222222222222222222222222222");
const wallet = getAddress("0x3333333333333333333333333333333333333333");
const tierA = getAddress("0x4444444444444444444444444444444444444444");
const tierB = getAddress("0x5555555555555555555555555555555555555555");

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
      { readContract } as unknown as PublicClient,
      { factory, paymentToken: token, wallet, offset: 0n },
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
});
