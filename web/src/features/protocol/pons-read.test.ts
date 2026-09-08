import { describe, expect, it, vi } from "vitest";
import { zeroAddress, type PublicClient } from "viem";
import { readPonsCompensation, readPonsHistoryPage } from "./pons-read";

const token = "0x1111111111111111111111111111111111111111" as const;
const factory = "0x2222222222222222222222222222222222222222" as const;
const curve = "0x3333333333333333333333333333333333333333" as const;
const vault = "0x4444444444444444444444444444444444444444" as const;
const creator = "0x5555555555555555555555555555555555555555" as const;
const protocol = "0x6666666666666666666666666666666666666666" as const;
const hook = "0x7777777777777777777777777777777777777777" as const;
const escrow = "0x8888888888888888888888888888888888888888" as const;
const launch = {
  token,
  curve,
  creatorFeeRecipient: creator,
  deployer: creator,
  pairToken: zeroAddress,
  exists: true,
  phase: 0,
  buybackEnabled: true,
  poolFee: 3000,
  tickSpacing: 60,
};
function fixture() {
  const readContract = vi.fn(
    async ({
      functionName,
      address,
    }: {
      functionName: string;
      address: string;
    }) => {
      const values: Record<string, unknown> = {
        launchFactory: factory,
        getLaunchedToken: launch,
        factory,
        owner: protocol,
        feeEscrow: escrow,
        buybackVault: vault,
        memeHook: hook,
        feeSweepOperator: protocol,
        protocolFeeRecipient: protocol,
        pendingCreatorFeeRecipient: [zeroAddress, 0n, 0n],
        quoteFeeBalance: 100n,
        buybackQuoteBalance: 20n,
        creatorTaxBalance: 0n,
        vestingTerms: [creator, protocol, 3000],
        totalLocked: 1000n,
        totalReleased: 200n,
        vestedAmount: 400n,
        releasable: 200n,
        vestingStart: 100n,
        VESTING_DURATION: 157680000n,
        readyToGraduate: false,
        balanceOf: 10n,
        balanceOfToken: 70n,
        pendingFees: 3n,
        pendingBuyback: 1n,
        pendingCreatorTax: 0n,
      };
      if (!(functionName in values))
        throw new Error(`Unexpected ${address}.${functionName}`);
      return values[functionName];
    },
  );
  return {
    readContract,
    getChainId: vi.fn().mockResolvedValue(31337),
    getBlockNumber: vi.fn().mockResolvedValue(2000n),
    getLogs: vi.fn().mockResolvedValue([]),
  };
}
const context = { chainId: 31337, protocolToken: token };

describe("separate Pons compensation", () => {
  it.each([0, 1, 2, 3])(
    "preserves lifecycle phase %i and the separate curve-ready flag",
    async (phase) => {
      const rpc = fixture();
      const original = rpc.readContract.getMockImplementation()!;
      rpc.readContract.mockImplementation(async (request) =>
        request.functionName === "getLaunchedToken"
          ? { ...launch, phase }
          : request.functionName === "readyToGraduate"
            ? true
            : original(request),
      );
      const result = await readPonsCompensation(
        rpc as unknown as PublicClient,
        context,
      );
      expect(result.status).toBe("valid");
      if (result.status !== "valid") throw new Error("missing snapshot");
      expect(result.data).toMatchObject({ phase, curveReady: true });
      expect(result.data.poolPending).toHaveLength(phase === 2 ? 2 : 0);
    },
  );
  it("captures one block and keeps vesting, claimable escrow and membership burns distinct", async () => {
    const rpc = fixture();
    const result = await readPonsCompensation(
      rpc as unknown as PublicClient,
      context,
    );
    expect(result.status).toBe("valid");
    if (result.status !== "valid") throw new Error("missing snapshot");
    expect(result.data.vesting).toMatchObject({
      deposited: 1000n,
      released: 200n,
      vested: 400n,
      unvested: 600n,
      releasable: 200n,
    });
    expect(result.data.creatorEscrow).toEqual({
      nativeETH: 10n,
      protocolTokens: 70n,
      scope: "shared-recipient-ledger",
    });
    expect(result.data.bondingPending).toEqual({
      tradingFees: 100n,
      buybackEarmark: 20n,
      creatorExtraTax: 0n,
    });
    expect(result.data).not.toHaveProperty("membershipRevenue");
    expect(result.data).not.toHaveProperty("burned");
    expect(
      rpc.readContract.mock.calls.every(
        ([request]) =>
          (request as { blockNumber?: bigint }).blockNumber === 2000n,
      ),
    ).toBe(true);
  });
  it("rejects wrong chain before reading protocol addresses", async () => {
    const rpc = fixture();
    rpc.getChainId.mockResolvedValue(4663);
    expect(
      (await readPonsCompensation(rpc as unknown as PublicClient, context))
        .status,
    ).toBe("wrong-chain");
    expect(rpc.readContract).not.toHaveBeenCalled();
  });
  it("surfaces a failed external read instead of inventing zero compensation", async () => {
    const rpc = fixture();
    rpc.readContract.mockRejectedValueOnce(new Error("transport unavailable"));
    expect(
      (await readPonsCompensation(rpc as unknown as PublicClient, context))
        .status,
    ).toBe("unavailable");
  });
  it("pages external history at a fixed block and never reports a partial page as lifetime totals", async () => {
    const rpc = fixture();
    const page = await readPonsHistoryPage(rpc as unknown as PublicClient, {
      ...context,
      factory,
      vault,
      escrow,
      curve,
      creator,
      capturedBlock: 5000n,
      fromBlock: 100n,
    });
    expect(page.coverage).toEqual({
      fromBlock: 100n,
      throughBlock: 2099n,
      capturedBlock: 5000n,
      complete: false,
    });
    expect(page.nextCursor).toEqual({ blockNumber: 2100n, logIndex: 0 });
    expect(page).not.toHaveProperty("totalClaimed");
  });
  it("retains log-index pagination when more than 50 events share a block", async () => {
    const rpc = fixture();
    rpc.getLogs.mockImplementation(async ({ address }: { address: string }) =>
      address === factory
        ? Array.from({ length: 51 }, (_, i) => ({
            address,
            blockNumber: 100n,
            logIndex: i,
            transactionHash: `0x${"1".repeat(64)}`,
            eventName: "BuybackEnabledUpdated",
            args: { token, enabled: !!(i % 2), controller: creator },
          }))
        : [],
    );
    const args = {
      ...context,
      factory,
      vault,
      escrow,
      curve,
      creator,
      capturedBlock: 100n,
      fromBlock: 100n,
    };
    const page = await readPonsHistoryPage(
      rpc as unknown as PublicClient,
      args,
    );
    expect(page.events).toHaveLength(50);
    expect(page.nextCursor).toEqual({ blockNumber: 100n, logIndex: 50 });
    const last = await readPonsHistoryPage(rpc as unknown as PublicClient, {
      ...args,
      cursor: page.nextCursor!,
    });
    expect(last.events).toHaveLength(1);
    expect(last.coverage.complete).toBe(true);
    expect(last.nextCursor).toBeNull();
  });
});
