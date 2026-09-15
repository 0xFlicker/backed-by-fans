// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseRehearsalInput, rehearseBuybacks } from "./buyback-rehearsal";
import { encodeEventTopics, encodeAbiParameters, zeroAddress } from "viem";
import { protocolBuybackVaultAbi } from "../src/contracts";
const address = "0x1111111111111111111111111111111111111111";
const policy = () => ({
  lifecycle: 0 as const,
  rates: [{ numerator: "1", denominator: "1" }],
  expiresAt: "0",
  inputBudget: "0",
});
const input = () => ({
  chainId: 31337,
  factory: address,
  vault: address,
  capturedBlock: "12",
  globalMinInterval: "60",
  assets: [
    {
      asset: address,
      minInput: "10",
      maxInput: "100",
      minInterval: "3600",
      policy: policy(),
    },
  ],
  targetPercent: 50,
  horizonHours: 24,
  maxGasPercent: 2.5,
});

describe("bounded settings rehearsal", () => {
  it("accepts exact units and a target without introducing expiry", () => {
    expect(parseRehearsalInput(input())).toMatchObject({
      targetPercent: 50,
      globalMinInterval: "60",
    });
  });
  it("requires positive output rates and accepts optional expiry and budgets", () => {
    expect(
      parseRehearsalInput({ ...input(), action: "activate-permissionless" })
        .assets[0].policy,
    ).toEqual(policy());
    const v = { ...input(), action: "activate-permissionless" };
    v.assets[0].policy.rates[0].denominator = "0";
    expect(() => parseRehearsalInput(v)).toThrow();
    expect(() =>
      parseRehearsalInput({
        ...input(),
        action: "activate-permissionless",
        assets: [{ ...input().assets[0], policy: undefined }],
      }),
    ).toThrow();
  });
  it("defaults to limits-only and discards any historical UI policy", () => {
    const parsed = parseRehearsalInput(input());
    expect(parsed.action).toBe("limits-only");
    expect(parsed.assets[0]).not.toHaveProperty("policy");
    expect(() =>
      parseRehearsalInput({ ...input(), action: "unknown" }),
    ).toThrow("Invalid rehearsal action");
  });
  it.each(["0", "-1", "1.5", "1e18", (2n ** 128n).toString()])(
    "rejects an invalid minimum %s",
    (value) => {
      const v = input();
      v.assets[0].minInput = value;
      expect(() => parseRehearsalInput(v)).toThrow();
    },
  );
  it("rejects excessive scope, duplicate currencies and unsafe dimensions", () => {
    expect(() => parseRehearsalInput({ ...input(), chainId: 4663 })).toThrow();
    expect(() =>
      parseRehearsalInput({ ...input(), horizonHours: 721 }),
    ).toThrow();
    expect(() =>
      parseRehearsalInput({ ...input(), targetPercent: NaN }),
    ).toThrow();
    expect(() =>
      parseRehearsalInput({
        ...input(),
        assets: [input().assets[0], input().assets[0]],
      }),
    ).toThrow();
    const v = input();
    v.assets[0].maxInput = "9";
    expect(() => parseRehearsalInput(v)).toThrow();
  });
});

const mock = vi.hoisted(() => ({
  read: vi.fn(),
  simulate: vi.fn(),
  gas: 1n,
  revert: false,
  policyStatus: 0,
  remainingBudget: 1000n,
}));
vi.mock("viem", async (original) => ({
  ...(await original<typeof import("viem")>()),
  createPublicClient: () => ({
    getChainId: async () => 31337,
    getBlock: async () => ({
      number: 12n,
      timestamp: 1000n,
      hash: "0xabc",
      baseFeePerGas: 0n,
    }),
    getGasPrice: async () => 1n,
    readContract: mock.read,
    simulateBlocks: mock.simulate,
  }),
}));
const vault = "0x2222222222222222222222222222222222222222" as const;
const safe = "0x3333333333333333333333333333333333333333" as const;
const runner = "0x4444444444444444444444444444444444444444" as const;
const token = "0x5555555555555555555555555555555555555555" as const;
const scenario = () =>
  parseRehearsalInput({
    ...input(),
    vault,
    globalMinInterval: "60",
    assets: [
      {
        asset: zeroAddress,
        minInput: "1",
        maxInput: "400",
        minInterval: "60",
        policy: policy(),
      },
    ],
    targetPercent: 100,
    maxGasPercent: 2.5,
  });
beforeEach(() => {
  mock.gas = 1n;
  mock.revert = false;
  mock.policyStatus = 0;
  mock.remainingBudget = 1000n;
  vi.clearAllMocks();
  mock.read.mockImplementation(async ({ functionName, args }) => {
    switch (functionName) {
      case "buybackVault":
        return vault;
      case "owner":
        return safe;
      case "getOwners":
        return [runner];
      case "protocolToken":
        return token;
      case "totalSupply":
        return 1000000n;
      case "tierCount":
        return 0n;
      case "tiers":
        return [];
      case "burnRouter":
        return vault;
      case "canonicalAsset":
        return args[0];
      default:
        throw new Error(`Unexpected source read ${functionName}`);
    }
  });
  // The RPC owns temporary execution state. Every call starts from the same source snapshot.
  mock.simulate.mockImplementation(async ({ blocks }) => {
    let available = 1000n,
      policyStatus = mock.policyStatus,
      budget = mock.remainingBudget,
      supply = 1000000n,
      last = 0n,
      sequence = 0n;
    return blocks.map(
      (block: {
        blockOverrides: { time: bigint };
        calls: { functionName: string; args: unknown[] }[];
      }) => ({
        calls: block.calls.map((call) => {
          let result: unknown;
          let logs: unknown[] = [];
          const bucket = call.args[1];
          if (call.functionName === "setPermissionlessPolicy") {
            policyStatus = 0;
            budget = (call.args[4] as bigint) || 1000n;
          }
          if (call.functionName === "processingStatus")
            result = {
              status:
                policyStatus ||
                (budget === 0n
                  ? 13
                  : block.blockOverrides.time < last + 60n
                    ? 6
                    : 0),
              maxInput: [available, 400n, budget].reduce((a, b) =>
                a < b ? a : b,
              ),
              minInput: 1n,
              nextEligibleAt: last + 60n,
              revision: 1n,
            };
          if (call.functionName === "inventory")
            result = { available: bucket === 0 ? available : 0n };
          if (call.functionName === "totalSupply") result = supply;
          if (call.functionName === "process") {
            if (mock.revert)
              return {
                status: "failure",
                gasUsed: mock.gas,
                error: new Error("Pool unavailable"),
              };
            const amount = call.args[2] as bigint;
            if (block.blockOverrides.time < last + 60n)
              throw new Error("Cooldown was not respected");
            available -= amount;
            budget -= amount;
            supply -= amount * 2n;
            last = block.blockOverrides.time;
            sequence++;
            logs = [
              {
                address: vault,
                topics: encodeEventTopics({
                  abi: protocolBuybackVaultAbi,
                  eventName: "ConversionSettled",
                  args: { sequence, bucket: 0, input: zeroAddress },
                }),
                data: encodeAbiParameters(
                  [
                    { type: "address" },
                    { type: "uint256" },
                    { type: "uint256" },
                    { type: "uint64" },
                  ],
                  [token, amount, amount * 2n, 1n],
                ),
              },
              {
                address: vault,
                topics: encodeEventTopics({
                  abi: protocolBuybackVaultAbi,
                  eventName: "BuybackBurned",
                  args: { sequence, bucket: 0, input: zeroAddress },
                }),
                data: encodeAbiParameters(
                  [
                    { type: "uint256" },
                    { type: "uint256" },
                    { type: "uint8" },
                    { type: "uint64" },
                  ],
                  [amount, amount * 2n, 0, 1n],
                ),
              },
            ];
          }
          return {
            status: "success",
            result,
            gasUsed: call.functionName === "process" ? mock.gas : 1n,
            logs,
          };
        }),
      }),
    );
  });
});
it("replays successful purchases in order with cooldown timestamps and repeatable results", async () => {
  const first = await rehearseBuybacks("http://127.0.0.1:18557", scenario());
  expect(first.totals).toMatchObject({ batches: 3, burnedRaw: "2000" });
  const times = first.rows
    .filter((row) => row.status === "burned")
    .map((row) => BigInt(row.simulatedAt!));
  expect(times[1] - times[0]).toBe(60n);
  expect(times[2] - times[1]).toBe(60n);
  expect(await rehearseBuybacks("http://127.0.0.1:18557", scenario())).toEqual(
    first,
  );
  expect(
    mock.simulate.mock.calls.every(
      ([args]) => args.blockNumber === 12n && args.validation === false,
    ),
  ).toBe(true);
  const longest = mock.simulate.mock.calls.reduce((a, b) =>
    a[0].blocks.length > b[0].blocks.length ? a : b,
  )[0];
  expect(longest.blocks[0].calls[0]).toMatchObject({
    functionName: "setExecutionLimits",
    account: safe,
  });
  expect(
    longest.blocks[0].calls.map(
      (c: { functionName: string }) => c.functionName,
    ),
  ).toEqual(["setExecutionLimits"]);
  expect(
    longest.blocks
      .flatMap((b: { calls: unknown[] }) => b.calls)
      .filter((c: { functionName: string }) => c.functionName === "process"),
  ).toHaveLength(3);
});
it("discards gas-deferred simulated purchases and returns the measured amount and fee", async () => {
  mock.gas = 100n;
  const result = await rehearseBuybacks("http://127.0.0.1:18557", scenario());
  expect(result.totals.batches).toBe(0);
  expect(result.rows[0]).toMatchObject({
    status: "gas-deferred",
    gasWei: "0",
    estimate: { gasWei: "100", inputRaw: "400", nativeValueWei: "400" },
  });
  expect(result.totals.burnedRaw).toBe("0");
});
it("reports a reverted purchase without committing it to subsequent simulated state", async () => {
  mock.revert = true;
  const result = await rehearseBuybacks("http://127.0.0.1:18557", scenario());
  expect(result.rows[0]).toMatchObject({
    status: "unavailable",
    note: "Pool unavailable",
  });
  expect(result.totals.batches).toBe(0);
});
it("honors request cancellation before any RPC work", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    rehearseBuybacks("http://127.0.0.1:18557", scenario(), controller.signal),
  ).rejects.toThrow();
  expect(mock.simulate).not.toHaveBeenCalled();
});

it("does not revive a policy made stale by a route change", async () => {
  mock.policyStatus = 14;
  const result = await rehearseBuybacks("http://127.0.0.1:18557", {
    ...scenario(),
    assets: scenario().assets.map((asset) => ({ ...asset, policy: policy() })),
  });
  expect(result.totals.batches).toBe(0);
  expect(result.rows[0].note).toContain("status 14");
  expect(
    mock.simulate.mock.calls
      .flatMap(([args]) =>
        args.blocks.flatMap(
          (block: { calls: { functionName: string }[] }) => block.calls,
        ),
      )
      .some(
        (call: { functionName: string }) =>
          call.functionName === "setPermissionlessPolicy",
      ),
  ).toBe(false);
});
it("uses the budget remaining at the captured block instead of the old UI snapshot", async () => {
  mock.remainingBudget = 150n;
  const result = await rehearseBuybacks("http://127.0.0.1:18557", {
    ...scenario(),
    assets: scenario().assets.map((asset) => ({
      ...asset,
      policy: { ...policy(), inputBudget: "1000" },
    })),
  });
  const burned = result.rows.filter((row) => row.status === "burned");
  expect(burned).toHaveLength(1);
  expect(burned[0].inputRaw).toBe("150");
  expect(result.rows.some((row) => row.note.includes("status 13"))).toBe(true);
});
it.each([2, 10])(
  "preserves captured pause/operator restrictions (status %s)",
  async (status) => {
    mock.policyStatus = status;
    const result = await rehearseBuybacks("http://127.0.0.1:18557", scenario());
    expect(result.totals.batches).toBe(0);
    expect(result.rows[0].note).toContain(`status ${status}`);
  },
);
it("installs policies and enables public execution only for explicit activation", async () => {
  mock.policyStatus = 14;
  const result = await rehearseBuybacks("http://127.0.0.1:18557", {
    ...scenario(),
    action: "activate-permissionless",
    assets: scenario().assets.map((asset) => ({ ...asset, policy: policy() })),
  });
  expect(result.totals.batches).toBe(3);
  expect(
    mock.simulate.mock.calls[0][0].blocks[0].calls.slice(0, 4),
  ).toMatchObject([
    { functionName: "setExecutionLimits", account: safe },
    {
      functionName: "setPermissionlessPolicy",
      account: safe,
      args: [zeroAddress, 0, [{ numerator: 1n, denominator: 1n }], 0n, 0n],
    },
    { functionName: "setExecutionMode", account: safe, args: [1] },
    { functionName: "setBuybacksPaused", account: safe, args: [false] },
  ]);
});
