import {
  erc20Abi,
  getAddress,
  keccak256,
  zeroAddress,
  type Address,
  type PublicClient,
} from "viem";

import {
  onchainMetadataRendererAbi,
  membershipFactoryAbi,
  protocolBuybackVaultAbi,
  ponsBuybackExecutorAbi,
  iSafeAbi,
} from "@/contracts";
import { readTokenDisplay } from "@/lib/payment-token-read";
import { tokenMultiplierScale } from "@/lib/token-amount";
import { readPonsCompensation } from "./pons-read";
import type {
  ProtocolCustodyIdentity,
  ProtocolDependencySnapshot,
} from "@/contracts/types";
import type { DeploymentAvailability } from "@/lib/config";
import { classifyReadError, type ReadState } from "@/lib/read-state";

export type ProtocolSnapshot = ProtocolDependencySnapshot &
  ProtocolCustodyIdentity & {
    owner: Address;
    pendingOwner: Address;
    protocolBalances: readonly { token: Address; raw: bigint }[];
    tierCount: bigint;
  };

export const membershipRendererSchema =
  "0xfed0707e5f6edd2453280da0318c42550633f3b8bcb13fee8818ae2d70294ab4" as const;

const maxRendererManifestEngines = 64;
const paymentTokenPageSize = 100n;

async function readPaymentTokenAddresses(
  client: PublicClient,
  factory: Address,
  blockNumber: bigint,
) {
  const count = await client.readContract({
    address: factory,
    abi: membershipFactoryAbi,
    functionName: "paymentTokenCount",
    blockNumber,
  });
  const paymentTokens: Address[] = [];
  for (let offset = 0n; offset < count; offset += paymentTokenPageSize) {
    const page = await client.readContract({
      address: factory,
      abi: membershipFactoryAbi,
      functionName: "paymentTokens",
      args: [offset, paymentTokenPageSize],
      blockNumber,
    });
    paymentTokens.push(...page.map((address) => getAddress(address)));
  }
  if (paymentTokens.length !== Number(count) || paymentTokens.length === 0) {
    throw new Error("The accepted payment-token registry is incomplete.");
  }
  if (
    new Set(paymentTokens.map((token) => token.toLowerCase())).size !==
    paymentTokens.length
  ) {
    throw new Error("The accepted payment-token registry contains duplicates.");
  }
  const listed = await Promise.all(
    paymentTokens.map((token) =>
      client.readContract({
        address: factory,
        abi: membershipFactoryAbi,
        functionName: "isPaymentTokenListed",
        args: [token],
        blockNumber,
      }),
    ),
  );
  if (listed.some((value) => !value)) {
    throw new Error("An enumerated payment token is not listed.");
  }
  return paymentTokens;
}

export type ProtocolDependencyReadState =
  | Extract<ReadState<ProtocolDependencySnapshot>, { status: "valid" }>
  | Extract<ReadState<ProtocolDependencySnapshot>, { status: "wrong-chain" }>
  | Extract<ReadState<ProtocolDependencySnapshot>, { status: "unavailable" }>
  | Extract<ReadState<ProtocolDependencySnapshot>, { status: "rate-limited" }>
  | Extract<
      ReadState<ProtocolDependencySnapshot>,
      { status: "interface-mismatch" }
    >;

export async function readProtocolDependencies(
  client: PublicClient,
  deployment: DeploymentAvailability,
  blockNumber?: bigint,
): Promise<ProtocolDependencyReadState> {
  if (deployment.status !== "ready") {
    return {
      status: "unavailable",
      reason: "not-deployed",
      label: deployment.detail,
    };
  }

  try {
    const [capturedBlock, rpcChainId] = await Promise.all([
      blockNumber === undefined
        ? client.getBlockNumber({ cacheTime: 0 })
        : Promise.resolve(blockNumber),
      client.getChainId(),
    ]);
    if (rpcChainId !== deployment.chainId) {
      return {
        status: "wrong-chain",
        expectedChainId: deployment.chainId,
        actualChainId: rpcChainId,
        label: "The RPC does not match the selected membership network.",
      };
    }

    const [
      paymentTokens,
      rendererSchema,
      mediaStoreFactory,
      mediaStoreFactoryRuntimeCodehash,
      vault,
      protocolToken,
    ] = await Promise.all([
      readPaymentTokenAddresses(
        client,
        deployment.factoryAddress,
        capturedBlock,
      ),
      client.readContract({
        address: deployment.factoryAddress,
        abi: membershipFactoryAbi,
        functionName: "rendererSchema",
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address: deployment.factoryAddress,
        abi: membershipFactoryAbi,
        functionName: "mediaStoreFactory",
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address: deployment.factoryAddress,
        abi: membershipFactoryAbi,
        functionName: "mediaStoreFactoryRuntimeCodehash",
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address: deployment.factoryAddress,
        abi: membershipFactoryAbi,
        functionName: "buybackVault",
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address: deployment.factoryAddress,
        abi: membershipFactoryAbi,
        functionName: "protocolToken",
        blockNumber: capturedBlock,
      }),
    ]);

    const failedChecks: string[] = [];
    // A historical fee-recipient factory must never authenticate tiers for the
    // current custody model. These immutable reciprocal bindings identify it.
    const [vaultFactory, vaultToken, executor] = await Promise.all([
      client.readContract({
        address: vault,
        abi: protocolBuybackVaultAbi,
        functionName: "factory",
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address: vault,
        abi: protocolBuybackVaultAbi,
        functionName: "protocolToken",
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address: vault,
        abi: protocolBuybackVaultAbi,
        functionName: "executor",
        blockNumber: capturedBlock,
      }),
    ]);
    const [executorVault, executorToken] =
      executor === zeroAddress
        ? [zeroAddress, zeroAddress]
        : await Promise.all([
            client.readContract({
              address: executor,
              abi: ponsBuybackExecutorAbi,
              functionName: "vault",
              blockNumber: capturedBlock,
            }),
            client.readContract({
              address: executor,
              abi: ponsBuybackExecutorAbi,
              functionName: "protocolToken",
              blockNumber: capturedBlock,
            }),
          ]);
    if (
      vault === zeroAddress ||
      (protocolToken === zeroAddress) !== (executor === zeroAddress) ||
      getAddress(vaultFactory) !== getAddress(deployment.factoryAddress) ||
      getAddress(vaultToken) !== getAddress(protocolToken) ||
      (executor !== zeroAddress &&
        getAddress(executorVault) !== getAddress(vault)) ||
      getAddress(executorToken) !== getAddress(protocolToken)
    )
      failedChecks.push("buyback protocol version and immutable custody");
    if (rendererSchema !== membershipRendererSchema) {
      failedChecks.push("renderer schema");
    }

    const [rendererCode, previewHarnessCode, mediaStoreFactoryCode] =
      await Promise.all([
        client.getBytecode({
          address: deployment.rendererAddress,
          blockNumber: capturedBlock,
        }),
        client.getBytecode({
          address: deployment.previewHarnessAddress,
          blockNumber: capturedBlock,
        }),
        client.getBytecode({
          address: mediaStoreFactory,
          blockNumber: capturedBlock,
        }),
      ]);
    if (!rendererCode || rendererCode === "0x") {
      failedChecks.push("renderer code");
    }
    if (!previewHarnessCode || previewHarnessCode === "0x") {
      failedChecks.push("renderer preview harness code");
    }
    if (!mediaStoreFactoryCode || mediaStoreFactoryCode === "0x") {
      failedChecks.push("media registry code");
    } else if (
      keccak256(mediaStoreFactoryCode) !== mediaStoreFactoryRuntimeCodehash
    ) {
      failedChecks.push("media registry runtime identity");
    }

    let rendererManifest:
      | {
          name: string;
          engineCount: number;
          engineNames: readonly string[];
        }
      | undefined;
    if (rendererCode && rendererCode !== "0x" && failedChecks.length === 0) {
      try {
        const [implementationSchema, name, rawEngineCount] = await Promise.all([
          client.readContract({
            address: deployment.rendererAddress,
            abi: onchainMetadataRendererAbi,
            functionName: "rendererSchema",
            blockNumber: capturedBlock,
          }),
          client.readContract({
            address: deployment.rendererAddress,
            abi: onchainMetadataRendererAbi,
            functionName: "rendererName",
            blockNumber: capturedBlock,
          }),
          client.readContract({
            address: deployment.rendererAddress,
            abi: onchainMetadataRendererAbi,
            functionName: "engineCount",
            blockNumber: capturedBlock,
          }),
        ]);
        const engineCount = Number(rawEngineCount);
        const engineNames =
          Number.isSafeInteger(engineCount) &&
          engineCount > 0 &&
          engineCount <= maxRendererManifestEngines
            ? await Promise.all(
                Array.from({ length: engineCount }, (_, engine) =>
                  client.readContract({
                    address: deployment.rendererAddress,
                    abi: onchainMetadataRendererAbi,
                    functionName: "engineName",
                    args: [engine],
                    blockNumber: capturedBlock,
                  }),
                ),
              )
            : undefined;
        if (implementationSchema !== rendererSchema) {
          failedChecks.push("renderer schema");
        }
        if (!name || name.trim().length === 0 || engineNames === undefined) {
          failedChecks.push("renderer manifest");
        } else {
          rendererManifest = { name, engineCount, engineNames };
        }
      } catch {
        failedChecks.push("renderer manifest");
      }
    }

    if (rendererManifest === undefined && failedChecks.length === 0) {
      failedChecks.push("renderer manifest");
    }

    if (failedChecks.length > 0 || rendererManifest === undefined) {
      return {
        status: "interface-mismatch",
        address: deployment.factoryAddress,
        failedChecks,
        label:
          "The canonical factory dependencies do not match their snapshotted runtime identities.",
      };
    }

    return {
      status: "valid",
      capturedBlock,
      data: {
        chainId: deployment.chainId,
        factory: deployment.factoryAddress,
        paymentTokens,
        rendererSchema,
        renderer: deployment.rendererAddress,
        rendererName: rendererManifest.name,
        rendererEngineCount: rendererManifest.engineCount,
        rendererEngineNames: rendererManifest.engineNames,
        previewHarness: deployment.previewHarnessAddress,
        mediaStoreFactory,
        mediaStoreFactoryRuntimeCodehash,
      },
    };
  } catch (error) {
    const classified = classifyReadError(error);
    return classified.status === "rate-limited"
      ? classified
      : {
          status: "unavailable",
          reason: "rpc-unavailable",
          label: classified.label,
        };
  }
}

export async function readProtocolState(
  client: PublicClient,
  deployment: DeploymentAvailability,
): Promise<ReadState<ProtocolSnapshot>> {
  const dependencies = await readProtocolDependencies(client, deployment);
  if (dependencies.status !== "valid") return dependencies;

  try {
    const blockNumber = dependencies.capturedBlock;
    const [owner, pendingOwner, buybackVault, protocolToken, tierCount] =
      await Promise.all([
        client.readContract({
          address: dependencies.data.factory,
          abi: membershipFactoryAbi,
          functionName: "owner",
          blockNumber,
        }),
        client.readContract({
          address: dependencies.data.factory,
          abi: membershipFactoryAbi,
          functionName: "pendingOwner",
          blockNumber,
        }),
        client.readContract({
          address: dependencies.data.factory,
          abi: membershipFactoryAbi,
          functionName: "buybackVault",
          blockNumber,
        }),
        client.readContract({
          address: dependencies.data.factory,
          abi: membershipFactoryAbi,
          functionName: "protocolToken",
          blockNumber,
        }),
        client.readContract({
          address: dependencies.data.factory,
          abi: membershipFactoryAbi,
          functionName: "tierCount",
          blockNumber,
        }),
      ]);
    const balances = await Promise.all(
      dependencies.data.paymentTokens.map(async (token) => ({
        token,
        raw: await client.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [buybackVault],
          blockNumber,
        }),
      })),
    );

    return {
      status: "valid",
      capturedBlock: blockNumber,
      data: {
        ...dependencies.data,
        owner,
        pendingOwner,
        buybackVault,
        protocolToken,
        protocolBalances: balances,
        tierCount,
      },
    };
  } catch (error) {
    const classified = classifyReadError(error);
    return classified.status === "rate-limited"
      ? classified
      : {
          status: "unavailable",
          reason: "rpc-unavailable",
          label: classified.label,
        };
  }
}

/** Asset custody is readable independently of external venue availability. */
export async function readBuybackAsset(
  client: PublicClient,
  vault: Address,
  asset: Address,
  blockNumber: bigint,
) {
  const [membership, donation, route, limits, revision, paused, lastBuyAt] =
    await Promise.all([
      client.readContract({
        address: vault,
        abi: protocolBuybackVaultAbi,
        functionName: "inventory",
        args: [asset, 0],
        blockNumber,
      }),
      client.readContract({
        address: vault,
        abi: protocolBuybackVaultAbi,
        functionName: "inventory",
        args: [asset, 1],
        blockNumber,
      }),
      client.readContract({
        address: vault,
        abi: protocolBuybackVaultAbi,
        functionName: "route",
        args: [asset],
        blockNumber,
      }),
      client.readContract({
        address: vault,
        abi: protocolBuybackVaultAbi,
        functionName: "limits",
        args: [asset],
        blockNumber,
      }),
      client.readContract({
        address: vault,
        abi: protocolBuybackVaultAbi,
        functionName: "revision",
        args: [asset],
        blockNumber,
      }),
      client.readContract({
        address: vault,
        abi: protocolBuybackVaultAbi,
        functionName: "assetBuybacksPaused",
        args: [asset],
        blockNumber,
      }),
      client.readContract({
        address: vault,
        abi: protocolBuybackVaultAbi,
        functionName: "lastAssetBuyAt",
        args: [asset],
        blockNumber,
      }),
    ]);
  const eligibility = await Promise.allSettled(
    ([0, 1] as const).map((bucket) =>
      client.readContract({
        address: vault,
        abi: protocolBuybackVaultAbi,
        functionName: "processingStatus",
        args: [asset, bucket],
        blockNumber,
      }),
    ),
  );
  const metadata =
    asset === zeroAddress
      ? { symbol: "ETH", decimals: 18, uiMultiplier: tokenMultiplierScale }
      : await readTokenDisplay(client, asset, blockNumber).catch(() => null);
  return {
    asset,
    blockNumber,
    membership,
    donation,
    route,
    limits,
    lastBuyAt,
    revision,
    paused,
    metadata,
    conserved: [membership, donation].every(
      (bucket) =>
        bucket.available ===
        bucket.totalReceived + bucket.totalConvertedIn - bucket.totalSpent,
    ),
    eligibility: eligibility.map((item) =>
      item.status === "fulfilled"
        ? { status: "valid" as const, data: item.value }
        : {
            status: "unavailable" as const,
            label:
              "Market eligibility is unavailable; recorded inventory is unchanged.",
          },
    ),
  };
}

export async function readPublicBuybacks(
  client: PublicClient,
  deployment: DeploymentAvailability,
  options: {
    blockNumber?: bigint;
    assetOffset?: number;
    assetLimit?: number;
  } = {},
) {
  const offset = options.assetOffset ?? 0,
    limit = options.assetLimit ?? 100;
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw new Error(
      "Asset pages require a nonnegative offset and a limit of 1–100",
    );
  const dependencies = await readProtocolDependencies(
    client,
    deployment,
    options.blockNumber,
  );
  if (dependencies.status !== "valid") return dependencies;
  try {
    const { factory, paymentTokens } = dependencies.data,
      blockNumber = dependencies.capturedBlock;
    const [block, safe, vault, protocolToken, tierCount] = await Promise.all([
      client.getBlock({ blockNumber }),
      client.readContract({
        address: factory,
        abi: membershipFactoryAbi,
        functionName: "owner",
        blockNumber,
      }),
      client.readContract({
        address: factory,
        abi: membershipFactoryAbi,
        functionName: "buybackVault",
        blockNumber,
      }),
      client.readContract({
        address: factory,
        abi: membershipFactoryAbi,
        functionName: "protocolToken",
        blockNumber,
      }),
      client.readContract({
        address: factory,
        abi: membershipFactoryAbi,
        functionName: "tierCount",
        blockNumber,
      }),
    ]);
    const [
      vaultFactory,
      vaultToken,
      executor,
      buybacksPaused,
      owners,
      threshold,
    ] = await Promise.all([
      client.readContract({
        address: vault,
        abi: protocolBuybackVaultAbi,
        functionName: "factory",
        blockNumber,
      }),
      client.readContract({
        address: vault,
        abi: protocolBuybackVaultAbi,
        functionName: "protocolToken",
        blockNumber,
      }),
      client.readContract({
        address: vault,
        abi: protocolBuybackVaultAbi,
        functionName: "executor",
        blockNumber,
      }),
      client.readContract({
        address: vault,
        abi: protocolBuybackVaultAbi,
        functionName: "buybacksPaused",
        blockNumber,
      }),
      client.readContract({
        address: safe,
        abi: iSafeAbi,
        functionName: "getOwners",
        blockNumber,
      }),
      client.readContract({
        address: safe,
        abi: iSafeAbi,
        functionName: "getThreshold",
        blockNumber,
      }),
    ]);
    const [executorVault, executorToken] =
      executor === zeroAddress
        ? [zeroAddress, zeroAddress]
        : await Promise.all([
            client.readContract({
              address: executor,
              abi: ponsBuybackExecutorAbi,
              functionName: "vault",
              blockNumber,
            }),
            client.readContract({
              address: executor,
              abi: ponsBuybackExecutorAbi,
              functionName: "protocolToken",
              blockNumber,
            }),
          ]);
    if (
      vault === zeroAddress ||
      (protocolToken === zeroAddress) !== (executor === zeroAddress) ||
      getAddress(vaultFactory) !== getAddress(factory) ||
      getAddress(vaultToken) !== getAddress(protocolToken) ||
      (executor !== zeroAddress &&
        getAddress(executorVault) !== getAddress(vault)) ||
      getAddress(executorToken) !== getAddress(protocolToken)
    )
      throw new Error("Immutable buyback identity mismatch");
    const [canonicalAssets, globalMinInterval, lastBuyAt] = await Promise.all([
      Promise.all(
        [zeroAddress, protocolToken, ...paymentTokens].map((asset) =>
          client.readContract({
            address: vault,
            abi: protocolBuybackVaultAbi,
            functionName: "canonicalAsset",
            args: [asset],
            blockNumber,
          }),
        ),
      ),
      client.readContract({
        address: vault,
        abi: protocolBuybackVaultAbi,
        functionName: "globalMinInterval",
        blockNumber,
      }),
      client.readContract({
        address: vault,
        abi: protocolBuybackVaultAbi,
        functionName: "lastBuyAt",
        blockNumber,
      }),
    ]);
    const assetMap = new Map(
      canonicalAssets.map((asset) => [asset.toLowerCase(), asset]),
    );
    const allAssets = [...assetMap.values()];
    const [assets, pons] = await Promise.all([
      Promise.all(
        allAssets.slice(offset, offset + limit).map(async (asset) => {
          try {
            return {
              status: "valid" as const,
              asset,
              data: await readBuybackAsset(client, vault, asset, blockNumber),
            };
          } catch {
            return {
              status: "unavailable" as const,
              asset,
              label: "Recorded inventory is unavailable for this asset.",
            };
          }
        }),
      ),
      readPonsCompensation(client, {
        chainId: dependencies.data.chainId,
        protocolToken,
        blockNumber,
      }),
    ]);
    return {
      status: "valid" as const,
      capturedBlock: blockNumber,
      data: {
        ...dependencies.data,
        timestamp: block.timestamp,
        safe,
        owners,
        threshold,
        vault,
        executor,
        protocolToken,
        tierCount,
        buybacksPaused,
        globalMinInterval,
        lastBuyAt,
        assets,
        pons,
        assetCoverage: {
          offset,
          count: assets.length,
          total: allAssets.length,
          nextOffset:
            offset + assets.length < allAssets.length
              ? offset + assets.length
              : null,
        },
      },
    };
  } catch (error) {
    return {
      status: "unavailable" as const,
      reason: "rpc-unavailable" as const,
      label: classifyReadError(error).label,
    };
  }
}
export type PublicBuybacks = Extract<
  Awaited<ReturnType<typeof readPublicBuybacks>>,
  { status: "valid" }
>["data"];

/** Latest-first bounded event pages. Configuration and movement are not revenue. */
export async function readProtocolActivityPage(
  client: PublicClient,
  context: {
    factory: Address;
    vault: Address;
    fromBlock: bigint;
    toBlock: bigint;
    beforeLogIndex?: number;
    limit?: number;
  },
) {
  const limit = context.limit ?? 50;
  if (
    limit < 1 ||
    limit > 50 ||
    !Number.isSafeInteger(limit) ||
    context.fromBlock < 0n ||
    context.toBlock < context.fromBlock
  )
    throw new Error("Activity pages require valid blocks and a limit of 1–50");
  const windowFrom =
    context.toBlock - context.fromBlock >= 2000n
      ? context.toBlock - 1999n
      : context.fromBlock;
  const events = [
    ...protocolBuybackVaultAbi.filter((item) => item.type === "event"),
    ...membershipFactoryAbi.filter(
      (item) =>
        item.type === "event" &&
        [
          "PaymentTokenListed",
          "PaymentTokenEnabled",
          "PaymentTokenDisabled",
          "OwnershipTransferred",
          "OwnershipTransferStarted",
        ].includes(item.name),
    ),
  ];
  const logs = await client.getLogs({
    address: [context.factory, context.vault],
    events,
    fromBlock: windowFrom,
    toBlock: context.toBlock,
    strict: true,
  });
  const ordered = logs
    .filter(
      (log) =>
        context.beforeLogIndex === undefined ||
        log.blockNumber < context.toBlock ||
        log.logIndex < context.beforeLogIndex,
    )
    .sort((a, b) =>
      a.blockNumber === b.blockNumber
        ? b.logIndex - a.logIndex
        : a.blockNumber > b.blockNumber
          ? -1
          : 1,
    );
  const rows = ordered.slice(0, limit);
  const truncated = ordered.length > limit;
  const last = rows.at(-1);
  const next =
    truncated && last
      ? { toBlock: last.blockNumber, beforeLogIndex: last.logIndex }
      : windowFrom > context.fromBlock
        ? { toBlock: windowFrom - 1n }
        : null;
  return {
    rows,
    next,
    coverage: {
      windowFrom,
      windowTo: context.toBlock,
      beforeLogIndex: context.beforeLogIndex,
      completeWindow: context.beforeLogIndex === undefined && !truncated,
      completeHistory:
        context.beforeLogIndex === undefined &&
        windowFrom === context.fromBlock &&
        !truncated,
      reachedStart: windowFrom === context.fromBlock && !truncated,
    },
    // These are movements between ledgers. Payment allocation is the revenue
    // source; a vault receipt must never be added to it a second time.
    ledger: "vault-and-configuration" as const,
  };
}
