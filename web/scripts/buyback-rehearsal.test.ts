// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseRehearsalInput, rehearseBuybacks } from "./buyback-rehearsal";
import { encodeEventTopics, encodeAbiParameters, zeroAddress } from "viem";
import { protocolBuybackVaultAbi } from "../src/contracts";
const address = "0x1111111111111111111111111111111111111111";
const input = () => ({
  chainId: 31337,
  factory: address,
  vault: address,
  capturedBlock: "12",
  globalMinInterval: "60",
  assets: [
    { asset: address, minInput: "10", maxInput: "100", minInterval: "3600" },
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
      { asset: zeroAddress, minInput: "1", maxInput: "400", minInterval: "60" },
    ],
    targetPercent: 100,
    maxGasPercent: 2.5,
  });
beforeEach(() => {
  mock.gas = 1n;
  mock.revert = false;
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
          if (call.functionName === "processingStatus")
            result = {
              status: block.blockOverrides.time < last + 60n ? 6 : 0,
              maxInput: available < 400n ? available : 400n,
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
