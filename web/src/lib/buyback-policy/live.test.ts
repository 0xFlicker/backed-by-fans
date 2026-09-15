import { describe, it, expect, vi } from "vitest";
import { zeroAddress, type PublicClient } from "viem";
import { quoteMarket, readMarketState } from "./live";
const token = "0x1111111111111111111111111111111111111111";
const market = (
  sellable = 9000n,
): Awaited<ReturnType<typeof readMarketState>> => ({
  executor: token,
  curve: token,
  lifecycle: 0,
  route: [],
  blockNumber: 1n,
  legs: [
    {
      input: zeroAddress,
      output: token,
      marginal: { numerator: 10n, denominator: 1n },
    },
  ],
  curveTerms: { quote: 1000n, tokens: 10000n, fee: 100n, tax: 100n, sellable },
});
describe("net bonding quotes", () => {
  it("uses integer-rounded base fees and creator tax", async () => {
    const client = { simulateContract: vi.fn() } as unknown as PublicClient;
    const q = await quoteMarket(client, market(), 100n);
    expect(q[0].outputRaw).toBe(892n);
    expect(q[0].feeRaw).toBe(2n);
    expect(q[0].inputRaw).toBe(100n);
    expect(client.simulateContract).not.toHaveBeenCalled();
  });
  it("quotes the actual partial-fill spend at graduation", async () => {
    const q = await quoteMarket({} as PublicClient, market(100n), 100n);
    expect(q[0].outputRaw).toBe(100n);
    expect(q[0].inputRaw).toBe(12n);
    expect(q[0].inputRaw).toBeLessThan(100n);
  });
  it("rejects a dust batch that produces no output", async () => {
    const m = market();
    m.curveTerms!.tokens = 1n;
    await expect(quoteMarket({} as PublicClient, m, 1n)).rejects.toThrow(
      "zero output",
    );
  });
});

it("quotes explicit operator routes without reading the stored public route", async () => {
  const values: Record<string, unknown> = {
    executor: token,
    curve: token,
    lifecycle: 0,
    getLaunchedToken: { exists: true, curve: token, pairToken: zeroAddress },
    quoteReserve: 1000n,
    tokenReserve: 10000n,
    feeBps: 100n,
    creatorTaxBps: 100n,
    sellableTokens: 9000n,
    currentSnipeTaxBps: 0n,
  };
  const readContract = vi.fn(
    async ({ functionName }: { functionName: string }) => {
      if (!(functionName in values))
        throw new Error(`Unexpected read ${functionName}`);
      return values[functionName];
    },
  );
  const state = await readMarketState(
    { readContract } as unknown as PublicClient,
    {
      vault: token,
      asset: zeroAddress,
      protocolToken: token,
      blockNumber: 1n,
      route: [],
    },
  );
  expect(state.route).toEqual([]);
  expect(
    readContract.mock.calls.some(([call]) => call.functionName === "route"),
  ).toBe(false);
  expect(
    (await quoteMarket({} as PublicClient, state, 100n))[0].outputRaw,
  ).toBe(892n);
});
