import { expect, it, vi } from "vitest";
import { type Address, type PublicClient } from "viem";
import {
  aggregatePaymentFlow,
  paymentFlowStream,
  readPaymentFlowPage,
} from "./payment-flow";
import { projectedAmount } from "@/lib/streaming-amount";
vi.mock("@/lib/payment-token-read", () => ({
  readAcceptedPaymentToken: async (
    _: unknown,
    input: { address: Address },
  ) => ({
    address: input.address,
    symbol: "USDG",
    decimals: 6,
    uiMultiplier: 10n ** 18n,
  }),
}));
const address = (n: number) =>
  `0x${n.toString(16).padStart(40, "0")}` as Address;
const scale = 1n << 128n;
function fixture() {
  const client = {
    getBlock: vi.fn(async () => ({ number: 100n, timestamp: 500n })),
    readContract: vi.fn(
      async ({ functionName, args, address: target, blockNumber }) => {
        expect(blockNumber).toBe(100n);
        switch (functionName) {
          case "tierCount":
            return 3n;
          case "tiers":
            return [address(10), address(11), address(12)].slice(
              Number(args[0]),
              Number(args[0] + args[1]),
            );
          case "buybackVault":
            return address(20);
          case "inventory":
            expect(args[1]).toBe(0);
            return {
              available: 3n,
              totalSpent: 7n,
              totalReceived: 10n,
              totalConvertedIn: 0n,
              totalBurned: 0n,
            };
          case "paymentToken":
            return target === address(12) ? address(2) : address(1);
          case "previewPaymentTotals":
            expect(args).toEqual([7n]);
            return {
              grossReceived: 100n,
              refunded: 5n,
              paidRaw: [10n, 2n, 1n, 1n],
              earnedScaled: [20n * scale, 3n * scale, 2n * scale, 1n * scale],
              unearnedScaled: [50n * scale, 2n * scale, 1n * scale, 1n * scale],
              unassignedMemberScaled: scale,
              allocationRatesScaled: [
                scale,
                scale / 2n,
                scale / 4n,
                scale / 4n,
              ],
              hasEligibleMembers: target !== address(12),
              status: {
                complete: target !== address(11),
                nextBoundary: target === address(10) ? 505n : 510n,
              },
            };
          default:
            throw new Error(functionName);
        }
      },
    ),
  };
  return client as unknown as PublicClient;
}
it("pins pages to one block, respects caller budgets, and keeps currencies separate", async () => {
  const client = fixture();
  const first = await readPaymentFlowPage(client, 31337, address(9), {
    limit: 2n,
    accountingSteps: 7n,
  });
  expect(first.nextOffset).toBe(2n);
  const second = await readPaymentFlowPage(client, 31337, address(9), {
    offset: first.nextOffset,
    blockNumber: first.blockNumber,
    limit: 2n,
    accountingSteps: 7n,
  });
  expect(second.nextOffset).toBeUndefined();
  expect(client.getBlock).toHaveBeenLastCalledWith({ blockNumber: 100n });
  const totals = aggregatePaymentFlow([first, second]);
  expect(totals).toHaveLength(2);
  expect(totals[0]).toMatchObject({
    gross: 200n,
    refunded: 10n,
    complete: false,
    paid: [20n, 4n, 2n, 2n],
    earned: [40n * scale, 6n * scale, 4n * scale, 2n * scale],
  });
  expect(totals[1]).toMatchObject({ gross: 100n, complete: true });
});
it("does not silently double count repeated tiers", async () => {
  const page = await readPaymentFlowPage(fixture(), 31337, address(9), {
    accountingSteps: 7n,
  });
  expect(() => aggregatePaymentFlow([page, page])).toThrow("Duplicate");
});
it("rejects missing tiers and RPC failures instead of reporting zero", async () => {
  const client = fixture();
  vi.mocked(client.readContract)
    .mockResolvedValueOnce(3n)
    .mockResolvedValueOnce([]);
  await expect(readPaymentFlowPage(client, 31337, address(9))).rejects.toThrow(
    "incomplete",
  );
  vi.mocked(client.readContract).mockRejectedValueOnce(
    new Error("RPC unavailable"),
  );
  await expect(readPaymentFlowPage(client, 31337, address(9))).rejects.toThrow(
    "RPC unavailable",
  );
});
it("rejects zero page sizes", async () => {
  await expect(
    readPaymentFlowPage(fixture(), 31337, address(9), { limit: 0n }),
  ).rejects.toThrow("Invalid");
});

it("counts up earnings, counts down pending, and freezes partial or boundary-limited totals", async () => {
  const page = await readPaymentFlowPage(fixture(), 31337, address(9), {
    accountingSteps: 7n,
  });
  const [partial, complete] = aggregatePaymentFlow([page]);
  expect(projectedAmount(paymentFlowStream(partial, "earned", 0), 2000)).toBe(
    40n,
  );
  expect(projectedAmount(paymentFlowStream(complete, "earned", 0), 2000)).toBe(
    22n,
  );
  expect(projectedAmount(paymentFlowStream(complete, "pending", 0), 2000)).toBe(
    48n,
  );
  expect(projectedAmount(paymentFlowStream(complete, "earned", 1), 2000)).toBe(
    3n,
  );
  expect(projectedAmount(paymentFlowStream(complete, "pending", 1), 2000)).toBe(
    1n,
  );
  expect(projectedAmount(paymentFlowStream(complete, "earned", 0), 20000)).toBe(
    30n,
  );
  expect(partial.nextBoundary).toBe(505n);
});
it("rejects mixed snapshots instead of animating inconsistent rates", async () => {
  const page = await readPaymentFlowPage(fixture(), 31337, address(9), {
    accountingSteps: 7n,
  });
  expect(() =>
    aggregatePaymentFlow([page, { ...page, blockNumber: 101n }]),
  ).toThrow("one snapshot");
});

it("counts vault inventory once across pages and combines only unspent funds with earned fees", async () => {
  const client = fixture();
  const first = await readPaymentFlowPage(client, 31337, address(9), {
    limit: 1n,
    accountingSteps: 7n,
  });
  const second = await readPaymentFlowPage(client, 31337, address(9), {
    offset: 1n,
    blockNumber: first.blockNumber,
    limit: 1n,
    accountingSteps: 7n,
  });
  const [currency] = aggregatePaymentFlow([first, second]);
  expect(currency.buybackAvailable).toBe(3n);
  expect(currency.buybackSpent).toBe(7n);
  expect(
    currency.buybackAvailable +
      projectedAmount(paymentFlowStream(currency, "earned", 3), 0),
  ).toBe(5n);
});
