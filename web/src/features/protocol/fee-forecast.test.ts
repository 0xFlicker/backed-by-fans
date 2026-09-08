import { describe, expect, it, vi } from "vitest";
import type { PublicClient } from "viem";
import {
  forecastMemberFees,
  reconcileTierFees,
  readFeeForecastPage,
  readNextFeeLotPage,
  type MemberFeeProjection,
  type TierFeeLedger,
} from "./fee-forecast";
const tier = "0x1111111111111111111111111111111111111111" as const;
const member = (): MemberFeeProjection => ({
  id: 1n,
  generation: 0n,
  state: {
    generation: 0n,
    consumedPaid: 3n * 86400n,
    allocated: 12n,
    earned: 3n,
    unearned: 9n,
    uncheckpointedEarned: 3n,
    refunded: 0n,
    cancellationRounding: 0n,
    lotCount: 1n,
  },
  lots: [
    { startPaid: 0n, endPaid: 12n * 86400n, fee: 12n, cumulativeFee: 12n },
  ],
  lotOffset: 0n,
  completeLots: true,
});
const ledger = (): TierFeeLedger => ({
  blockNumber: 10n,
  timestamp: 1000n,
  totalMembers: 1n,
  allocated: 12n,
  holdings: 12n,
  earnedHeld: 0n,
  released: 0n,
  refunded: 0n,
  cancellationRounding: 0n,
});
describe("conditional fee forecasts", () => {
  it("continues bounded lot pages at one block and refuses generation drift", async () => {
    const m = member();
    m.lots = Array(100).fill(m.lots[0]);
    m.state.lotCount = 201n;
    m.completeLots = false;
    const rpc = {
      readContract: vi.fn(
        async ({
          functionName,
          args,
        }: {
          functionName: string;
          args: readonly bigint[];
        }) =>
          functionName === "protocolFeeState"
            ? m.state
            : Array(args[1] === 100n ? 100 : 1).fill(m.lots[0]),
      ),
    };
    const next = await readNextFeeLotPage(
      rpc as unknown as PublicClient,
      tier,
      10n,
      m,
    );
    expect(next.lots).toHaveLength(200);
    expect(next.completeLots).toBe(false);
    const final = await readNextFeeLotPage(
      rpc as unknown as PublicClient,
      tier,
      10n,
      next,
    );
    expect(final.lots).toHaveLength(201);
    expect(final.completeLots).toBe(true);
    expect(rpc.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "protocolFeeLots",
        args: [1n, 200n, 100n],
        blockNumber: 10n,
      }),
    );
    rpc.readContract.mockResolvedValueOnce({
      ...m.state,
      generation: 1n,
    } as never);
    await expect(
      readNextFeeLotPage(rpc as unknown as PublicClient, tier, 10n, m),
    ).rejects.toThrow("snapshot changed");
  });
  it("distinguishes three earned awaiting release from zero immediately releasable", () => {
    const result = reconcileTierFees(ledger(), {
      blockNumber: 10n,
      timestamp: 1000n,
      totalMembers: 1n,
      offset: 0n,
      members: [member()],
    });
    expect(result).toMatchObject({
      storedConserved: true,
      projectedConserved: true,
      complete: true,
      unearned: 9n,
      earnedAwaitingRelease: 3n,
      immediatelyReleasable: 0n,
    });
    expect(forecastMemberFees(member())).toEqual({
      next24h: 1n,
      next7d: 7n,
      next30d: 9n,
      complete: true,
    });
  });
  it("counts releases as movement of allocated fees and cancellation rounding only once", () => {
    const snapshot = ledger();
    snapshot.earnedHeld = 3n;
    const m = member();
    m.state.uncheckpointedEarned = 0n;
    expect(
      reconcileTierFees(snapshot, {
        blockNumber: 10n,
        timestamp: 1000n,
        totalMembers: 1n,
        offset: 0n,
        members: [m],
      }).projectedConserved,
    ).toBe(true);
    snapshot.earnedHeld = 0n;
    snapshot.holdings = 9n;
    snapshot.released = 3n;
    expect(
      reconcileTierFees(snapshot, {
        blockNumber: 10n,
        timestamp: 1000n,
        totalMembers: 1n,
        offset: 0n,
        members: [m],
      }).storedConserved,
    ).toBe(true);
    snapshot.holdings = 0n;
    snapshot.refunded = 8n;
    snapshot.released = 4n;
    snapshot.cancellationRounding = 1n;
    m.state.unearned = 0n;
    m.state.consumedPaid = 0n;
    m.state.generation = 1n;
    m.generation = 1n;
    m.lots = [];
    m.state.lotCount = 0n;
    expect(forecastMemberFees(m).next30d).toBe(0n);
    expect(
      reconcileTierFees(snapshot, {
        blockNumber: 10n,
        timestamp: 1000n,
        totalMembers: 1n,
        offset: 0n,
        members: [m],
      }).storedConserved,
    ).toBe(true);
  });
  it("refuses full-tier projections for partial or mismatched population/time coverage", () => {
    const coverage = {
      blockNumber: 10n,
      timestamp: 1000n,
      totalMembers: 1n,
      offset: 0n,
      members: [member()],
    };
    for (const changed of [
      { ...coverage, offset: 1n },
      { ...coverage, members: [] },
      { ...coverage, totalMembers: 2n },
      { ...coverage, blockNumber: 11n },
      { ...coverage, timestamp: 1001n },
    ]) {
      expect(reconcileTierFees(ledger(), changed)).toMatchObject({
        complete: false,
        projectedConserved: null,
        earnedAwaitingRelease: null,
        storedConserved: true,
      });
    }
  });
  it("uses lot-local integer floors, paid-clock gaps, and rejects canceled generation mixing", () => {
    const m = member();
    m.state.consumedPaid = 1n;
    m.lots = [
      { startPaid: 0n, endPaid: 3n, fee: 2n, cumulativeFee: 2n },
      { startPaid: 100000n, endPaid: 100003n, fee: 3n, cumulativeFee: 5n },
    ];
    m.state.lotCount = 2n;
    expect(forecastMemberFees(m)).toMatchObject({
      next24h: 2n,
      next7d: 5n,
      next30d: 5n,
    });
    m.generation = 1n;
    expect(() => forecastMemberFees(m)).toThrow("generation");
  });
  it("marks a truncated lot forecast as partial without inventing the rest", () => {
    const m = member();
    m.completeLots = false;
    m.state.lotCount = 200n;
    expect(forecastMemberFees(m)).toMatchObject({
      complete: false,
      next24h: 1n,
    });
  });
  it("captures one timestamp, limits member/lot pages to 100, and exposes the next page", async () => {
    const client = {
      getBlock: vi.fn().mockResolvedValue({ number: 10n, timestamp: 1000n }),
      readContract: vi.fn(
        async ({ functionName }: { functionName: string }) => {
          if (functionName === "totalMinted") return 201n;
          if (functionName === "protocolFeeState")
            return { ...member().state, lotCount: 101n };
          if (functionName === "protocolFeeLots")
            return Array(100).fill(member().lots[0]);
          return 0n;
        },
      ),
    };
    const page = await readFeeForecastPage(
      client as unknown as PublicClient,
      tier,
      { offset: 100n, limit: 100 },
    );
    expect(page.members).toHaveLength(100);
    expect(page.nextOffset).toBe(200n);
    expect(page.members[0].completeLots).toBe(false);
    expect(
      client.readContract.mock.calls.every(
        ([call]) =>
          (call as unknown as { blockNumber: bigint }).blockNumber === 10n,
      ),
    ).toBe(true);
    await expect(
      readFeeForecastPage(client as unknown as PublicClient, tier, {
        limit: 101,
      }),
    ).rejects.toThrow("100");
  });
  it("propagates unavailable RPC instead of returning a zero forecast", async () => {
    const client = {
      getBlock: vi.fn().mockRejectedValue(new Error("RPC unavailable")),
    };
    await expect(
      readFeeForecastPage(client as unknown as PublicClient, tier),
    ).rejects.toThrow("RPC unavailable");
  });
});
