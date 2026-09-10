import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  http,
  getAddress,
  encodeFunctionData,
  decodeFunctionData,
  keccak256,
  zeroAddress,
  erc20Abi,
  BaseError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import * as bindings from "../src/contracts";
import { compareRuntime } from "../../scripts/protocol-fork/verify-runtime";
import sourceManifest from "../../contracts/external/verification/4663/sources.json" with { type: "json" };

const root = fileURLToPath(new URL("../../", import.meta.url));
const {
  membershipFactoryAbi,
  protocolBuybackVaultAbi,
  ponsBuybackExecutorAbi,
  iSafeAbi,
  ierc165Abi,
  iScaledUiAmountAbi,
  iScaledUiAmountNewUiMultiplierAbi,
} = bindings;
const VERSION = "protocol-buyback-burn-v1";
export type AdminContext = {
  chainId: number;
  blockNumber: bigint;
  blockTimestamp: bigint;
  safe: Address;
  safeNonce: bigint;
  factory: Address;
  vault: Address;
  protocolToken: Address;
  factoryCodeHash: Hex;
  vaultCodeHash: Hex;
  version: string;
};
const json = (value: unknown) =>
  JSON.stringify(
    value,
    (_, item) => (typeof item === "bigint" ? item.toString() : item),
    2,
  );
function record(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected an input object");
  const result = value as Record<string, unknown>;
  for (const field of Object.keys(result))
    if (!fields.includes(field))
      throw new Error(`Unknown input field: ${field}`);
  return result;
}
function raw(
  value: unknown,
  label: string,
  bits: number,
  positive = false,
): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value))
    throw new Error(`${label} must be an exact raw decimal string`);
  const result = BigInt(value);
  if (result >= 2n ** BigInt(bits) || (positive && result === 0n))
    throw new Error(`${label} is outside uint${bits} bounds`);
  return result;
}
function integer(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    throw new Error(`${label} is out of bounds`);
  return value;
}
function address(value: unknown): Address {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value))
    throw new Error("An exact address is required");
  return getAddress(value);
}
function flag(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("A boolean is required");
  return value;
}

export function validateAdminRpc(network: string, rpcUrl: string) {
  const chainId =
    network === "forknet"
      ? 31337
      : network === "testnet"
        ? 46630
        : network === "mainnet"
          ? 4663
          : undefined;
  if (!chainId) throw new Error("Unknown administration network");
  const url = new URL(rpcUrl);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("RPC requires HTTP(S)");
  if (
    network === "forknet" &&
    (url.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      !url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/")
  )
    throw new Error(
      "Fork administration requires an uncredentialed loopback RPC",
    );
  return { chainId, rpcUrl };
}

export function parseBuybackInput(action: string, value: unknown) {
  if (!["route", "limits", "interval", "pause", "asset-pause"].includes(action))
    throw new Error("Unknown buyback action");
  const input = record(
    value,
    action === "route"
      ? ["asset", "expectedRevisionRaw", "expectedSafeNonceRaw", "pools"]
      : action === "limits"
        ? ["asset", "expectedRevisionRaw", "expectedSafeNonceRaw", "limits"]
        : action === "interval"
          ? ["expectedSafeNonceRaw", "minInterval"]
          : action === "pause"
            ? ["expectedSafeNonceRaw", "paused"]
            : ["asset", "expectedSafeNonceRaw", "paused"],
  );
  const safeNonce = raw(input.expectedSafeNonceRaw, "Safe nonce", 256);
  if (action === "pause")
    return {
      method: "setBuybacksPaused" as const,
      args: [flag(input.paused)] as const,
      safeNonce,
    };
  if (action === "interval")
    return {
      method: "setGlobalMinInterval" as const,
      args: [raw(input.minInterval, "minimum interval", 64)] as const,
      safeNonce,
    };
  const asset = address(input.asset);
  if (action === "asset-pause")
    return {
      method: "setAssetBuybacksPaused" as const,
      args: [asset, flag(input.paused)] as const,
      safeNonce,
      asset,
    };
  const revision = raw(input.expectedRevisionRaw, "revision", 64);
  if (action === "route") {
    if (!Array.isArray(input.pools) || input.pools.length > 2)
      throw new Error("A route has at most two pools");
    const pools = input.pools.map((value) => {
      const pool = record(value, [
        "currency0",
        "currency1",
        "fee",
        "tickSpacing",
        "hooks",
      ]);
      const currency0 = address(pool.currency0),
        currency1 = address(pool.currency1),
        hooks = address(pool.hooks);
      if (BigInt(currency0) >= BigInt(currency1))
        throw new Error("Pool currencies must be ordered");
      if (hooks !== zeroAddress)
        throw new Error("Conversion hooks must be zero");
      return {
        currency0,
        currency1,
        fee: integer(pool.fee, "fee", 0, 1000000),
        tickSpacing: integer(pool.tickSpacing, "tick spacing", 1, 32767),
        hooks,
      };
    });
    return {
      method: "setRoute" as const,
      args: [asset, { pools }] as const,
      safeNonce,
      asset,
      revision,
    };
  }
  const inputLimits = record(input.limits, [
    "minInput",
    "maxInput",
    "minInterval",
  ]);
  const minInput = raw(inputLimits.minInput, "minimum input", 128, true);
  const maxInput = raw(inputLimits.maxInput, "maximum input", 128, true);
  if (maxInput < minInput)
    throw new Error("Maximum batch must cover minimum batch");
  const limits = {
    minInput,
    maxInput,
    minInterval: raw(inputLimits.minInterval, "minimum interval", 64),
  };
  return {
    method: "setLimits" as const,
    args: [asset, limits] as const,
    safeNonce,
    asset,
    revision,
  };
}

async function runtimeIdentity(
  client: PublicClient,
  target: Address,
  artifactName: string,
  blockNumber: bigint,
) {
  const code = await client.getBytecode({ address: target, blockNumber });
  if (!code || code === "0x")
    throw new Error(`${artifactName}: no runtime code`);
  const artifact = JSON.parse(
    await readFile(
      resolve(
        root,
        "contracts/out",
        `${artifactName}.sol`,
        `${artifactName}.json`,
      ),
      "utf8",
    ),
  );
  compareRuntime(
    artifact.deployedBytecode.object,
    code,
    artifact.deployedBytecode.immutableReferences ?? {},
  );
  return keccak256(code);
}

export async function readAdminContext(
  client: PublicClient,
  chainId: number,
  factory: Address,
): Promise<AdminContext> {
  if ((await client.getChainId()) !== chainId)
    throw new Error("Administration RPC chain mismatch");
  const block = await client.getBlock();
  const blockNumber = block.number;
  const [safe, vault, protocolToken, factoryCodeHash] = await Promise.all([
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
    runtimeIdentity(client, factory, "MembershipFactory", blockNumber),
  ]);
  const [
    vaultFactory,
    vaultToken,
    vaultCodeHash,
    safeCode,
    singleton,
    version,
    owners,
    threshold,
    modules,
    fallback,
    guard,
    safeNonce,
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
    runtimeIdentity(client, vault, "ProtocolBuybackVault", blockNumber),
    client.getBytecode({ address: safe, blockNumber }),
    client.readContract({
      address: safe,
      abi: iSafeAbi,
      functionName: "masterCopy",
      blockNumber,
    }),
    client.readContract({
      address: safe,
      abi: iSafeAbi,
      functionName: "VERSION",
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
    client.readContract({
      address: safe,
      abi: iSafeAbi,
      functionName: "getModulesPaginated",
      args: ["0x0000000000000000000000000000000000000001", 1n],
      blockNumber,
    }),
    client.readContract({
      address: safe,
      abi: iSafeAbi,
      functionName: "getStorageAt",
      args: [
        0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5n,
        1n,
      ],
      blockNumber,
    }),
    client.readContract({
      address: safe,
      abi: iSafeAbi,
      functionName: "getStorageAt",
      args: [
        0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8n,
        1n,
      ],
      blockNumber,
    }),
    client.readContract({
      address: safe,
      abi: iSafeAbi,
      functionName: "nonce",
      blockNumber,
    }),
  ]);
  const canonicalSingleton = sourceManifest.records.safeSingleton.address;
  const executor = await client.readContract({
    address: vault,
    abi: protocolBuybackVaultAbi,
    functionName: "executor",
    blockNumber,
  });
  if (protocolToken === zeroAddress) {
    if (executor !== zeroAddress)
      throw new Error("Unbound token has an executor");
  } else {
    const [executorVault, executorToken, executorCurve] = await Promise.all([
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
      client.readContract({
        address: executor,
        abi: ponsBuybackExecutorAbi,
        functionName: "curve",
        blockNumber,
      }),
      runtimeIdentity(client, executor, "PonsBuybackExecutor", blockNumber),
    ]);
    const launched = await client.readContract({
      address: getAddress(sourceManifest.records.factory.address),
      abi: bindings.iPonsLaunchFactoryAbi,
      functionName: "getLaunchedToken",
      args: [protocolToken],
      blockNumber,
    });
    if (
      getAddress(executorVault) !== getAddress(vault) ||
      getAddress(executorToken) !== getAddress(protocolToken) ||
      !launched.exists ||
      launched.pairToken !== zeroAddress ||
      getAddress(launched.curve) !== getAddress(executorCurve)
    )
      throw new Error("Invalid executor or Pons launch identity");
  }
  const handler = sourceManifest.records.safeFallbackHandler.address;
  if (
    getAddress(vaultFactory) !== getAddress(factory) ||
    getAddress(vaultToken) !== getAddress(protocolToken) ||
    !safeCode ||
    keccak256(safeCode) !==
      "0x4e381985ca68b3e5d27b4425fa581c19cf33146d3f887a3cfca96f55528ea46f" ||
    getAddress(singleton) !== getAddress(canonicalSingleton) ||
    version !== "1.5.0" ||
    threshold < 1n ||
    threshold > BigInt(owners.length) ||
    modules[0].length ||
    BigInt(modules[1]) !== 1n ||
    BigInt(fallback) !== BigInt(handler) ||
    BigInt(guard) !== 0n
  )
    throw new Error("Invalid Safe or immutable protocol identity");
  for (const [target, hash] of [
    [
      singleton,
      "0x180193227186ccb85316c94db1f0d156ed932b14712cfaac78901899178572dc",
    ],
    [
      getAddress(handler),
      "0x3c6a85bcf7b563daa624b884b4e9a1b9fa5371edde7be945d998071a48f28bbc",
    ],
  ] as const) {
    const code = await client.getBytecode({ address: target, blockNumber });
    if (!code || keccak256(code) !== hash)
      throw new Error("Canonical Safe dependency runtime mismatch");
  }
  return {
    chainId,
    blockNumber,
    blockTimestamp: block.timestamp,
    safe,
    safeNonce,
    factory,
    vault,
    protocolToken,
    factoryCodeHash,
    vaultCodeHash,
    version: VERSION,
  };
}

function envelope(
  context: AdminContext,
  to: Address,
  data: Hex,
  targetCodeHash: Hex,
) {
  return {
    chainId: context.chainId,
    capturedBlock: context.blockNumber.toString(),
    safe: context.safe,
    safeNonce: context.safeNonce.toString(),
    to,
    value: "0",
    operation: 0 as const,
    data,
    targetVersion: context.version,
    targetCodeHash,
    safeTxGas: "2000000",
    baseGas: "0",
    gasPrice: "0",
    gasToken: zeroAddress,
    refundReceiver: zeroAddress,
    status: "prepared-awaiting-safe-signatures",
  };
}

export async function prepareBuybackPayload(
  client: PublicClient,
  context: AdminContext,
  action: string,
  input: unknown,
) {
  const parsed = parseBuybackInput(action, input);
  if (parsed.safeNonce !== context.safeNonce)
    throw new Error("Stale Safe nonce");
  if (parsed.revision !== undefined) {
    const current = await client.readContract({
      address: context.vault,
      abi: protocolBuybackVaultAbi,
      functionName: "revision",
      args: [parsed.asset!],
      blockNumber: context.blockNumber,
    });
    if (current !== parsed.revision) throw new Error("Stale asset revision");
  }
  // The generated union preserves each method's exact ABI. Correlation across
  // this union is carried by encodeFunctionData and the canonical simulation.
  const call = {
    abi: protocolBuybackVaultAbi,
    functionName: parsed.method,
    args: parsed.args,
  };
  const data = encodeFunctionData(call);
  await client.simulateContract({
    ...call,
    address: context.vault,
    account: context.safe,
    blockNumber: context.blockNumber,
  });
  return {
    ...envelope(context, context.vault, data, context.vaultCodeHash),
    decoded: decodeFunctionData({ abi: protocolBuybackVaultAbi, data }),
    previousRevision: parsed.revision?.toString() ?? null,
    expectedRevision:
      parsed.revision !== undefined ? (parsed.revision + 1n).toString() : null,
    postconditions: {
      method: parsed.method,
      arguments: parsed.args,
      revisionChanges: parsed.revision !== undefined,
    },
  };
}

async function inspectToken(
  client: PublicClient,
  context: AdminContext,
  token: Address,
) {
  const blockNumber = context.blockNumber;
  const [name, symbol, decimals, listed, enabled, vaultBalance] =
    await Promise.all([
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "name",
        blockNumber,
      }),
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "symbol",
        blockNumber,
      }),
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "decimals",
        blockNumber,
      }),
      client.readContract({
        address: context.factory,
        abi: membershipFactoryAbi,
        functionName: "isPaymentTokenListed",
        args: [token],
        blockNumber,
      }),
      client.readContract({
        address: context.factory,
        abi: membershipFactoryAbi,
        functionName: "isPaymentTokenEnabled",
        args: [token],
        blockNumber,
      }),
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [context.vault],
        blockNumber,
      }),
    ]);
  const supports = async (interfaceId: Hex) => {
    try {
      return await client.readContract({
        address: token,
        abi: ierc165Abi,
        functionName: "supportsInterface",
        args: [interfaceId],
        blockNumber,
      });
    } catch (error) {
      if (
        error instanceof BaseError &&
        error.walk(
          (e) =>
            e instanceof ContractFunctionRevertedError ||
            e instanceof ContractFunctionZeroDataError,
        ) instanceof BaseError
      ) {
        const cause = error.walk(
          (e) =>
            e instanceof ContractFunctionRevertedError ||
            e instanceof ContractFunctionZeroDataError,
        );
        if (
          cause instanceof ContractFunctionRevertedError ||
          cause instanceof ContractFunctionZeroDataError
        )
          return false;
      }
      throw error;
    }
  };
  const [core, pending] = await Promise.all([
    supports("0xa60bf13d"),
    supports("0x4bd27648"),
  ]);
  if (core !== pending || !name.trim() || !symbol.trim())
    throw new Error("Unsupported payment-token metadata or scaling interfaces");
  const scaling = core
    ? await Promise.all([
        client.readContract({
          address: token,
          abi: iScaledUiAmountAbi,
          functionName: "uiMultiplier",
          blockNumber,
        }),
        client.readContract({
          address: token,
          abi: iScaledUiAmountNewUiMultiplierAbi,
          functionName: "newUIMultiplier",
          blockNumber,
        }),
        client.readContract({
          address: token,
          abi: iScaledUiAmountNewUiMultiplierAbi,
          functionName: "effectiveAt",
          blockNumber,
        }),
      ])
    : [10n ** 18n, 10n ** 18n, 0n];
  if (scaling[0] === 0n || scaling[1] === 0n)
    throw new Error("UI multipliers must be nonzero");
  return {
    token,
    name,
    symbol,
    decimals,
    listed,
    enabled,
    minimumPayment: await client.readContract({
      address: context.factory,
      abi: membershipFactoryAbi,
      functionName: "minimumPayment",
      args: [token],
      blockNumber,
    }),
    vaultBalanceRaw: vaultBalance,
    uiMultiplier: scaling[0],
    newUIMultiplier: scaling[1],
    effectiveAt: scaling[2],
  };
}

export async function prepareMinimumPaymentPayload(
  client: PublicClient,
  context: AdminContext,
  token: Address,
  minimum: bigint,
) {
  if (minimum <= 0n || minimum >= 1n << 112n)
    throw new Error("Minimum must be a positive uint112 raw token amount.");
  const metadata = await inspectToken(client, context, token);
  const call = {
    abi: membershipFactoryAbi,
    functionName: "setMinimumPayment",
    args: [token, minimum],
  } as const;
  await client.simulateContract({
    ...call,
    address: context.factory,
    account: context.safe,
    blockNumber: context.blockNumber,
  });
  const data = encodeFunctionData(call);
  return {
    ...envelope(context, context.factory, data, context.factoryCodeHash),
    decoded: decodeFunctionData({ abi: membershipFactoryAbi, data }),
    metadata,
    postconditions: { paymentToken: token, minimumPayment: minimum },
  };
}

export async function preparePaymentTokenPayload(
  client: PublicClient,
  context: AdminContext,
  token: Address,
  enabled: boolean,
) {
  const metadata = await inspectToken(client, context, token);
  const call = {
    abi: membershipFactoryAbi,
    functionName: "setPaymentTokenEnabled" as const,
    args: [token, enabled] as const,
  };
  await client.simulateContract({
    ...call,
    address: context.factory,
    account: context.safe,
    blockNumber: context.blockNumber,
  });
  const data = encodeFunctionData(call);
  return {
    ...envelope(context, context.factory, data, context.factoryCodeHash),
    decoded: decodeFunctionData({ abi: membershipFactoryAbi, data }),
    metadata,
    postconditions: { paymentToken: token, listed: true, enabled },
  };
}

async function main() {
  const [kind, network, action, ...args] = process.argv.slice(2);
  if (!(
    (kind === "tokens" &&
      ["list", "inspect", "enable", "disable", "minimum"].includes(action)) ||
    (kind === "buybacks" && ["inspect", "prepare"].includes(action))
  ))
    throw new Error(
      "Unsupported action; these tools only read or prepare Safe payloads",
    );
  const config = validateAdminRpc(network, process.env.BBF_ADMIN_RPC_URL ?? "");
  const generatedAddresses = (
    bindings as { membershipFactoryAddress?: Record<number, Address> }
  ).membershipFactoryAddress;
  const factory = address(
    process.env.BBF_FACTORY_ADDRESS ?? generatedAddresses?.[config.chainId],
  );
  const client = createPublicClient({
    transport: http(config.rpcUrl, { retryCount: 0 }),
  });
  const context = await readAdminContext(client, config.chainId, factory);
  if (kind === "tokens") {
    if (action === "list") {
      if (args.length)
        throw new Error("list takes no token or submission mode");
      const count = await client.readContract({
        address: factory,
        abi: membershipFactoryAbi,
        functionName: "paymentTokenCount",
        blockNumber: context.blockNumber,
      });
      const tokens = [];
      for (let offset = 0n; offset < count; offset += 100n) {
        const page = await client.readContract({
          address: factory,
          abi: membershipFactoryAbi,
          functionName: "paymentTokens",
          args: [offset, 100n],
          blockNumber: context.blockNumber,
        });
        if (
          BigInt(page.length) !==
          (count - offset < 100n ? count - offset : 100n)
        )
          throw new Error("Incomplete registry page");
        tokens.push(
          ...(await Promise.all(
            page.map((token) => inspectToken(client, context, token)),
          )),
        );
      }
      console.log(json({ context, tokens }));
      return;
    }
    if (action === "minimum") {
      if (args.length !== 2)
        throw new Error(
          "minimum requires a token and positive raw amount; prepares a Safe payload only.",
        );
      console.log(
        json(
          await prepareMinimumPaymentPayload(
            client,
            context,
            address(args[0]),
            raw(args[1], "minimum payment", 112, true),
          ),
        ),
      );
      return;
    }
    if (args.length !== 1)
      throw new Error(
        "One token is required; direct submission is unavailable",
      );
    const token = address(args[0]);
    console.log(
      json(
        action === "inspect"
          ? { context, token: await inspectToken(client, context, token) }
          : await preparePaymentTokenPayload(
              client,
              context,
              token,
              action === "enable",
            ),
      ),
    );
    return;
  }
  if (action === "inspect") {
    if (args.length > 1) throw new Error("inspect takes at most one asset");
    const asset = args.length ? address(args[0]) : zeroAddress;
    const reads = await Promise.all([
      client.readContract({
        address: context.vault,
        abi: protocolBuybackVaultAbi,
        functionName: "route",
        args: [asset],
        blockNumber: context.blockNumber,
      }),
      client.readContract({
        address: context.vault,
        abi: protocolBuybackVaultAbi,
        functionName: "limits",
        args: [asset],
        blockNumber: context.blockNumber,
      }),
      client.readContract({
        address: context.vault,
        abi: protocolBuybackVaultAbi,
        functionName: "revision",
        args: [asset],
        blockNumber: context.blockNumber,
      }),
      client.readContract({
        address: context.vault,
        abi: protocolBuybackVaultAbi,
        functionName: "buybacksPaused",
        blockNumber: context.blockNumber,
      }),
      client.readContract({
        address: context.vault,
        abi: protocolBuybackVaultAbi,
        functionName: "assetBuybacksPaused",
        args: [asset],
        blockNumber: context.blockNumber,
      }),
    ]);
    console.log(
      json({
        context,
        asset,
        route: reads[0],
        limits: reads[1],
        revision: reads[2],
        globalPaused: reads[3],
        assetPaused: reads[4],
      }),
    );
    return;
  }
  if (args.length !== 5 || args[1] !== "--input" || args[3] !== "--output")
    throw new Error(
      "prepare <route|limits|interval|pause|asset-pause> --input <json-file> --output <payload-file>",
    );
  const input = JSON.parse(await readFile(args[2], "utf8"));
  const payload = await prepareBuybackPayload(client, context, args[0], input);
  await writeFile(args[4], json(payload) + "\n", { flag: "wx" });
  console.log(`Prepared Safe payload: ${args[4]}`);
}
if (import.meta.main)
  main().catch((error) => {
    // Library error causes can contain private transport URLs. Emit a bounded
    // operator message; the untouched input remains available for review.
    const message =
      error instanceof Error && !(error instanceof BaseError)
        ? error.message
        : "Onchain identity, token validation or Safe call simulation failed";
    console.error(
      `Protocol administration: ${message.replaceAll(process.env.BBF_ADMIN_RPC_URL ?? "\0", "[PRIVATE_RPC]")}`,
    );
    process.exitCode = 1;
  });
