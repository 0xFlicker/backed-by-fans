import { expect, it, vi } from "vitest";
import { zeroAddress, type Address, type PublicClient } from "viem";
import { prepareAdvance } from "./prepare-burn";
const addr = (n: number) =>
  ("0x" + n.toString(16).padStart(40, "0")) as Address;
function fixture(count = 8n, complete = false, held = 0n) {
  const read = vi.fn(
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
        case "isRegisteredTier":
          return args![0] === addr(99);
        case "buybackVault":
          return addr(3);
        case "protocolToken":
          return addr(4);
        case "tierCount":
          return count;
        case "paymentTokenCount":
          return 2n;
        case "tiers":
          return Array.from({ length: Number(args![1]) }, (_, i) =>
            addr(20 + Number(args![0]) + i),
          );
        case "paymentTokens":
          return [addr(6), addr(7)];
        case "canonicalAsset":
          return args![0] === addr(6) ? zeroAddress : args![0];
        case "accountingStatus":
          return {
            accountedThrough: 900n,
            nextBoundary: 950n,
            scheduledMembers: 100000n,
            complete,
          };
        case "protocolFeeEarnedHeld":
          return held;
        case "revision":
          return 2n;
        case "lastAssetBuyAt":
          return args![0] === zeroAddress ? 100n : 0n;
        default:
          throw new Error("Unexpected read " + address + "." + functionName);
      }
    },
  );
  const block = vi.fn(async () => ({ number: 10n, timestamp: 1000n }));
  return {
    read,
    block,
    client: { readContract: read, getBlock: block } as unknown as PublicClient,
  };
}
it("builds at most eight unique tiers sharing exactly 25 requested checkpoints", async () => {
  const f = fixture();
  const plan = await prepareAdvance(f.client, addr(1));
  expect(plan.tiers).toHaveLength(8);
  expect(new Set(plan.tiers.map((item) => item.tier)).size).toBe(8);
  expect(
    plan.tiers.reduce((sum, item) => sum + item.maxAccountingSteps, 0n),
  ).toBe(25n);
  expect(plan.purchases.map((item) => item.asset)).toEqual([
    addr(4),
    addr(7),
    zeroAddress,
  ]);
  expect(plan.deadline).toBe(1300n);
  expect(
    f.read.mock.calls.some(([item]) =>
      ["totalMinted", "protocolFeeState"].includes(item.functionName),
    ),
  ).toBe(false);
});
it("lets a caller target a registered tier beyond the automatic discovery page", async () => {
  const f = fixture(10000n);
  const plan = await prepareAdvance(f.client, addr(1), addr(99));
  expect(plan.tiers).toEqual([{ tier: addr(99), maxAccountingSteps: 25n }]);
  expect(
    f.read.mock.calls.some(([request]) => request.functionName === "tiers"),
  ).toBe(false);
  await expect(prepareAdvance(f.client, addr(1), addr(98))).rejects.toThrow(
    "not registered",
  );
});
it("rotates bounded tier pages from fresh blocks without scanning membership IDs", async () => {
  const f = fixture(20n);
  const first = await prepareAdvance(f.client, addr(1));
  f.block.mockResolvedValue({ number: 11n, timestamp: 1001n });
  const next = await prepareAdvance(f.client, addr(1));
  expect(first.tiers[0].tier).not.toBe(next.tiers[0].tier);
  expect(next.tiers).toHaveLength(4);
  expect(next.accountingCoverageIncomplete).toBe(true);
});
it("uses zero accounting budget for settled release-only work", async () => {
  const plan = await prepareAdvance(fixture(1n, true, 5n).client, addr(1));
  expect(plan.tiers).toEqual([{ tier: addr(20), maxAccountingSteps: 0n }]);
});
it("does not add completed empty tiers", async () => {
  expect(
    (await prepareAdvance(fixture(1n, true).client, addr(1))).tiers,
  ).toEqual([]);
});
it("keeps healthy tiers when another tier cannot be read", async () => {
  const f = fixture(2n);
  const original = f.read.getMockImplementation()!;
  f.read.mockImplementation(async (request) => {
    if (request.address === addr(20)) throw new Error("unavailable");
    return original(request);
  });
  const plan = await prepareAdvance(f.client, addr(1));
  expect(plan.unavailableTiers).toBe(1);
  expect(plan.tiers).toEqual([{ tier: addr(21), maxAccountingSteps: 25n }]);
});
it("does not prepare purchases before protocol token binding", async () => {
  const f = fixture();
  const original = f.read.getMockImplementation()!;
  f.read.mockImplementation(async (request) =>
    request.functionName === "protocolToken" ? zeroAddress : original(request),
  );
  expect((await prepareAdvance(f.client, addr(1))).purchases).toEqual([]);
});
