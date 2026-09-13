import { beforeEach, expect, it, vi } from "vitest";
import {
  BaseError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  type Address,
  type PublicClient,
} from "viem";
import { membershipTierAbi } from "@/contracts";
import {
  canReduceClaim,
  claimPrefix,
  claimUnits,
  removeClaimed,
  refreshClaimScope,
  discoverClaimAll,
  type ClaimAllScope,
} from "./claim-all";
import type { ReadyDeployment } from "@/lib/config";
const m = vi.hoisted(() => ({ page: vi.fn(), owner: vi.fn() }));
vi.mock("./account-discovery", () => ({
  discoverAccountPage: m.page,
  readAccountOwnerPage: m.owner,
}));
const wallet = "0x1111111111111111111111111111111111111111" as Address;
const factory = "0x2222222222222222222222222222222222222222" as Address;
const tier = "0x3333333333333333333333333333333333333333" as Address;
const deployment = {
  chainId: 31337,
  factoryAddress: factory,
} as ReadyDeployment;
beforeEach(() => vi.resetAllMocks());
it("retains unclaimed IDs when a transaction includes only a tier prefix", () => {
  const scope: ClaimAllScope = {
    wallet,
    factory,
    chainId: 31337,
    completed: 0,
    removedPositions: 0,
    queue: [
      { tier, name: "Fans", tokenIds: [1n, 2n, 3n] },
      { tier: factory, name: "Creator", tokenIds: [] },
    ],
  };
  expect(claimUnits(scope.queue)).toBe(4);
  const batch = claimPrefix(scope.queue, 2);
  expect(batch[0].tokenIds).toEqual([1n, 2n]);
  removeClaimed(scope, batch);
  expect(scope.queue[0].tokenIds).toEqual([3n]);
  removeClaimed(scope, claimPrefix(scope.queue, 2));
  expect(scope.queue).toEqual([]);
});
it("discovers every owner page at one captured block", async () => {
  const block = vi.fn(async () => 42n);
  const client = { getBlockNumber: block } as unknown as PublicClient;
  m.page.mockResolvedValue({
    results: [
      {
        tier,
        name: "Fans",
        positions: [{ tokenId: 1n }],
        ownerComplete: false,
        nextOwnerOffset: 1n,
      },
    ],
    skipped: [],
    scannedTo: 1n,
    total: 1n,
    nextOffset: null,
  });
  m.owner.mockResolvedValue({
    positions: [{ tokenId: 2n }],
    ownerComplete: true,
    nextOwnerOffset: 2n,
  });
  const scope = await discoverClaimAll(client, deployment, wallet, vi.fn());
  expect(scope.queue[0].tokenIds).toEqual([1n, 2n]);
  expect(m.page.mock.calls[0][1].blockNumber).toBe(42n);
  expect(m.owner.mock.calls[0][1]).toMatchObject({
    blockNumber: 42n,
    offset: 1n,
  });
  expect(block).toHaveBeenCalledTimes(1);
});
it("fails visibly when any discovery page is incomplete", async () => {
  m.page.mockResolvedValue({ skipped: ["RPC failed"], results: [] });
  await expect(
    discoverClaimAll(
      { getBlockNumber: async () => 42n } as unknown as PublicClient,
      deployment,
      wallet,
      vi.fn(),
    ),
  ).rejects.toThrow("discovery is incomplete");
});
it("drops transferred positions without adding newly received positions", async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce(wallet)
    .mockResolvedValueOnce(factory);
  const refreshed = await refreshClaimScope(
    {
      getBlockNumber: async () => 42n,
      readContract: read,
    } as unknown as PublicClient,
    wallet,
    [{ tier, name: "Fans", tokenIds: [1n, 2n] }],
  );
  expect(refreshed[0].tokenIds).toEqual([1n]);
  expect(read).toHaveBeenCalledTimes(2);
});
it("propagates failed ownership reads instead of treating them as burned positions", async () => {
  await expect(
    refreshClaimScope(
      {
        getBlockNumber: async () => 42n,
        readContract: async () => {
          throw new Error("RPC offline");
        },
      } as unknown as PublicClient,
      wallet,
      [{ tier, name: "Fans", tokenIds: [1n] }],
    ),
  ).rejects.toThrow("RPC offline");
});

it("reduces explicit node resource failures but never masks contract revert data", () => {
  const resource = new ContractFunctionRevertedError({
    abi: membershipTierAbi,
    functionName: "claimRewards",
    message: "out of gas",
    data: "0x",
  });
  expect(
    canReduceClaim(new BaseError("RPC execution failed", { cause: resource })),
  ).toBe(true);
  const business = new ContractFunctionRevertedError({
    abi: membershipTierAbi,
    functionName: "claimRewards",
    data: encodeErrorResult({
      abi: membershipTierAbi,
      errorName: "TokenOwnerOnly",
    }),
  });
  expect(canReduceClaim(business)).toBe(false);
  expect(canReduceClaim(new Error("User rejected the request"))).toBe(false);
});
