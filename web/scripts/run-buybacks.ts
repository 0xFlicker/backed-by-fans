import { percentageBps } from "../src/lib/buyback-settings/calculator";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import type { Pool } from "../src/lib/buyback-policy/model";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  parseEventLogs,
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
  protocolBurnRouterAbi,
  membershipTierAbi,
  protocolBuybackVaultAbi,
  iPonsLaunchFactoryAbi,
  iPonsBondingCurveAbi,
} from "../src/contracts";
import {
  readAdminContext,
  validateAdminRpc,
  parseRoutePools,
} from "./protocol-admin";
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
  "TokenNotLaunched",
  "OperatorOnly",
  "NoPolicy",
  "PolicyExpired",
  "BudgetExhausted",
  "StalePolicy",
];
const errorMessage = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).replace(
    /https?:\/\/[^\s]+/g,
    "[RPC endpoint]",
  );
export type OperatorPolicy = {
  asset: Address;
  amount: bigint;
  pools: readonly Pool[];
};

export function minimumOutputs(
  quotes: readonly { outputRaw: bigint }[],
  toleranceBps: number,
) {
  if (
    !Number.isInteger(toleranceBps) ||
    toleranceBps < 0 ||
    toleranceBps >= 10000
  )
    throw new Error("Explicit output tolerance must be 0–9999 basis points");
  if (quotes.length === 0)
    throw new Error("Every market purchase requires quotes");
  return quotes.map(({ outputRaw }) => {
    const minimum = (outputRaw * BigInt(10000 - toleranceBps)) / 10000n;
    if (minimum <= 0n)
      throw new Error("Quoted minimum output must be positive");
    return minimum;
  });
}

type Options = {
  client: PublicClient;
  wallet: WalletClient;
  submissionMode?: "public" | "private";
  operatorClient?: PublicClient;
  account: Address | LocalAccount;
  chainId: number;
  factory: Address;
  vault: Address;
  protocolToken: Address;
  ponsFactory: Address;
  curve: Address;
  assets?: readonly Address[];
  maxGasPercent?: number;
  operatorPolicies?: readonly OperatorPolicy[];
  toleranceBps?: number;
  log: (event: Record<string, unknown>) => void;
};
type TierCursor = { tier: Address };
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
  if (options.submissionMode === "private" && !options.operatorClient)
    throw new Error(
      "Private operator execution requires a trusted private RPC client",
    );
  const operatorClient = options.operatorClient ?? client;
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
      simulation = await (
        functionName === "processOperator" ? operatorClient : client
      ).simulateContract({
        address,
        abi,
        functionName,
        args,
        account,
        ...(options.chainId === 31337 ? { gasPrice: 100_000_000n } : {}),
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
      page.forEach((tier) => tiers.push({ tier }));
    }
    if (new Set(tiers.map((x) => x.tier.toLowerCase())).size !== tiers.length)
      throw new Error("Duplicate captured tier");
    const visitBound = BigInt(tiers.length);
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
    const executionMode = await client.readContract({
      address: vault,
      abi: protocolBuybackVaultAbi,
      functionName: "executionMode",
      blockNumber: block.number,
    });
    if (executionMode === 0 && options.operatorPolicies?.length) {
      const operator = await client.readContract({
        address: vault,
        abi: protocolBuybackVaultAbi,
        functionName: "operator",
        blockNumber: block.number,
      });
      if (
        operator.toLowerCase() !==
        (typeof account === "string" ? account : account.address).toLowerCase()
      )
        throw new Error("Runner signer is not the authorized operator");
      if (options.toleranceBps === undefined)
        throw new Error("Operator purchases require explicit output tolerance");
    }
    const assetMap = new Map<string, Address>();
    const add = (asset: Address) => {
      const canonical =
        asset.toLowerCase() ===
        sourceManifest.records.weth.address.toLowerCase()
          ? zeroAddress
          : asset;
      assetMap.set(canonical.toLowerCase(), canonical);
    };
    [
      zeroAddress,
      protocolToken,
      ...(options.assets ?? []),
      ...(options.operatorPolicies ?? []).map((policy) => policy.asset),
    ].forEach(add);
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
    for (const asset of executionMode === 0 ? [] : [...assetMap.values()]) {
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
        const directBurn = asset.toLowerCase() === protocolToken.toLowerCase();
        const operatorPolicy =
          executionMode === 0 && !directBurn
            ? options.operatorPolicies?.find(
                (policy) => policy.asset.toLowerCase() === asset.toLowerCase(),
              )
            : undefined;
        if (executionMode === 0 && !directBurn && !operatorPolicy) {
          log({
            action: "process",
            ...detail,
            outcome: "pending",
            reason: "No offchain operator policy supplied",
          });
          continue;
        }
        if (!operatorPolicy && (state.status !== 0 || state.maxInput === 0n)) {
          log({
            action: "process",
            ...detail,
            outcome: "pending",
            reason: statuses[state.status] ?? "UnknownStatus",
          });
          continue;
        }
        const executionClient = operatorPolicy ? operatorClient : client;
        const quoteBlock = await executionClient.getBlock();
        const deadline = quoteBlock.timestamp + 120n;
        const amount = operatorPolicy
          ? state.available < operatorPolicy.amount
            ? state.available
            : operatorPolicy.amount
          : state.maxInput;
        if (amount === 0n) continue;
        detail.amount = amount;
        if (operatorPolicy) detail.revision = 0n;
        let functionName: "process" | "processOperator" = "process";
        let args: readonly unknown[] = [
          asset,
          bucket,
          amount,
          state.revision,
          deadline,
        ];
        let ethValue: bigint | undefined;
        try {
          if (
            operatorPolicy ||
            (options.maxGasPercent !== undefined && !directBurn)
          ) {
            const market = await readMarketState(executionClient, {
              vault,
              asset,
              protocolToken,
              blockNumber: quoteBlock.number,
              ...(operatorPolicy ? { route: operatorPolicy.pools } : {}),
            });
            const quotes = await quoteMarket(executionClient, market, amount);
            ethValue = quotes.at(-1)!.inputRaw;
            if (operatorPolicy) {
              functionName = "processOperator";
              args = [
                asset,
                bucket,
                amount,
                { pools: operatorPolicy.pools },
                minimumOutputs(quotes, options.toleranceBps!),
                deadline,
              ];
            }
          }
        } catch (error) {
          log({
            action: "process",
            ...detail,
            outcome: "quote-unavailable",
            reason: errorMessage(error),
          });
          continue;
        }
        if (
          options.maxGasPercent !== undefined &&
          asset.toLowerCase() !== protocolToken.toLowerCase()
        ) {
          try {
            const gasPrice =
              options.chainId === 31337
                ? 100_000_000n
                : await executionClient.getGasPrice();
            const gas = await executionClient.estimateContractGas({
              address: vault,
              abi: protocolBuybackVaultAbi,
              functionName,
              args,
              account,
              ...(options.chainId === 31337 ? { gasPrice } : {}),
            } as Parameters<typeof client.estimateContractGas>[0]);
            if (
              gas * gasPrice * 10000n >
              ethValue! * percentageBps(options.maxGasPercent)
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
          functionName,
          args,
          detail,
        );
        if (receipt) {
          const burn = receiptBuyback(receipt, {
            vault,
            asset,
            bucket,
            amount,
            revision: operatorPolicy ? 0n : state.revision,
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
    const block = await client.getBlock();
    const [status, earned, router] = await Promise.all([
      client.readContract({
        address: current.tier,
        abi: membershipTierAbi,
        functionName: "accountingStatus",
        blockNumber: block.number,
      }),
      client.readContract({
        address: current.tier,
        abi: membershipTierAbi,
        functionName: "protocolFeeEarnedHeld",
        blockNumber: block.number,
      }),
      client.readContract({
        address: factory,
        abi: membershipFactoryAbi,
        functionName: "burnRouter",
        blockNumber: block.number,
      }),
    ]);
    const maxAccountingSteps =
      !status.complete && status.scheduledMembers > 0n ? 25n : 0n;
    if (maxAccountingSteps || earned > 0n) {
      const receipt = await act(
        router,
        protocolBurnRouterAbi,
        "advance",
        [
          [{ tier: current.tier, maxAccountingSteps }],
          [],
          block.timestamp + 300n,
        ],
        { tier: current.tier, maxAccountingSteps },
      );
      if (receipt) {
        const events = parseEventLogs({
          abi: protocolBurnRouterAbi,
          logs: receipt.logs,
        }).filter(
          (event) => event.address.toLowerCase() === router.toLowerCase(),
        );
        log({
          action: "advance-state",
          tier: current.tier,
          events,
          accounting: await client.readContract({
            address: current.tier,
            abi: membershipTierAbi,
            functionName: "accountingStatus",
            blockNumber: receipt.blockNumber,
          }),
        });
      }
    }
    // Each captured tier gets one bounded turn. A later sweep resumes any backlog;
    // an indefinitely busy tier cannot prevent other tiers or purchases from progressing.
    sweep.nextTier++;
    sweep.visits++;
    const complete = sweep.nextTier === sweep.tiers.length;
    if (complete) await processAvailable();
    log({
      action: "tier-visit",
      tier: current.tier,
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
    return { complete, tier: current.tier };
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
      "submission-rpc-url": { type: "string" },
      "submission-mode": { type: "string" },
      "operator-policy": { type: "string" },
      "tolerance-bps": { type: "string" },
      factory: { type: "string" },
      once: { type: "boolean" },
      "max-gas-percent": { type: "string", default: "2.5" },
      asset: { type: "string", multiple: true },
    },
  });
  const rpcUrl = values["rpc-url"] ?? "";
  const factory = getAddress(values.factory ?? "");
  const submissionMode = values["submission-mode"];
  if (submissionMode !== "public" && submissionMode !== "private")
    throw new Error("Choose --submission-mode public or private explicitly");
  const submissionRpc =
    values["submission-rpc-url"] ??
    (submissionMode === "public" ? rpcUrl : undefined);
  if (!submissionRpc)
    throw new Error(
      "Private submission requires an explicitly configured --submission-rpc-url; no public fallback is used",
    );
  const operatorPolicies: OperatorPolicy[] | undefined = values[
    "operator-policy"
  ]
    ? JSON.parse(await readFile(values["operator-policy"], "utf8")).map(
        (entry: { asset: string; amount: string; pools: Pool[] }) => {
          if (
            !/^[1-9][0-9]*$/.test(entry.amount) ||
            !Array.isArray(entry.pools) ||
            entry.pools.length > 2
          )
            throw new Error(
              "Operator policy requires positive raw amount and up to two pools",
            );
          const pools = parseRoutePools(entry.pools);
          const normalized = getAddress(entry.asset);
          return {
            asset:
              normalized.toLowerCase() ===
              sourceManifest.records.weth.address.toLowerCase()
                ? zeroAddress
                : normalized,
            amount: BigInt(entry.amount),
            pools,
          };
        },
      )
    : undefined;
  if (
    operatorPolicies &&
    new Set(operatorPolicies.map((policy) => policy.asset.toLowerCase()))
      .size !== operatorPolicies.length
  )
    throw new Error("Supply only one operator policy per canonical asset");
  const toleranceBps =
    values["tolerance-bps"] === undefined
      ? undefined
      : Number(values["tolerance-bps"]);
  if (operatorPolicies?.length)
    minimumOutputs([{ outputRaw: 10000n }], toleranceBps ?? NaN);
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
  const operatorClient = createPublicClient({
    chain,
    transport: http(submissionRpc, { retryCount: 0 }),
  });
  const submissionChainId = await operatorClient.getChainId();
  if (submissionChainId !== chainId)
    throw new Error("Submission RPC network differs from read RPC network");
  const key = process.env.BBF_RUNNER_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key))
    throw new Error("Set the private runtime signer in BBF_RUNNER_PRIVATE_KEY");
  const account = privateKeyToAccount(key as Hex);
  const wallet = createWalletClient({
    chain,
    account,
    transport: http(submissionRpc, { retryCount: 0 }),
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
    operatorClient,
    submissionMode,
    wallet,
    account,
    chainId,
    factory,
    vault: context.vault,
    protocolToken: context.protocolToken,
    ponsFactory,
    curve: launch.curve,
    maxGasPercent,
    operatorPolicies,
    toleranceBps,
    assets: values.asset?.map((value) => getAddress(value)),
    log: (event) =>
      console.log(
        JSON.stringify({ submissionMode, ...event }, (_, value) =>
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
