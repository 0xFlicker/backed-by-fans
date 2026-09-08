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
import { createBuybackRunner } from "./run-buybacks";
import { protocolBuybackVaultAbi } from "../src/contracts";

const address = (id: number) =>
  `0x${id.toString(16).padStart(40, "0")}` as Address;
const factory = address(1),
  vault = address(2),
  token = address(3),
  asset = address(4),
  caller = address(5),
  pons = address(6),
  curve = address(7);
type Call = {
  address: Address;
  functionName: string;
  args?: readonly unknown[];
  blockNumber?: bigint;
};

// Mock the viem integration boundary and canonical application reads only. No
// test receipt polling, nonce inference, transaction journal or wallet engine.
function fixture(counts = [205n, 1n, 0n]) {
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
      const id = `${call.address}:${call.args?.[0]}`;
      switch (call.functionName) {
        case "tierCount":
          return BigInt(captured.length);
        case "tiers":
          return tiers.slice(
            Number(call.args![0]),
            Number(call.args![0]) + Number(call.args![1]),
          );
        case "totalMinted":
          return captured[tiers.indexOf(call.address)];
        case "protocolFeeState":
          return { uncheckpointedEarned: recognized.has(id) ? 0n : 1n };
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
      if (request.functionName === "accrueProtocolFees") {
        for (const id of request.args![0] as bigint[]) {
          const key = `${request.address}:${id}`;
          if (!recognized.has(key))
            held.set(request.address, (held.get(request.address) ?? 0n) + 1n);
          recognized.add(key);
        }
      } else if (request.functionName === "releaseProtocolFees") {
        pending += held.get(request.address) ?? 0n;
        held.set(request.address, 0n);
      } else if (request.functionName === "process") {
        pending -= request.args![2] as bigint;
        burned += request.args![2] as bigint;
      } else if (request.functionName === "graduate") phase = 1;
      else if (request.functionName === "createGraduatedPool") phase = 2;
      return `0x${"1".repeat(64)}`;
    }),
  };
  const create = () =>
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
      captured = [206n, 2n, 0n];
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
  it("visits historical expired IDs past 100 round-robin within the documented finite bound", async () => {
    const f = fixture(),
      runner = f.create();
    const visited: Address[] = [];
    while (true) {
      const result = await runner.visit();
      if (result.tier) visited.push(result.tier);
      if (result.complete) break;
    }
    expect(visited).toEqual([
      f.tiers[0],
      f.tiers[1],
      f.tiers[2],
      f.tiers[0],
      f.tiers[0],
    ]);
    expect(f.burned).toBe(206n);
    expect(f.recognized.has(`${f.tiers[0]}:205`)).toBe(true);
    const discovery = f.client.readContract.mock.calls.filter(([x]) =>
      ["tiers", "totalMinted"].includes(x.functionName),
    );
    expect(discovery.every(([x]) => x.blockNumber === 10n)).toBe(true);
    expect(
      f.events.some((e) => e.action === "process" && e.reason === "NoRoute"),
    ).toBe(true);
    expect(
      f.client.simulateContract.mock.calls
        .filter(([x]) => x.functionName === "accrueProtocolFees")
        .every(([x]) => (x.args![0] as bigint[]).length <= 100),
    ).toBe(true);
  });
  it("retains scheduled progress, excludes new arrivals until wraparound, and restart does not duplicate release", async () => {
    const f = fixture(),
      runner = f.create();
    await runner.visit();
    expect(f.burned).toBe(100n);
    f.grow();
    await runner.once();
    expect(f.burned).toBe(206n);
    await runner.once();
    expect(f.burned).toBe(208n);
    const releases = f.wallet.writeContract.mock.calls.filter(
      ([x]) => x.functionName === "releaseProtocolFees",
    ).length;
    await f.create().once();
    expect(f.burned).toBe(208n);
    expect(
      f.wallet.writeContract.mock.calls.filter(
        ([x]) => x.functionName === "releaseProtocolFees",
      ),
    ).toHaveLength(releases);
  });
  it("does not advance a failed discovery page or announce a complete sweep", async () => {
    const f = fixture(),
      runner = f.create();
    const read = f.client.readContract.getMockImplementation()!;
    f.client.readContract.mockImplementation(async (call) => {
      if (call.functionName === "protocolFeeState")
        throw new Error("RPC unavailable");
      return read(call);
    });
    await expect(runner.visit()).rejects.toThrow("RPC unavailable");
    expect(f.wallet.writeContract).not.toHaveBeenCalled();
    f.client.readContract.mockImplementation(read);
    expect((await runner.visit()).firstId).toBe(1n);
  });
  it("continues other tiers after a known failed release simulation", async () => {
    const f = fixture(),
      runner = f.create(),
      simulate = f.client.simulateContract.getMockImplementation()!;
    f.client.simulateContract.mockImplementation(async (call) => {
      if (
        call.functionName === "releaseProtocolFees" &&
        call.address === f.tiers[0]
      )
        throw new Error("Frozen payment token");
      return simulate(call);
    });
    await runner.once();
    expect(f.burned).toBe(1n);
    expect(f.recognized.size).toBe(206);
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
