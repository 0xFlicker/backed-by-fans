// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  zeroAddress,
  encodeEventTopics,
  encodeAbiParameters,
  getAbiItem,
  type Address,
  type PublicClient,
  type WalletClient,
} from "viem";
import { createBuybackRunner, minimumOutputs } from "./run-buybacks";
import { protocolBuybackVaultAbi } from "../src/contracts";

const address = (id: number) =>
  `0x${id.toString(16).padStart(40, "0")}` as Address;
const factory = address(1),
  vault = address(2),
  token = address(3),
  asset = address(4),
  caller = address(5),
  pons = address(6),
  curve = address(7),
  router = address(8);
type Call = {
  address: Address;
  functionName: string;
  args?: readonly unknown[];
  blockNumber?: bigint;
  gas?: bigint;
};

// Mock the viem integration boundary and canonical application reads only. No
// test receipt polling, nonce inference, transaction journal or wallet engine.
function fixture(counts = [55n, 1n, 0n]) {
  const tiers = counts.map((_, i) => address(20 + i));
  const held = new Map<Address, bigint>();
  const recognized = new Set<string>();
  let pending = 0n,
    burned = 0n,
    phase = 0,
    ready = false;
  let captured = [...counts];
  const events: Record<string, unknown>[] = [];
  let lastWrite: Call | undefined;
  const client = {
    getBlock: vi.fn(async () => ({ number: 10n, timestamp: 1000n })),
    readContract: vi.fn(async (call: Call): Promise<unknown> => {
      switch (call.functionName) {
        case "executionMode":
          return 1;
        case "tierCount":
          return BigInt(captured.length);
        case "tiers":
          return tiers.slice(
            Number(call.args![0]),
            Number(call.args![0]) + Number(call.args![1]),
          );
        case "burnRouter":
          return router;
        case "accountingStatus": {
          const total = captured[tiers.indexOf(call.address)];
          const completed = BigInt(
            [...recognized].filter((id) => id.startsWith(call.address + ":"))
              .length,
          );
          return {
            accountedThrough: 900n,
            nextBoundary: 950n,
            scheduledMembers: total > completed ? 1n : 0n,
            complete: completed >= total,
          };
        }
        case "protocolFeeEarnedHeld":
          return held.get(call.address) ?? 0n;
        case "paymentToken":
          return asset;
        case "paymentTokenCount":
          return 1n;
        case "paymentTokens":
          return [asset];
        case "route":
          return { pools: [] };
        case "getLaunchedToken":
          return { exists: true, token, curve, pairToken: zeroAddress, phase };
        case "readyToGraduate":
          return ready;
        case "processingStatus":
          return call.args![0] === asset && call.args![1] === 0
            ? { status: 0, revision: 2n, available: pending, maxInput: pending }
            : { status: 3, revision: 0n, available: 7n, maxInput: 0n };
        case "inventory":
          return { available: pending, totalBurned: burned };
        case "totalSupply":
          return 1000000n - burned;
        default:
          throw new Error(`Unmocked read ${call.functionName}`);
      }
    }),
    simulateContract: vi.fn(async (call: Call) => ({
      request: { ...call, simulated: Symbol("exact viem request") },
    })),
    waitForTransactionReceipt: vi.fn(async () => ({
      status: "success",
      blockNumber: 11n,
      logs:
        lastWrite?.functionName === "process"
          ? [
              {
                address: vault,
                topics: encodeEventTopics({
                  abi: protocolBuybackVaultAbi,
                  eventName: "BuybackBurned",
                  args: { sequence: 1n, bucket: 0, input: asset },
                }),
                data: encodeAbiParameters(
                  getAbiItem({
                    abi: protocolBuybackVaultAbi,
                    name: "BuybackBurned",
                  }).inputs.filter((input) => !input.indexed),
                  [
                    lastWrite.args![2] as bigint,
                    lastWrite.args![2] as bigint,
                    0,
                    2n,
                  ],
                ),
              },
            ]
          : [],
    })),
  };
  const wallet = {
    writeContract: vi.fn(async (request: Call) => {
      lastWrite = request;
      if (request.functionName === "advance") {
        const item = (
          request.args![0] as { tier: Address; maxAccountingSteps: bigint }[]
        )[0];
        const completed = BigInt(
          [...recognized].filter((id) => id.startsWith(item.tier + ":")).length,
        );
        const remaining = captured[tiers.indexOf(item.tier)] - completed;
        const steps =
          remaining < item.maxAccountingSteps
            ? remaining
            : item.maxAccountingSteps;
        for (let i = 1n; i <= steps; i++)
          recognized.add(item.tier + ":" + (completed + i));
        pending += steps + (held.get(item.tier) ?? 0n);
        held.set(item.tier, 0n);
      } else if (request.functionName === "process") {
        pending -= request.args![2] as bigint;
        burned += request.args![2] as bigint;
      } else if (request.functionName === "graduate") phase = 1;
      else if (request.functionName === "createGraduatedPool") phase = 2;
      return `0x${"1".repeat(64)}`;
    }),
  };
  const create = (
    options: Partial<Parameters<typeof createBuybackRunner>[0]> = {},
  ) =>
    createBuybackRunner({
      client: client as unknown as PublicClient,
      wallet: wallet as unknown as WalletClient,
      account: caller,
      chainId: 31337,
      factory,
      vault,
      protocolToken: token,
      ponsFactory: pons,
      curve,
      assets: [asset],
      log: (e) => events.push(e),
      ...options,
    });
  return {
    client,
    wallet,
    create,
    events,
    tiers,
    recognized,
    get burned() {
      return burned;
    },
    grow() {
      captured = [56n, 2n, 0n];
    },
    ready() {
      ready = true;
    },
  };
}

describe("finite fair buyback collection", () => {
  it("keeps collection and independent assets working when Pons reads are unavailable", async () => {
    const f = fixture([1n]);
    const read = f.client.readContract.getMockImplementation()!;
    f.client.readContract.mockImplementation(async (call) => {
      if (call.functionName === "getLaunchedToken")
        throw new Error("RPC unavailable https://secret.example/private-token");
      return read(call);
    });
    await f.create().once();
    expect(f.burned).toBe(1n);
    expect(
      JSON.stringify(f.events, (_, v) =>
        typeof v === "bigint" ? String(v) : v,
      ),
    ).not.toContain("private-token");
    expect(
      f.events.some(
        (e) => e.action === "lifecycle" && e.outcome === "unavailable",
      ),
    ).toBe(true);
  });
  it("continues after a viem-confirmed revert without treating it as an unresolved write", async () => {
    const f = fixture([1n]);
    f.client.waitForTransactionReceipt.mockResolvedValueOnce({
      status: "reverted",
      blockNumber: 11n,
      logs: [],
    });
    await f.create().once();
    expect(f.events.some((e) => e.outcome === "reverted")).toBe(true);
  });
  it("gives every tier one bounded turn and resumes long backlogs on later sweeps", async () => {
    const f = fixture(),
      runner = f.create();
    const visited: Address[] = [];
    while (true) {
      const result = await runner.visit();
      if (result.tier) visited.push(result.tier);
      if (result.complete) break;
    }
    expect(visited).toEqual([f.tiers[0], f.tiers[1], f.tiers[2]]);
    expect(f.burned).toBe(26n);
    await runner.once();
    expect(f.burned).toBe(51n);
    await runner.once();
    expect(f.burned).toBe(56n);
    expect(f.recognized.has(`${f.tiers[0]}:55`)).toBe(true);
    const discovery = f.client.readContract.mock.calls.filter(([x]) =>
      ["tiers", "totalMinted"].includes(x.functionName),
    );
    expect(discovery.every(([x]) => x.blockNumber === 10n)).toBe(true);
    expect(discovery.some(([x]) => x.functionName === "totalMinted")).toBe(
      false,
    );
    expect(
      f.events.some((e) => e.action === "process" && e.reason === "NoRoute"),
    ).toBe(true);
    expect(
      f.client.simulateContract.mock.calls
        .filter(([x]) => x.functionName === "advance")
        .every(
          ([x]) =>
            (x.args![0] as { maxAccountingSteps: bigint }[])[0]
              .maxAccountingSteps <= 25n && x.gas === undefined,
        ),
    ).toBe(true);
  });
  it("retains scheduled progress, excludes new arrivals until wraparound, and restart does not duplicate release", async () => {
    const f = fixture(),
      runner = f.create();
    await runner.visit();
    expect(f.burned).toBe(0n); // Collection finishes before the one buyback sweep.
    expect(f.events.some((e) => e.action === "process")).toBe(false);
    f.grow();
    await runner.once();
    expect(f.burned).toBe(27n);
    await runner.once();
    expect(f.burned).toBe(52n);
    await runner.once();
    expect(f.burned).toBe(58n);
    const releases = f.wallet.writeContract.mock.calls.filter(
      ([x]) => x.functionName === "advance",
    ).length;
    await f.create().once();
    expect(f.burned).toBe(58n);
    expect(
      f.wallet.writeContract.mock.calls.filter(
        ([x]) => x.functionName === "advance",
      ),
    ).toHaveLength(releases);
  });
  it("does not advance a failed discovery page or announce a complete sweep", async () => {
    const f = fixture(),
      runner = f.create();
    const read = f.client.readContract.getMockImplementation()!;
    f.client.readContract.mockImplementation(async (call) => {
      if (call.functionName === "accountingStatus")
        throw new Error("RPC unavailable");
      return read(call);
    });
    await expect(runner.visit()).rejects.toThrow("RPC unavailable");
    expect(f.wallet.writeContract).not.toHaveBeenCalled();
    f.client.readContract.mockImplementation(read);
    expect((await runner.visit()).tier).toBe(f.tiers[0]);
  });
  it.each(["tierCount"])(
    "rejects excessive %s before any writes",
    async (method) => {
      const f = fixture(),
        runner = f.create(),
        read = f.client.readContract.getMockImplementation()!;
      f.client.readContract.mockImplementation(async (call) =>
        call.functionName === method ? 6000n : read(call),
      );
      await expect(runner.once()).rejects.toThrow("limited");
      expect(f.wallet.writeContract).not.toHaveBeenCalled();
    },
  );
  it("continues other tiers after a known failed release simulation", async () => {
    const f = fixture(),
      runner = f.create(),
      simulate = f.client.simulateContract.getMockImplementation()!;
    f.client.simulateContract.mockImplementation(async (call) => {
      if (
        call.functionName === "advance" &&
        (call.args![0] as { tier: Address }[])[0].tier === f.tiers[0]
      )
        throw new Error("Frozen payment token");
      return simulate(call);
    });
    await runner.once();
    expect(f.burned).toBe(1n);
    expect(f.recognized.size).toBe(1);
    expect(
      f.events.some(
        (e) =>
          e.outcome === "simulation-failed" &&
          String(e.reason).includes("Frozen"),
      ),
    ).toBe(true);
  });
  it.each(["write", "receipt"])(
    "halts on an unresolved %s and never replays that write",
    async (stage) => {
      const f = fixture(),
        runner = f.create();
      if (stage === "write")
        f.wallet.writeContract.mockRejectedValueOnce(
          new Error("transport lost"),
        );
      else
        f.client.waitForTransactionReceipt.mockRejectedValueOnce(
          new Error("receipt unavailable"),
        );
      await expect(runner.once()).rejects.toThrow();
      const writes = f.wallet.writeContract.mock.calls.length;
      await expect(runner.once()).rejects.toThrow("stopped");
      expect(f.wallet.writeContract).toHaveBeenCalledTimes(writes);
    },
  );
  it("passes the exact simulated request to viem and waits on its returned hash", async () => {
    const f = fixture([1n]);
    await f.create().once();
    for (let i = 0; i < f.wallet.writeContract.mock.calls.length; i++) {
      expect(f.wallet.writeContract.mock.calls[i][0]).toBe(
        (await f.client.simulateContract.mock.results[i].value).request,
      );
    }
    expect(f.client.waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: `0x${"1".repeat(64)}`,
    });
  });
  it("uses permissionless graduation then fresh state for pool creation, independently of BBF policy", async () => {
    const f = fixture([1n]);
    f.ready();
    await f.create().once();
    const names = f.wallet.writeContract.mock.calls.map(
      ([x]) => x.functionName,
    );
    expect(names.indexOf("graduate")).toBeLessThan(
      names.indexOf("createGraduatedPool"),
    );
    expect(names).not.toContain("setRoute");
    expect(names).not.toContain("setPolicy");
    expect(
      f.client.readContract.mock.calls.filter(
        ([x]) => x.functionName === "getLaunchedToken",
      ).length,
    ).toBeGreaterThanOrEqual(3);
  });
});

describe("operator output terms", () => {
  it("requires explicit bounded tolerance and positive quotes", () => {
    expect(
      minimumOutputs([{ outputRaw: 1000n }, { outputRaw: 2000n }], 50),
    ).toEqual([995n, 1990n]);
    expect(() => minimumOutputs([], 50)).toThrow("quotes");
    expect(() => minimumOutputs([{ outputRaw: 1n }], 50)).toThrow("positive");
    expect(() => minimumOutputs([{ outputRaw: 1000n }], NaN)).toThrow(
      "Explicit",
    );
    expect(() => minimumOutputs([{ outputRaw: 1000n }], 10000)).toThrow(
      "Explicit",
    );
  });
});

it("does not discover stored routes or attempt public market purchases in operator mode", async () => {
  const f = fixture([]);
  const read = f.client.readContract.getMockImplementation()!;
  f.client.readContract.mockImplementation(async (call) =>
    call.functionName === "executionMode" ? 0 : read(call),
  );
  await f.create().once();
  expect(
    f.client.readContract.mock.calls.some(
      ([call]) => call.functionName === "route",
    ),
  ).toBe(false);
  expect(
    f.client.simulateContract.mock.calls.some(
      ([call]) =>
        call.functionName === "processOperator" ||
        call.functionName === "process",
    ),
  ).toBe(false);
  expect(
    f.events.some(
      (event) => event.reason === "No offchain operator policy supplied",
    ),
  ).toBe(true);
});

it("quotes every operator request and supplies the offchain route and positive floors", async () => {
  const f = fixture([]);
  const read = f.client.readContract.getMockImplementation()!;
  f.client.readContract.mockImplementation(async (call) => {
    const market: Record<string, unknown> = {
      executionMode: 0,
      operator: caller,
      executor: caller,
      curve,
      lifecycle: 0,
      quoteReserve: 1000n,
      tokenReserve: 10000n,
      feeBps: 100n,
      creatorTaxBps: 100n,
      sellableTokens: 9000n,
      currentSnipeTaxBps: 0n,
    };
    if (call.functionName in market) return market[call.functionName];
    if (
      call.functionName === "processingStatus" &&
      call.args?.[0] === zeroAddress
    )
      return { status: 10, revision: 7n, available: 100n, maxInput: 0n };
    return read(call);
  });
  f.client.simulateContract.mockRejectedValue(
    new Error("Execution deliberately rejected by venue"),
  );
  await f
    .create({
      operatorPolicies: [{ asset: zeroAddress, amount: 100n, pools: [] }],
      toleranceBps: 50,
    })
    .once();
  const purchases = f.client.simulateContract.mock.calls.filter(
    ([call]) => call.functionName === "processOperator",
  );
  expect(purchases).toHaveLength(2);
  expect(purchases[0][0].args).toEqual([
    zeroAddress,
    0,
    100n,
    { pools: [] },
    [887n],
    1120n,
  ]);
  expect(
    f.client.readContract.mock.calls.some(
      ([call]) => call.functionName === "route",
    ),
  ).toBe(false);
  expect(f.wallet.writeContract).not.toHaveBeenCalled();
});

it("refreshes private quotes after each successful purchase without sending operator terms to read RPC", async () => {
  const f = fixture([]);
  let blockNumber = 10n;
  let lastRequest: Call | undefined;
  const publicRead = f.client.readContract.getMockImplementation()!;
  f.client.readContract.mockImplementation(async (call) => {
    if (call.functionName === "executionMode") return 0;
    if (call.functionName === "operator") return caller;
    if (
      call.functionName === "processingStatus" &&
      call.args?.[0] === zeroAddress
    )
      return { status: 10, revision: 7n, available: 100n, maxInput: 0n };
    return publicRead(call);
  });
  const privateClient = {
    getBlock: vi.fn(async () => ({
      number: blockNumber,
      timestamp: 990n + blockNumber,
    })),
    getGasPrice: vi.fn(async () => 1n),
    estimateContractGas: vi.fn(async () => 1n),
    readContract: vi.fn(async (call: Call) => {
      const values: Record<string, unknown> = {
        executor: caller,
        curve,
        lifecycle: 0,
        getLaunchedToken: { exists: true, curve, pairToken: zeroAddress },
        quoteReserve: call.blockNumber === 10n ? 1000n : 1100n,
        tokenReserve: 10000n,
        feeBps: 100n,
        creatorTaxBps: 100n,
        sellableTokens: 9000n,
        currentSnipeTaxBps: 0n,
      };
      if (!(call.functionName in values))
        throw new Error(`Unexpected private read ${call.functionName}`);
      return values[call.functionName];
    }),
    simulateContract: vi.fn(async (call: Call) => ({ request: call })),
  };
  f.wallet.writeContract.mockImplementation(async (request) => {
    lastRequest = request;
    return `0x${"1".repeat(64)}`;
  });
  f.client.waitForTransactionReceipt.mockImplementation(async () => {
    const request = lastRequest!;
    blockNumber++;
    return {
      status: "success",
      blockNumber,
      logs: [
        {
          address: vault,
          topics: encodeEventTopics({
            abi: protocolBuybackVaultAbi,
            eventName: "BuybackBurned",
            args: {
              sequence: blockNumber,
              bucket: request.args![1] as 0 | 1,
              input: zeroAddress,
            },
          }),
          data: encodeAbiParameters(
            getAbiItem({
              abi: protocolBuybackVaultAbi,
              name: "BuybackBurned",
            }).inputs.filter((input) => !input.indexed),
            [100n, 800n, 0, 0n],
          ),
        },
      ],
    };
  });
  await f
    .create({
      chainId: 4663,
      submissionMode: "private",
      operatorClient: privateClient as unknown as PublicClient,
      operatorPolicies: [{ asset: zeroAddress, amount: 100n, pools: [] }],
      toleranceBps: 50,
      maxGasPercent: 100,
    })
    .once();
  expect(f.wallet.writeContract).toHaveBeenCalledTimes(2);
  expect(
    privateClient.readContract.mock.calls
      .filter(([call]) => call.functionName === "quoteReserve")
      .map(([call]) => call.blockNumber),
  ).toEqual([10n, 11n]);
  const requests = privateClient.simulateContract.mock.calls.map(
    ([call]) => call,
  );
  expect(requests.map((call) => call.args![5])).toEqual([1120n, 1121n]);
  expect(requests[0].args![4]).not.toEqual(requests[1].args![4]);
  expect(privateClient.estimateContractGas).toHaveBeenCalledTimes(2);
  expect(f.client.simulateContract).not.toHaveBeenCalled();
  expect(
    f.client.readContract.mock.calls.some(
      ([call]) =>
        call.functionName === "quoteReserve" || call.functionName === "route",
    ),
  ).toBe(false);
});

it("fails closed if private operator transport is missing", () => {
  expect(() => fixture([]).create({ submissionMode: "private" })).toThrow(
    "trusted private RPC",
  );
});
