import { percentageBps } from "../src/lib/buyback-settings/calculator";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  zeroAddress,
  erc20Abi,
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  type LocalAccount,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  membershipFactoryAbi,
  membershipTierAbi,
  protocolBuybackVaultAbi,
  iPonsLaunchFactoryAbi,
  iPonsBondingCurveAbi,
} from "../src/contracts";
import { readAdminContext, validateAdminRpc } from "./protocol-admin";
import sourceManifest from "../../contracts/external/verification/4663/sources.json" with { type: "json" };
import { readMarketState, quoteMarket } from "../src/lib/buyback-policy/live";
import { receiptBuyback } from "../src/features/protocol/buyback-reconciliation";

const PAGE = 100n;
const statuses = [
  "Ready",
  "NoInventory",
  "Paused",
  "NoRoute",
  "NoLimits",
  "BelowMinimum",
  "Cooldown",
  "LaunchPenalty",
  "GraduationPending",
];
const errorMessage = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).replace(
    /https?:\/\/[^\s]+/g,
    "[RPC endpoint]",
  );
type Options = {
  client: PublicClient;
  wallet: WalletClient;
  account: Address | LocalAccount;
  chainId: number;
  factory: Address;
  vault: Address;
  protocolToken: Address;
  ponsFactory: Address;
  curve: Address;
  assets?: readonly Address[];
  maxGasPercent?: number;
  log: (event: Record<string, unknown>) => void;
};
type TierCursor = { tier: Address; count: bigint; next: bigint; done: boolean };
type Sweep = {
  blockNumber: bigint;
  tiers: TierCursor[];
  nextTier: number;
  visits: bigint;
  visitBound: bigint;
};

/** Bounded discovery state only. viem owns every transaction and receipt. */
export function createBuybackRunner(options: Options) {
  const {
    client,
    wallet,
    account,
    factory,
    vault,
    protocolToken,
    ponsFactory,
    curve,
  } = options;
  let sweep: Sweep | undefined;
  let stopped = false;
  const log = (event: Record<string, unknown>) =>
    options.log({
      chainId: options.chainId,
      caller: typeof account === "string" ? account : account.address,
      ...event,
    });

  // Catch only simulation errors here. Submission/receipt errors stop this
  // process: another scheduled visit cannot recreate an unresolved write.
  async function act(
    address: Address,
    abi: Abi,
    functionName: string,
    args: readonly unknown[] = [],
    detail: Record<string, unknown> = {},
  ) {
    let simulation;
    try {
      simulation = await client.simulateContract({
        address,
        abi,
        functionName,
        args,
        account,
        ...(options.chainId === 31337 ? { gasPrice: 2_000_000_000n } : {}),
      });
    } catch (error) {
      log({
        action: functionName,
        address,
        ...detail,
        outcome: "simulation-failed",
        reason: errorMessage(error),
      });
      return undefined;
    }
    try {
      const hash = await wallet.writeContract(simulation.request);
      log({
        action: functionName,
        address,
        ...detail,
        outcome: "submitted",
        hash,
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      log({
        action: functionName,
        address,
        ...detail,
        outcome: receipt.status,
        hash: receipt.transactionHash,
        receipt,
      });
      return receipt.status === "success" ? receipt : undefined;
    } catch (error) {
      stopped = true;
      throw error;
    }
  }

  async function capture(): Promise<Sweep> {
    const blockNumber = (await client.getBlock()).number;
    const count = await client.readContract({
      address: factory,
      abi: membershipFactoryAbi,
      functionName: "tierCount",
      blockNumber,
    });
    if (count > 1000n)
      throw new Error(
        "One execution sweep is limited to 1,000 tiers; use bounded indexing for a larger deployment",
      );
    const tiers: TierCursor[] = [];
    let memberships = 0n;
    for (let offset = 0n; offset < count; offset += PAGE) {
      const limit = count - offset < PAGE ? count - offset : PAGE;
      const page = await client.readContract({
        address: factory,
        abi: membershipFactoryAbi,
        functionName: "tiers",
        args: [offset, limit],
        blockNumber,
      });
      if (BigInt(page.length) !== limit)
        throw new Error("Incomplete captured tier page");
      const bounds = await Promise.all(
        page.map((tier) =>
          client.readContract({
            address: tier,
            abi: membershipTierAbi,
            functionName: "totalMinted",
            blockNumber,
          }),
        ),
      );
      memberships += bounds.reduce((sum, value) => sum + value, 0n);
      if (memberships > 5000n)
        throw new Error(
          "One execution sweep is limited to 5,000 memberships; no writes were made",
        );
      page.forEach((tier, i) =>
        tiers.push({ tier, count: bounds[i], next: 1n, done: false }),
      );
    }
    if (new Set(tiers.map((x) => x.tier.toLowerCase())).size !== tiers.length)
      throw new Error("Duplicate captured tier");
    const visitBound = tiers.reduce(
      (sum, tier) =>
        sum + (tier.count === 0n ? 1n : (tier.count + PAGE - 1n) / PAGE),
      0n,
    );
    log({ action: "sweep-start", blockNumber, tierCount: count, visitBound });
    return { blockNumber, tiers, nextTier: 0, visits: 0n, visitBound };
  }

  async function progressGraduation() {
    // These are Pons's public lifecycle calls, with no operator sweep or Safe
    // configuration. Each successful call is followed by authoritative reads.
    const readLaunch = async () => {
      try {
        return await client.readContract({
          address: ponsFactory,
          abi: iPonsLaunchFactoryAbi,
          functionName: "getLaunchedToken",
          args: [protocolToken],
        });
      } catch (error) {
        log({
          action: "lifecycle",
          outcome: "unavailable",
          reason: errorMessage(error),
        });
        return undefined;
      }
    };
    let launch = await readLaunch();
    if (!launch) return;
    if (launch.phase === 0) {
      let ready;
      try {
        ready = await client.readContract({
          address: curve,
          abi: iPonsBondingCurveAbi,
          functionName: "readyToGraduate",
        });
      } catch (error) {
        log({
          action: "lifecycle",
          outcome: "unavailable",
          reason: errorMessage(error),
        });
        return;
      }
      if (ready) {
        if (
          !(await act(ponsFactory, iPonsLaunchFactoryAbi, "graduate", [
            protocolToken,
          ]))
        )
          return;
        launch = await readLaunch();
        if (!launch) return;
      }
    }
    if (launch.phase === 1) {
      if (
        !(await act(ponsFactory, iPonsLaunchFactoryAbi, "createGraduatedPool", [
          protocolToken,
        ]))
      )
        return;
      launch = await readLaunch();
      if (!launch) return;
    }
    log({ action: "lifecycle", phase: launch.phase });
  }

  async function processAvailable() {
    if (protocolToken === zeroAddress) {
      log({
        action: "buyback",
        outcome: "not-launched",
        reason:
          "Protocol token has not been deployed; collected fees remain in the vault.",
      });
      return;
    }
    // Read failures in optional Pons data must not hide direct-token inventory.
    // Lifecycle submissions still use the fatal unresolved-write boundary.
    await progressGraduation();
    const block = await client.getBlock();
    const assetMap = new Map<string, Address>();
    const add = (asset: Address) => {
      const canonical =
        asset.toLowerCase() ===
        sourceManifest.records.weth.address.toLowerCase()
          ? zeroAddress
          : asset;
      assetMap.set(canonical.toLowerCase(), canonical);
    };
    [zeroAddress, protocolToken, ...(options.assets ?? [])].forEach(add);
    const count = await client.readContract({
      address: factory,
      abi: membershipFactoryAbi,
      functionName: "paymentTokenCount",
      blockNumber: block.number,
    });
    for (let offset = 0n; offset < count; offset += PAGE) {
      const limit = count - offset < PAGE ? count - offset : PAGE;
      const page = await client.readContract({
        address: factory,
        abi: membershipFactoryAbi,
        functionName: "paymentTokens",
        args: [offset, limit],
        blockNumber: block.number,
      });
      if (BigInt(page.length) !== limit)
        throw new Error("Incomplete payment-asset page");
      page.forEach(add);
    }
    for (const asset of [...assetMap.values()]) {
      try {
        const route = await client.readContract({
          address: vault,
          abi: protocolBuybackVaultAbi,
          functionName: "route",
          args: [asset],
          blockNumber: block.number,
        });
        route.pools.forEach((pool) => {
          add(pool.currency0);
          add(pool.currency1);
        });
      } catch (error) {
        log({
          action: "route-read",
          asset,
          outcome: "unavailable",
          reason: errorMessage(error),
        });
      }
    }
    for (const asset of assetMap.values())
      for (const bucket of [0, 1] as const) {
        let state;
        try {
          state = await client.readContract({
            address: vault,
            abi: protocolBuybackVaultAbi,
            functionName: "processingStatus",
            args: [asset, bucket],
          });
        } catch (error) {
          log({
            action: "process",
            asset,
            bucket,
            outcome: "unavailable",
            reason: errorMessage(error),
          });
          continue;
        }
        const detail = {
          asset,
          bucket,
          revision: state.revision,
          amount: state.maxInput,
          available: state.available,
        };
        if (state.status !== 0 || state.maxInput === 0n) {
          log({
            action: "process",
            ...detail,
            outcome: "pending",
            reason: statuses[state.status] ?? "UnknownStatus",
          });
          continue;
        }
        const deadline = (await client.getBlock()).timestamp + 120n;
        if (
          options.maxGasPercent !== undefined &&
          asset.toLowerCase() !== protocolToken.toLowerCase()
        ) {
          try {
            const block = await client.getBlock();
            const gasPrice =
              options.chainId === 31337
                ? 2_000_000_000n
                : await client.getGasPrice();
            const market = await readMarketState(client, {
              vault,
              asset,
              protocolToken,
              blockNumber: block.number,
            });
            const quotes = await quoteMarket(client, market, state.maxInput);
            const ethValue = quotes.at(-1)!.inputRaw;
            const gas = await client.estimateContractGas({
              address: vault,
              abi: protocolBuybackVaultAbi,
              functionName: "process",
              args: [asset, bucket, state.maxInput, state.revision, deadline],
              account,
            });
            if (
              gas * gasPrice * 10000n >
              ethValue * percentageBps(options.maxGasPercent)
            ) {
              log({
                action: "process",
                ...detail,
                outcome: "gas-deferred",
                reason: `Gas exceeds ${options.maxGasPercent}% of purchase value`,
              });
              continue;
            }
          } catch (error) {
            log({
              action: "process",
              ...detail,
              outcome: "estimate-unavailable",
              reason: errorMessage(error),
            });
            continue;
          }
        }
        const receipt = await act(
          vault,
          protocolBuybackVaultAbi,
          "process",
          [asset, bucket, state.maxInput, state.revision, deadline],
          detail,
        );
        if (receipt) {
          const burn = receiptBuyback(receipt, {
            vault,
            asset,
            bucket,
            amount: state.maxInput,
            revision: state.revision,
          });
          if (!burn) {
            stopped = true;
            throw new Error(
              "Confirmed process receipt has no matching burn; inspect the receipt before restarting",
            );
          }
          const [inventory, tokenInventory, supply] = await Promise.all([
            client.readContract({
              address: vault,
              abi: protocolBuybackVaultAbi,
              functionName: "inventory",
              args: [asset, bucket],
              blockNumber: receipt.blockNumber,
            }),
            client.readContract({
              address: vault,
              abi: protocolBuybackVaultAbi,
              functionName: "inventory",
              args: [protocolToken, bucket],
              blockNumber: receipt.blockNumber,
            }),
            client.readContract({
              address: protocolToken,
              abi: erc20Abi,
              functionName: "totalSupply",
              blockNumber: receipt.blockNumber,
            }),
          ]);
          log({
            action: "process-state",
            ...detail,
            blockNumber: receipt.blockNumber,
            inventory,
            tokenInventory,
            supply,
            burn,
          });
        }
      }
  }

  async function visit() {
    if (stopped)
      throw new Error(
        "Runner stopped after an unresolved operation; inspect the library error before starting a new process",
      );
    sweep ??= await capture();
    if (sweep.tiers.length === 0) {
      await processAvailable();
      log({ action: "sweep-complete", visits: 0n });
      sweep = undefined;
      return { complete: true };
    }
    const current = sweep.tiers[sweep.nextTier];
    const firstId = current.next;
    const end =
      current.count + 1n < firstId + PAGE ? current.count + 1n : firstId + PAGE;
    const ids = Array.from(
      { length: Number(end - firstId) },
      (_, i) => firstId + BigInt(i),
    );
    const block = (await client.getBlock()).number;
    const states = await Promise.all(
      ids.map((id) =>
        client.readContract({
          address: current.tier,
          abi: membershipTierAbi,
          functionName: "protocolFeeState",
          args: [id],
          blockNumber: block,
        }),
      ),
    );
    // Advance only after a complete discovery page. Eligibility uses all
    // historical credentials, including expired or burned credentials.
    current.next = end;
    current.done = end > current.count;
    sweep.visits++;
    if (!sweep.tiers.every((tier) => tier.done)) {
      do {
        sweep.nextTier = (sweep.nextTier + 1) % sweep.tiers.length;
      } while (sweep.tiers[sweep.nextTier].done);
    }
    const eligible = ids.filter((_, i) => states[i].uncheckpointedEarned > 0n);
    if (eligible.length)
      await act(
        current.tier,
        membershipTierAbi,
        "accrueProtocolFees",
        [eligible],
        { firstId, lastId: end - 1n },
      );
    const earned = await client.readContract({
      address: current.tier,
      abi: membershipTierAbi,
      functionName: "protocolFeeEarnedHeld",
    });
    if (earned > 0n) {
      const receipt = await act(
        current.tier,
        membershipTierAbi,
        "releaseProtocolFees",
        [],
        { amount: earned },
      );
      if (receipt)
        log({
          action: "release-state",
          tier: current.tier,
          blockNumber: receipt.blockNumber,
          earnedHeld: await client.readContract({
            address: current.tier,
            abi: membershipTierAbi,
            functionName: "protocolFeeEarnedHeld",
            blockNumber: receipt.blockNumber,
          }),
        });
    }
    const complete = sweep.tiers.every((tier) => tier.done);
    if (complete) await processAvailable();
    log({
      action: "tier-visit",
      tier: current.tier,
      firstId,
      lastId: end - 1n,
      visits: sweep.visits,
      visitBound: sweep.visitBound,
      complete,
    });
    if (complete) {
      log({
        action: "sweep-complete",
        blockNumber: sweep.blockNumber,
        visits: sweep.visits,
        visitBound: sweep.visitBound,
      });
      sweep = undefined;
    }
    return { complete, tier: current.tier, firstId };
  }
  // Keep scheduled discovery state in memory. This is not receipt recovery.
  return {
    visit,
    async once() {
      do {
        const result = await visit();
        if (result.complete) return;
      } while (true);
    },
  };
}

export async function main() {
  const { values } = parseArgs({
    options: {
      "rpc-url": { type: "string" },
      factory: { type: "string" },
      once: { type: "boolean" },
      "max-gas-percent": { type: "string", default: "2.5" },
      asset: { type: "string", multiple: true },
    },
  });
  const rpcUrl = values["rpc-url"] ?? "";
  const factory = getAddress(values.factory ?? "");
  const maxGasPercent = Number(values["max-gas-percent"]);
  if (
    !Number.isFinite(maxGasPercent) ||
    maxGasPercent <= 0 ||
    maxGasPercent > 100
  )
    throw new Error("Gas threshold must be between 0 and 100 percent");
  const chainId = await createPublicClient({
    transport: http(rpcUrl, { retryCount: 0 }),
  }).getChainId();
  if (![31337, 4663, 46630].includes(chainId))
    throw new Error("Unsupported protocol network");
  validateAdminRpc(
    chainId === 31337 ? "forknet" : chainId === 4663 ? "mainnet" : "testnet",
    rpcUrl,
  );
  const chain = defineChain({
    id: chainId,
    name: "Protocol network",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  const client = createPublicClient({
    chain,
    transport: http(rpcUrl, { retryCount: 0 }),
  });
  const context = await readAdminContext(client, chainId, factory);
  const key = process.env.BBF_RUNNER_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key))
    throw new Error("Set the private runtime signer in BBF_RUNNER_PRIVATE_KEY");
  const account = privateKeyToAccount(key as Hex);
  const wallet = createWalletClient({
    chain,
    account,
    transport: http(rpcUrl, { retryCount: 0 }),
  });
  const ponsFactory = getAddress(sourceManifest.records.factory.address);
  const launch =
    context.protocolToken === zeroAddress
      ? { curve: zeroAddress }
      : await client.readContract({
          address: ponsFactory,
          abi: iPonsLaunchFactoryAbi,
          functionName: "getLaunchedToken",
          args: [context.protocolToken],
        });
  const runner = createBuybackRunner({
    client,
    wallet,
    account,
    chainId,
    factory,
    vault: context.vault,
    protocolToken: context.protocolToken,
    ponsFactory,
    curve: launch.curve,
    maxGasPercent,
    assets: values.asset?.map((value) => getAddress(value)),
    log: (event) =>
      console.log(
        JSON.stringify(event, (_, value) =>
          typeof value === "bigint" ? value.toString() : value,
        ),
      ),
  });
  await runner.once();
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
