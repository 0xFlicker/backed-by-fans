import { percentageBps } from "../src/lib/buyback-settings/calculator";
import {
  createPublicClient,
  erc20Abi,
  formatUnits,
  getAddress,
  http,
  isAddressEqual,
  parseEventLogs,
  zeroAddress,
  type Abi,
  type Address,
  type ContractFunctionReturnType,
  type SimulateBlocksParameters,
  type SimulateBlocksReturnType,
} from "viem";
import {
  membershipFactoryAbi,
  protocolBurnRouterAbi,
  membershipTierAbi,
  protocolBuybackVaultAbi,
  iSafeAbi,
} from "../src/contracts";

export type RehearsalInput = {
  chainId: number;
  factory: Address;
  vault: Address;
  capturedBlock: string;
  globalMinInterval: string;
  assets: {
    asset: Address;
    minInput: string;
    maxInput: string;
    minInterval: string;
  }[];
  targetPercent: number;
  horizonHours: number;
  maxGasPercent: number;
};
export function parseRehearsalInput(value: unknown): RehearsalInput {
  if (!value || typeof value !== "object")
    throw new Error("Settings are required");
  const v = value as RehearsalInput;
  if (v.chainId !== 31337)
    throw new Error("Local rehearsal requires the Anvil network");
  const raw = (x: unknown, bits: number, positive = false) => {
    if (
      typeof x !== "string" ||
      !/^(0|[1-9][0-9]*)$/.test(x) ||
      BigInt(x) >= 2n ** BigInt(bits) ||
      (positive && BigInt(x) === 0n)
    )
      throw new Error("Invalid execution amount or interval");
    return x;
  };
  if (!Array.isArray(v.assets) || v.assets.length < 1 || v.assets.length > 32)
    throw new Error("Choose between 1 and 32 currencies");
  for (const [n, min, max] of [
    [v.targetPercent, 0.01, 100],
    [v.horizonHours, 1 / 60, 720],
    [v.maxGasPercent, 0.01, 100],
  ]) {
    if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max)
      throw new Error("Invalid target, timeframe or gas threshold");
  }
  const assets = v.assets.map((x) => {
    const minInput = raw(x.minInput, 128, true),
      maxInput = raw(x.maxInput, 128, true);
    if (BigInt(minInput) > BigInt(maxInput))
      throw new Error("Minimum batch exceeds maximum batch");
    return {
      asset: getAddress(x.asset),
      minInput,
      maxInput,
      minInterval: raw(x.minInterval, 64),
    };
  });
  if (new Set(assets.map((x) => x.asset.toLowerCase())).size !== assets.length)
    throw new Error("Duplicate currencies");
  return {
    chainId: 31337,
    factory: getAddress(v.factory),
    vault: getAddress(v.vault),
    capturedBlock: raw(v.capturedBlock, 256),
    globalMinInterval: raw(v.globalMinInterval, 64),
    assets,
    targetPercent: v.targetPercent,
    horizonHours: v.horizonHours,
    maxGasPercent: v.maxGasPercent,
  };
}

export type RehearsalRow = {
  asset: Address;
  inputRaw: string;
  burnedRaw: string;
  gasWei: string;
  status: string;
  note: string;
  simulatedAt?: string;
  estimate?: { inputRaw: string; nativeValueWei: string; gasWei: string };
};

type Block = SimulateBlocksParameters["blocks"][number];
type Call = {
  to: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  account: Address;
  gas: bigint;
  gasPrice: bigint;
};
type Processing = ContractFunctionReturnType<
  typeof protocolBuybackVaultAbi,
  "view",
  "processingStatus"
>;
type Inventory = ContractFunctionReturnType<
  typeof protocolBuybackVaultAbi,
  "view",
  "inventory"
>;

/** One request's proposed transactions, replayed by viem. Nothing persists on the RPC or between requests. */
export async function rehearseBuybacks(
  sourceRpc: string,
  input: RehearsalInput,
  signal?: AbortSignal,
) {
  const client = createPublicClient({
    transport: http(sourceRpc, {
      retryCount: 0,
      timeout: 15_000,
      fetchOptions: { signal },
    }),
  });
  signal?.throwIfAborted();
  if ((await client.getChainId()) !== input.chainId)
    throw new Error("Rehearsal network changed");
  const captured = await client.getBlock({
    blockNumber: BigInt(input.capturedBlock),
  });
  const [vault, safe] = await Promise.all([
    client.readContract({
      address: input.factory,
      abi: membershipFactoryAbi,
      functionName: "buybackVault",
      blockNumber: captured.number,
    }),
    client.readContract({
      address: input.factory,
      abi: membershipFactoryAbi,
      functionName: "owner",
      blockNumber: captured.number,
    }),
  ]);
  if (!isAddressEqual(vault, input.vault))
    throw new Error("Factory and vault do not match");
  const [gasPrice, owners, protocolToken, tierCount] = await Promise.all([
    client.getGasPrice(),
    client.readContract({
      address: safe,
      abi: iSafeAbi,
      functionName: "getOwners",
      blockNumber: captured.number,
    }),
    client.readContract({
      address: vault,
      abi: protocolBuybackVaultAbi,
      functionName: "protocolToken",
      blockNumber: captured.number,
    }),
    client.readContract({
      address: input.factory,
      abi: membershipFactoryAbi,
      functionName: "tierCount",
      blockNumber: captured.number,
    }),
  ]);
  const runner = owners[0];
  if (!runner) throw new Error("The protocol Safe has no owner");
  const supplyBefore = await client.readContract({
    address: protocolToken,
    abi: erc20Abi,
    functionName: "totalSupply",
    blockNumber: captured.number,
  });
  const canonical = await Promise.all(
    input.assets.map((x) =>
      client.readContract({
        address: vault,
        abi: protocolBuybackVaultAbi,
        functionName: "canonicalAsset",
        args: [x.asset],
        blockNumber: captured.number,
      }),
    ),
  );
  if (
    canonical.some(
      (asset, i) => !isAddressEqual(asset, input.assets[i].asset),
    ) ||
    new Set(canonical.map((x) => x.toLowerCase())).size !== canonical.length
  )
    throw new Error("Use ETH once for combined ETH/WETH settings");
  if (canonical.some((asset) => isAddressEqual(asset, protocolToken)))
    throw new Error(
      "Protocol tokens burn directly; no purchase settings are needed",
    );
  if (tierCount > 100n)
    throw new Error(
      "Rehearsal is bounded to 100 tiers; narrow the local fixture",
    );
  const call = (
    to: Address,
    abi: Abi,
    functionName: string,
    args: readonly unknown[] = [],
    account = runner,
  ): Call => ({
    to,
    abi,
    functionName,
    args,
    account,
    gas: 15_000_000n,
    gasPrice,
  });
  const setup: Call[] = [
    call(
      vault,
      protocolBuybackVaultAbi,
      "setExecutionLimits",
      [
        BigInt(input.globalMinInterval),
        canonical,
        input.assets.map((x) => ({
          minInput: BigInt(x.minInput),
          maxInput: BigInt(x.maxInput),
          minInterval: BigInt(x.minInterval),
        })),
      ],
      safe,
    ),
  ];
  const tiers = await client.readContract({
    address: input.factory,
    abi: membershipFactoryAbi,
    functionName: "tiers",
    args: [0n, tierCount],
    blockNumber: captured.number,
  });
  const router = await client.readContract({
    address: input.factory,
    abi: membershipFactoryAbi,
    functionName: "burnRouter",
    blockNumber: captured.number,
  });
  for (const tier of tiers) {
    signal?.throwIfAborted();
    const payment = await client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "paymentToken",
      blockNumber: captured.number,
    });
    const currency = await client.readContract({
      address: vault,
      abi: protocolBuybackVaultAbi,
      functionName: "canonicalAsset",
      args: [payment],
      blockNumber: captured.number,
    });
    if (!canonical.some((x) => isAddressEqual(x, currency))) continue;
    const [status, held] = await Promise.all([
      client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "accountingStatus",
        blockNumber: captured.number,
      }),
      client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "protocolFeeEarnedHeld",
        blockNumber: captured.number,
      }),
    ]);
    const maxAccountingSteps =
      !status.complete && status.scheduledMembers > 0n ? 25n : 0n;
    if (maxAccountingSteps || held > 0n)
      setup.push(
        call(router, protocolBurnRouterAbi, "advance", [
          [{ tier, maxAccountingSteps }],
          [],
          captured.timestamp + 300n,
        ]),
      );
  }
  const makeBlock = (calls: Call[], number: bigint, time: bigint): Block => ({
    blockOverrides: {
      number,
      time,
      gasLimit: 100_000_000n,
      baseFeePerGas: captured.baseFeePerGas ?? 0n,
    },
    calls,
  });
  const start = captured.timestamp + 1n;
  const blocks: Block[] = [
    {
      ...makeBlock(setup, captured.number + 1n, start),
      stateOverrides: [
        { address: safe, balance: 100n * 10n ** 18n },
        { address: runner, balance: 100n * 10n ** 18n },
      ],
    },
  ];
  let time = start + 1n;
  const until = start + BigInt(Math.floor(input.horizonHours * 3600));
  let lastResult: SimulateBlocksReturnType | undefined;
  // Probes are discarded. Accepted purchases form the prefix of the next simulation.
  const replay = async (probes: Call[]) => {
    signal?.throwIfAborted();
    const candidate = makeBlock(
      probes,
      captured.number + BigInt(blocks.length) + 1n,
      time,
    );
    const result = await client.simulateBlocks({
      blockNumber: captured.number,
      blocks: [...blocks, candidate],
      validation: false,
    });
    for (const prior of result.slice(0, -1))
      for (const r of prior.calls) if (r.status !== "success") throw r.error;
    lastResult = result;
    return { candidate, calls: result.at(-1)!.calls };
  };
  const requireResult = (
    result: SimulateBlocksReturnType[number]["calls"][number],
  ) => {
    if (result.status !== "success") throw result.error;
    return result.result;
  };
  const inventoryCall = (asset: Address, bucket: 0 | 1) =>
    call(vault, protocolBuybackVaultAbi, "inventory", [asset, bucket]);
  const targets = input.assets.flatMap((asset) =>
    ([0, 1] as const).map((bucket) => ({
      asset: asset.asset,
      bucket,
      remaining: 0n,
      done: false,
    })),
  );
  const initial = await replay(
    targets.map((x) => inventoryCall(x.asset, x.bucket)),
  );
  for (let i = 0; i < targets.length; i++)
    targets[i].remaining =
      ((requireResult(initial.calls[i]) as Inventory).available *
        percentageBps(input.targetPercent)) /
      10000n;
  let totalGas = lastResult![0].calls.reduce(
      (sum, r) => sum + r.gasUsed * gasPrice,
      0n,
    ),
    burned = 0n,
    batches = 0;
  const rows: RehearsalRow[] = [];
  while (
    batches < 64 &&
    time <= until &&
    targets.some((x) => !x.done && x.remaining > 0n)
  ) {
    let next = until + 1n,
      progressed = false;
    for (const target of targets) {
      if (target.done || target.remaining === 0n || time > until) continue;
      const read = await replay([
        call(vault, protocolBuybackVaultAbi, "processingStatus", [
          target.asset,
          target.bucket,
        ]),
        inventoryCall(zeroAddress, target.bucket),
      ]);
      const state = requireResult(read.calls[0]) as Processing;
      const ethBefore = requireResult(read.calls[1]) as Inventory;
      if (state.status === 6) {
        if (state.nextEligibleAt < next) next = state.nextEligibleAt;
        continue;
      }
      const amount =
        state.maxInput < target.remaining ? state.maxInput : target.remaining;
      const defer = (
        status: string,
        note: string,
        estimate?: RehearsalRow["estimate"],
      ) => {
        target.done = true;
        rows.push({
          asset: target.asset,
          inputRaw: "0",
          burnedRaw: "0",
          gasWei: "0",
          status,
          note,
          estimate,
        });
      };
      if (state.status !== 0 || amount < state.minInput || amount === 0n) {
        defer(
          "deferred",
          `Purchase unavailable (status ${state.status}); funds remain in the vault.`,
        );
        continue;
      }
      const process = call(vault, protocolBuybackVaultAbi, "process", [
        target.asset,
        target.bucket,
        amount,
        state.revision,
        time + 120n,
      ]);
      const attempt = await replay([
        process,
        inventoryCall(zeroAddress, target.bucket),
        call(protocolToken, erc20Abi, "totalSupply"),
      ]);
      const executed = attempt.calls[0];
      if (executed.status !== "success") {
        defer(
          "unavailable",
          executed.error.message
            .replace(/https?:\/\/[^\s]+/g, "[RPC endpoint]")
            .slice(0, 1200),
        );
        continue;
      }
      const logs = (executed.logs ?? []).filter((log) =>
        isAddressEqual(log.address, vault),
      );
      const events = parseEventLogs({ abi: protocolBuybackVaultAbi, logs });
      const burn = events.find(
        (event) =>
          event.eventName === "BuybackBurned" &&
          isAddressEqual(event.args.input, target.asset) &&
          event.args.bucket === target.bucket &&
          event.args.revision === state.revision,
      );
      if (
        !burn ||
        burn.eventName !== "BuybackBurned" ||
        burn.args.inputSpent <= 0n ||
        burn.args.inputSpent > amount ||
        burn.args.burned <= 0n
      )
        throw new Error("Simulated burn logs did not reconcile");
      const nativeLeg = events.find(
        (event) =>
          event.eventName === "ConversionSettled" &&
          event.args.sequence === burn.args.sequence &&
          event.args.bucket === target.bucket &&
          isAddressEqual(event.args.input, zeroAddress) &&
          isAddressEqual(event.args.output, protocolToken),
      );
      if (
        !nativeLeg ||
        nativeLeg.eventName !== "ConversionSettled" ||
        nativeLeg.args.spent === 0n
      )
        throw new Error("Simulated ETH purchase leg is missing");
      const ethValue = nativeLeg.args.spent;
      const gasWei = executed.gasUsed * gasPrice;
      const estimate = {
        inputRaw: burn.args.inputSpent.toString(),
        nativeValueWei: ethValue.toString(),
        gasWei: gasWei.toString(),
      };
      if (gasWei * 10000n > ethValue * percentageBps(input.maxGasPercent)) {
        defer(
          "gas-deferred",
          `A larger purchase can bring network fees below your ${input.maxGasPercent}% target.`,
          estimate,
        );
        continue;
      }
      const supply = requireResult(attempt.calls[2]) as bigint;
      if (supplyBefore - supply !== burned + burn.args.burned)
        throw new Error("Simulated burns do not reconcile with total supply");
      const ethAfter = requireResult(attempt.calls[1]) as Inventory;
      // Commit only to the in-memory transaction description, never to the chain.
      blocks.push({ ...attempt.candidate, calls: [process] });
      target.remaining -=
        burn.args.inputSpent < target.remaining
          ? burn.args.inputSpent
          : target.remaining;
      if (
        !isAddressEqual(target.asset, zeroAddress) &&
        ethAfter.available > ethBefore.available
      ) {
        const residual = ethAfter.available - ethBefore.available;
        const existing = targets.find(
          (x) =>
            isAddressEqual(x.asset, zeroAddress) && x.bucket === target.bucket,
        );
        if (existing) {
          existing.remaining += residual;
          existing.done = false;
        } else
          targets.push({
            asset: zeroAddress,
            bucket: target.bucket,
            remaining: residual,
            done: false,
          });
      }
      burned += burn.args.burned;
      totalGas += gasWei;
      batches++;
      progressed = true;
      rows.push({
        asset: target.asset,
        inputRaw: burn.args.inputSpent.toString(),
        burnedRaw: burn.args.burned.toString(),
        gasWei: gasWei.toString(),
        estimate,
        status: "burned",
        note: `Purchase ${batches}, ${target.bucket === 0 ? "membership fees" : "donations"}.`,
        simulatedAt: time.toString(),
      });
      time++;
      if (batches === 64) break;
    }
    if (!progressed) {
      if (next > until) break;
      time = next > time ? next : time + 1n;
    }
  }
  const remaining = targets.filter((x) => x.remaining > 0n);
  for (const x of remaining.filter((x) => !x.done))
    rows.push({
      asset: x.asset,
      inputRaw: "0",
      burnedRaw: "0",
      gasWei: "0",
      status: "deferred",
      note: "Some target funds remain beyond the selected timeframe or 64-purchase preview limit.",
    });
  const ending = await client.getBlock({ blockNumber: captured.number });
  if (ending.hash !== captured.hash)
    throw new Error("The snapshot changed during rehearsal. Try again.");
  return {
    summary: `Previewed ${batches} buyback${batches === 1 ? "" : "s"} at ${formatUnits(gasPrice, 9)} gwei. ${remaining.length ? "Some funds would remain for later purchases." : "The selected target was processed."}`,
    rows,
    totals: {
      burnedRaw: burned.toString(),
      gasWei: totalGas.toString(),
      batches,
    },
    capturedBlock: captured.number.toString(),
    simulatedUntil: (time - 1n).toString(),
    truncated: batches === 64 && remaining.length > 0,
  };
}
