import { describe, expect, it, vi } from "vitest";
import {
  BaseError,
  ContractFunctionRevertedError,
  zeroAddress,
  type Address,
  type PublicClient,
} from "viem";
import { protocolBurnRouterAbi } from "@/contracts";
import { prepareBurn } from "./prepare-burn";

const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as Address;
function fixture(count = 2n, tierCount = 1n, held = 0n) {
  const reads = vi.fn(
    async ({
      functionName,
      args,
      address,
    }: {
      functionName: string;
      args?: readonly unknown[];
      address: Address;
    }) => {
      switch (functionName) {
        case "burnRouter":
          return addr(2);
        case "buybackVault":
          return addr(3);
        case "protocolToken":
          return addr(4);
        case "tierCount":
          return tierCount;
        case "paymentTokenCount":
          return 2n;
        case "tiers":
          return Array.from({ length: Number(args![1]) }, (_, i) =>
            addr(5 + Number(args![0]) + i),
          );
        case "paymentTokens":
          return [addr(6), addr(7)];
        case "canonicalAsset":
          return args![0] === addr(6) ? zeroAddress : args![0];
        case "totalMinted":
          return count;
        case "protocolFeeEarnedHeld":
          return held;
        case "protocolFeeState":
          return {
            uncheckpointedEarned: BigInt(args![0] as bigint),
            unearned: 1000n,
          };
        case "revision":
          return 2n;
        case "lastAssetBuyAt":
          return args![0] === zeroAddress ? 100n : 0n;
        default:
          throw new Error(`Unexpected read ${address}.${functionName}`);
      }
    },
  );
  const block = vi.fn().mockResolvedValue({ number: 10n, timestamp: 1000n });
  const simulations = vi.fn().mockResolvedValue({ result: 1n });
  return {
    client: {
      getBlock: block,
      readContract: reads,
      simulateContract: simulations,
    } as unknown as PublicClient,
    reads,
    block,
    simulations,
  };
}

describe("fresh burn planning", () => {
  it("unifies ETH/WETH and prioritizes currencies waiting longest", async () => {
    const f = fixture();
    const plan = await prepareBurn(f.client, addr(1));
    expect(plan.purchases.map((p) => p.asset)).toEqual([
      addr(4),
      addr(7),
      zeroAddress,
    ]);
    expect(plan.collections).toEqual([{ tier: addr(5), tokenIds: [2n, 1n] }]);
    expect(plan.deadline).toBe(1300n);
    expect(plan.moreCollections).toBe(false);
    expect(
      f.simulations.mock.calls.every(
        ([request]) =>
          request.blockNumber === 10n && request.account === addr(2),
      ),
    ).toBe(true);
    expect(
      f.reads.mock.calls.every(
        ([read]) => "blockNumber" in read && read.blockNumber === 10n,
      ),
    ).toBe(true);
  });
  it("rebuilds each click from fresh chain reads without a saved cursor", async () => {
    const f = fixture();
    await prepareBurn(f.client, addr(1));
    f.block.mockResolvedValue({ number: 20n, timestamp: 2000n });
    f.reads.mockClear();
    const plan = await prepareBurn(f.client, addr(1));
    expect(plan.deadline).toBe(2300n);
    expect(
      f.reads.mock.calls.every(
        ([read]) => "blockNumber" in read && read.blockNumber === 20n,
      ),
    ).toBe(true);
  });
  it("limits collection to 100 overdue memberships, including IDs past the first page", async () => {
    const f = fixture(205n);
    const plan = await prepareBurn(f.client, addr(1));
    expect(plan.collections[0].tokenIds).toHaveLength(100);
    expect(plan.collections[0].tokenIds[0]).toBe(200n);
    expect(plan.collections[0].tokenIds[99]).toBe(101n);
    expect(plan.moreCollections).toBe(true);
  });
  it("plans vault purchases and useful partial collection with 5001 memberships", async () => {
    const f = fixture(5001n);
    const plan = await prepareBurn(f.client, addr(1));
    expect(plan.purchases).toHaveLength(3);
    expect(plan.collections[0].tokenIds).toHaveLength(100);
    expect(plan.collections[0].tokenIds[0]).toBe(1100n);
    expect(
      f.reads.mock.calls.filter(
        ([read]) => read.functionName === "protocolFeeState",
      ),
    ).toHaveLength(100);
    expect(plan.moreCollections).toBe(true);

    f.block.mockResolvedValue({ number: 50n, timestamp: 2000n });
    const later = await prepareBurn(f.client, addr(1));
    expect(later.collections).toEqual([{ tier: addr(5), tokenIds: [5001n] }]);
    expect(later.purchases).toEqual(plan.purchases);
  });
  it("keeps released vault purchases available when 5001 credentials earn nothing", async () => {
    const f = fixture(5001n);
    const read = f.reads.getMockImplementation()!;
    f.reads.mockImplementation(async (request) =>
      request.functionName === "protocolFeeState"
        ? { uncheckpointedEarned: 0n, unearned: 0n }
        : read(request),
    );
    const plan = await prepareBurn(f.client, addr(1));
    expect(plan.collections).toEqual([]);
    expect(plan.purchases).toHaveLength(3);
    expect(plan.moreCollections).toBe(true);
    expect(f.simulations).not.toHaveBeenCalled();
  });
  it("rotates tier discovery past 1000 tiers without disabling vault purchases", async () => {
    const f = fixture(0n, 1001n);
    const plan = await prepareBurn(f.client, addr(1));
    expect(plan.purchases).toHaveLength(3);
    expect(plan.moreCollections).toBe(true);
    expect(
      f.reads.mock.calls.find(([read]) => read.functionName === "tiers")![0]
        .args,
    ).toEqual([1000n, 1n]);
    expect(
      f.reads.mock.calls.every(
        ([read]) => "blockNumber" in read && read.blockNumber === 10n,
      ),
    ).toBe(true);

    f.block.mockResolvedValue({ number: 11n, timestamp: 2000n });
    f.reads.mockClear();
    await prepareBurn(f.client, addr(1));
    expect(
      f.reads.mock.calls.find(([read]) => read.functionName === "tiers")![0]
        .args,
    ).toEqual([0n, 100n]);
  });
  it("shares 1000 membership reads fairly and advances member pages when a tier page returns", async () => {
    const f = fixture(20n, 200n);
    f.block.mockResolvedValue({ number: 0n, timestamp: 1000n });
    const first = await prepareBurn(f.client, addr(1));
    const memberReads = f.reads.mock.calls.filter(
      ([read]) => read.functionName === "protocolFeeState",
    );
    expect(memberReads).toHaveLength(1000);
    for (let i = 0; i < 100; i++) {
      expect(
        memberReads.filter(([read]) => read.address === addr(5 + i)),
      ).toHaveLength(10);
    }
    expect(first.collections).toHaveLength(8);
    expect(first.collections[0].tokenIds).toEqual([
      10n,
      9n,
      8n,
      7n,
      6n,
      5n,
      4n,
      3n,
      2n,
      1n,
    ]);
    expect(first.moreCollections).toBe(true);

    f.block.mockResolvedValue({ number: 2n, timestamp: 2000n });
    f.reads.mockClear();
    const next = await prepareBurn(f.client, addr(1));
    expect(next.collections[0].tier).toBe(first.collections[0].tier);
    expect(next.collections[0].tokenIds).toEqual([
      20n,
      19n,
      18n,
      17n,
      16n,
      15n,
      14n,
      13n,
      12n,
      11n,
    ]);
    expect(
      f.reads.mock.calls.every(
        ([read]) => "blockNumber" in read && read.blockNumber === 2n,
      ),
    ).toBe(true);
  });
  it("reads four tiers concurrently and preserves order when RPC responses finish out of order", async () => {
    const f = fixture(1n, 5n, 1n);
    const read = f.reads.getMockImplementation()!;
    const pending: {
      address: Address;
      functionName: string;
      resolve: () => void;
    }[] = [];
    f.reads.mockImplementation(async (request) => {
      if (
        request.functionName === "protocolFeeEarnedHeld" ||
        request.functionName === "protocolFeeState"
      ) {
        await new Promise<void>((resolve) =>
          pending.push({ ...request, resolve }),
        );
      }
      return read(request);
    });
    const planning = prepareBurn(f.client, addr(1));
    await vi.waitFor(() => expect(pending).toHaveLength(8));
    expect(pending.map(({ address }) => address)).toEqual([
      addr(5),
      addr(5),
      addr(6),
      addr(6),
      addr(7),
      addr(7),
      addr(8),
      addr(8),
    ]);
    expect(
      pending.filter(({ functionName }) => functionName === "protocolFeeState"),
    ).toHaveLength(4);
    for (const request of pending.splice(0).reverse()) request.resolve();
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    expect(pending.every(({ address }) => address === addr(9))).toBe(true);
    for (const request of pending.splice(0)) request.resolve();
    const plan = await planning;
    expect(plan.collections.map(({ tier }) => tier)).toEqual([
      addr(5),
      addr(6),
      addr(7),
      addr(8),
      addr(9),
    ]);
  });
  it("stops before the next discovery group after an RPC failure", async () => {
    const f = fixture(1n, 5n);
    const read = f.reads.getMockImplementation()!;
    const networkError = new Error("RPC unavailable");
    f.reads.mockImplementation(async (request) => {
      if (
        request.functionName === "protocolFeeState" &&
        request.address === addr(5)
      )
        throw networkError;
      return read(request);
    });
    await expect(prepareBurn(f.client, addr(1))).rejects.toBe(networkError);
    expect(
      f.reads.mock.calls.some(
        ([request]) =>
          request.functionName === "protocolFeeState" &&
          request.address === addr(9),
      ),
    ).toBe(false);
    expect(f.simulations).not.toHaveBeenCalled();
  });
  it("skips more than eight reverted held tiers without starving a healthy tier", async () => {
    const f = fixture(0n, 10n, 1n);
    const revert = new BaseError("Collection simulation failed", {
      cause: new ContractFunctionRevertedError({
        abi: protocolBurnRouterAbi,
        functionName: "collect",
        message: "Unavailable currency",
      }),
    });
    f.simulations.mockImplementation(async ({ args }) => {
      if (args[0].tier !== addr(14)) throw revert;
      return { result: 1n };
    });
    const plan = await prepareBurn(f.client, addr(1));
    expect(plan.collections).toEqual([{ tier: addr(14), tokenIds: [] }]);
    expect(plan.unavailableCollections).toBe(9);
    expect(plan.purchases).toHaveLength(3);
    expect(plan.moreCollections).toBe(true);
    expect(f.simulations).toHaveBeenCalledTimes(10);
  });
  it("propagates RPC failures instead of treating them as unavailable collections", async () => {
    const f = fixture();
    const networkError = new BaseError("RPC transport failed", {
      cause: new Error("Connection closed"),
    });
    f.simulations.mockRejectedValue(networkError);
    await expect(prepareBurn(f.client, addr(1))).rejects.toBe(networkError);
    expect(f.simulations).toHaveBeenCalledTimes(1);
  });
});
