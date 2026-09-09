import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { configuredOrigin, originPin } from "./origin";
import { compareRuntime, type ImmutableReferences } from "./verify-runtime";
import type { Abi, Address, Hex } from "../../web/node_modules/viem";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
// Reuse the web workspace's pinned dependencies without creating another package/lockfile.
const require = createRequire(resolve(repoRoot, "web/package.json"));
const {
  createPublicClient,
  http,
  keccak256,
  erc20Abi,
  zeroAddress,
}: typeof import("../../web/node_modules/viem") = require("viem");

export type Origin = { blockNumber: bigint; blockHash: Hex };
type Check = {
  id: string;
  status: "passed" | "failed";
  reason: string;
  observed?: unknown;
};
type ReadRequest = {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  blockNumber: bigint;
};
export type Reader = {
  getChainId(): Promise<number>;
  getBlock(request: {
    blockNumber: bigint;
  }): Promise<{ number: bigint; hash: Hex; timestamp: bigint }>;
  getCode(request: {
    address: Address;
    blockNumber: bigint;
  }): Promise<Hex | undefined>;
  readContract(request: ReadRequest): Promise<unknown>;
  getStorageAt?(request: {
    address: Address;
    slot: Hex;
    blockNumber: bigint;
  }): Promise<Hex | undefined>;
};
type Asset = {
  kind: "usdg" | "stock" | "non-stock";
  address: Address;
  decimals: number;
};
type Inputs = {
  quoter?: Address;
  routes?: Partial<
    Record<
      Asset["kind"],
      {
        amountInRaw: string;
        pools: Array<{
          currency0: Address;
          currency1: Address;
          fee: number;
          tickSpacing: number;
          hooks: Address;
        }>;
      }
    >
  >;
  runtimeLocks?: Record<
    string,
    {
      runtimeCodeHash: Hex;
      compilerInputPath: string;
      compilerInputSha256: string;
      independentlyCompiled?: boolean;
      compiledRuntime?: Hex;
      immutableReferences?: ImmutableReferences;
    }
  >;
  assets?: Asset[];
};

const candidates = {
  factory: "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e",
  poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
  positionManager: "0x58daec3116aae6D93017bAAea7749052E8a04fA7",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  locker: "0x267444D099b10fB5Ed7c3Cc7B7c767AdcA574952",
  memeHook: "0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044",
  feeEscrow: "0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e",
  buybackVault: "0x42df2a798f82289E177311362e8f5ccC45c1219c",
  router: "0x8876789976decbfcbbbe364623c63652db8c0904",
  weth: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
  safeSingleton: "0xEdd160fEBBD92E350D4D398fb636302fccd67C7e",
  safeProxyFactory: "0x14F2982D601c9458F93bd70B218933A6f8165e7b",
  safeFallbackHandler: "0x3EfCBb83A4A7AfcB4F68D501E2c2203a38be77f4",
} as const satisfies Record<string, Address>;

const safeCodeHashes: Record<string, Hex> = {
  safeSingleton:
    "0x180193227186ccb85316c94db1f0d156ed932b14712cfaac78901899178572dc",
  safeProxyFactory:
    "0x967dae4cda22b0c9ef7f31b010bdc1ceb0af9904b0c3dc060b5302e4c18a4529",
  safeFallbackHandler:
    "0x3c6a85bcf7b563daa624b884b4e9a1b9fa5371edde7be945d998071a48f28bbc",
};

async function artifactAbi(path: string): Promise<Abi> {
  const artifact = JSON.parse(
    await readFile(resolve(repoRoot, "contracts/out", path), "utf8"),
  );
  if (!Array.isArray(artifact.abi))
    throw new Error(`Missing compiled ABI: ${path}; run forge build`);
  return artifact.abi as Abi;
}

export function validatePreflightEnvironment(
  env: Record<string, string | undefined>,
) {
  const origin = configuredOrigin(env);
  if (!env.BBF_FORK_RPC_URL)
    throw new Error("BBF_FORK_RPC_URL is required privately");
  const rpc = new URL(env.BBF_FORK_RPC_URL);
  if (!["https:", "http:"].includes(rpc.protocol))
    throw new Error("Origin RPC must use HTTP(S)");
  const evidenceDir = env.BBF_FORK_EVIDENCE_DIR;
  if (!evidenceDir || !isAbsolute(evidenceDir))
    throw new Error("BBF_FORK_EVIDENCE_DIR must be absolute");
  const tempDir = env.BBF_FORK_TEMP_DIR;
  if (tempDir) {
    const child = relative(resolve(tempDir), resolve(evidenceDir));
    if (child === "" || (!child.startsWith("../") && !isAbsolute(child)))
      throw new Error("Evidence must remain outside the disposable directory");
  }
  const executionRpc =
    env.BBF_FORK_EXECUTION_RPC_URL ?? "http://127.0.0.1:8547";
  const local = new URL(executionRpc);
  if (
    local.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(local.hostname) ||
    !local.port ||
    local.username ||
    local.password ||
    local.search ||
    local.hash ||
    local.pathname !== "/"
  )
    throw new Error(
      "Execution RPC must be an uncredentialed loopback HTTP endpoint",
    );
  return {
    origin,
    originRpc: rpc.href,
    executionRpc,
    evidenceDir: resolve(evidenceDir),
  };
}

export async function runPreflight(
  client: Reader,
  origin: Origin,
  inputs: Inputs = {},
) {
  const checks: Check[] = [];
  const check = (
    id: string,
    passed: boolean,
    reason: string,
    observed?: unknown,
  ) => {
    checks.push({
      id,
      status: passed ? "passed" : "failed",
      reason,
      ...(observed === undefined ? {} : { observed }),
    });
  };
  const finish = () =>
    JSON.parse(
      JSON.stringify(
        {
          schemaVersion: 1,
          scope: "read-only-preflight",
          origin: { chainId: 4663, ...origin },
          executionChainId: 31337,
          status: checks.every((value) => value.status === "passed")
            ? "passed"
            : "failed",
          checks,
        },
        (_, value) => (typeof value === "bigint" ? value.toString() : value),
      ),
    ) as {
      schemaVersion: number;
      scope: string;
      status: "passed" | "failed";
      checks: Check[];
    };
  try {
    const chainId = await client.getChainId();
    check(
      "origin.chain",
      chainId === 4663,
      "Origin chain must be Robinhood mainnet",
      chainId,
    );
    if (chainId !== 4663) return finish();
    const block = await client.getBlock({ blockNumber: origin.blockNumber });
    const matches =
      block.number === origin.blockNumber &&
      block.hash.toLowerCase() === origin.blockHash.toLowerCase();
    check(
      "origin.block",
      matches,
      "Historical block number and hash must both match",
      block,
    );
    if (!matches) return finish();
  } catch {
    check("origin.archive", false, "Historical header read failed");
    return finish();
  }

  const factoryAbi = await artifactAbi("IPons.sol/IPonsLaunchFactory.json");
  const hookAbi = await artifactAbi("IPons.sol/IPonsMemeHook.json");
  const vaultAbi = await artifactAbi("IPons.sol/IPonsBuybackVault.json");
  const addresses: Record<string, Address> = { ...candidates };
  if (inputs.quoter) addresses.quoter = inputs.quoter;
  async function read(
    role: string,
    abi: Abi,
    functionName: string,
    args?: readonly unknown[],
    expected?: unknown,
  ) {
    try {
      const value = await client.readContract({
        address: addresses[role],
        abi,
        functionName,
        args,
        blockNumber: origin.blockNumber,
      });
      const matches =
        expected === undefined ||
        String(value).toLowerCase() === String(expected).toLowerCase();
      check(
        `${role}.${functionName}`,
        matches,
        expected === undefined
          ? "Historical contract read"
          : "Canonical dependency/state comparison",
        value,
      );
      return value;
    } catch {
      // Library errors can contain the complete private URL. Retain the exact role/method/pin,
      // never the transport error string or cause; no retry at latest or synthetic fallback.
      check(
        `${role}.${functionName}`,
        false,
        "Historical contract read failed",
      );
      return undefined;
    }
  }

  for (const role of [
    "poolManager",
    "positionManager",
    "permit2",
    "locker",
    "memeHook",
    "feeEscrow",
    "buybackVault",
  ]) {
    await read("factory", factoryAbi, role, undefined, addresses[role]);
  }
  for (const role of [
    "graduationExecutor",
    "graduationGuard",
    "launchDeployer",
  ]) {
    const address = await read("factory", factoryAbi, role);
    if (
      typeof address === "string" &&
      /^0x[0-9a-fA-F]{40}$/.test(address) &&
      address !== zeroAddress
    )
      addresses[role] = address as Address;
    else
      check(`dependency.${role}`, false, "Required launch helper is missing");
  }
  await read("factory", factoryAbi, "launchEnabled", undefined, true);
  for (const name of [
    "launchFee",
    "snipeTaxStartBps",
    "snipeTaxSeconds",
    "owner",
  ])
    await read("factory", factoryAbi, name);
  const config = (await read("factory", factoryAbi, "getLaunchConfig", [
    0n,
  ])) as
    | { enabled?: boolean; supply?: bigint; graduationThreshold?: bigint }
    | undefined;
  check(
    "launch.preset",
    config?.enabled === true &&
      (config.supply ?? 0n) > 0n &&
      (config.graduationThreshold ?? 0n) > 0n,
    "Preset 0 must enable a positive supply and graduation threshold",
  );
  const economics = await read(
    "factory",
    factoryAbi,
    "previewLaunchEconomics",
    [0n, zeroAddress],
  );
  check(
    "launch.economics",
    typeof economics === "string" &&
      /^0x[0-9a-fA-F]{64}$/.test(economics) &&
      BigInt(economics) !== 0n,
    "Native ETH launch must return nonzero pinned economics",
    economics,
  );
  await read("memeHook", hookAbi, "factory", undefined, candidates.factory);
  await read(
    "memeHook",
    hookAbi,
    "poolManager",
    undefined,
    candidates.poolManager,
  );
  await read(
    "memeHook",
    hookAbi,
    "buybackVault",
    undefined,
    candidates.buybackVault,
  );
  await read("memeHook", hookAbi, "feeSweepOperator");
  await read("memeHook", hookAbi, "currentFeePolicy");
  await read(
    "buybackVault",
    vaultAbi,
    "factory",
    undefined,
    candidates.factory,
  );
  await read(
    "buybackVault",
    vaultAbi,
    "feePolicy",
    undefined,
    candidates.memeHook,
  );
  await read(
    "buybackVault",
    vaultAbi,
    "feeEscrow",
    undefined,
    candidates.feeEscrow,
  );
  await read(
    "buybackVault",
    vaultAbi,
    "VESTING_DURATION",
    undefined,
    157680000n,
  );

  // Pin the bridge WETH implementation as well as its transparent proxy. An
  // administrator can change it; proxy bytecode alone cannot establish behavior.
  try {
    if (!client.getStorageAt) throw new Error("Storage reader unavailable");
    const implementationSlot = await client.getStorageAt({
      address: addresses.weth,
      blockNumber: origin.blockNumber,
      slot: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
    });
    const adminSlot = await client.getStorageAt({
      address: addresses.weth,
      blockNumber: origin.blockNumber,
      slot: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
    });
    if (!implementationSlot || !adminSlot)
      throw new Error("Proxy storage unavailable");
    const implementation = `0x${implementationSlot.slice(-40)}` as Address;
    const admin = `0x${adminSlot.slice(-40)}` as Address;
    if (implementation === zeroAddress || admin === zeroAddress)
      throw new Error("Proxy identity missing");
    addresses["weth-implementation"] = implementation;
    check(
      "weth.proxy-authority",
      true,
      "Upgradeable WETH implementation and administrator at the pinned origin",
      { implementation, admin },
    );
  } catch {
    check(
      "weth.proxy-authority",
      false,
      "WETH implementation and administrator must be independently identified",
    );
  }

  let allSourcesMatched = true;
  for (const [role, address] of Object.entries(addresses)) {
    try {
      const code = await client.getCode({
        address,
        blockNumber: origin.blockNumber,
      });
      if (!code || code === "0x") {
        check(
          `code.${role}`,
          false,
          "Dependency has no historical runtime code",
          { address },
        );
        allSourcesMatched = false;
        continue;
      }
      const runtimeCodeHash = keccak256(code);
      const lock = inputs.runtimeLocks?.[role];
      const expectedHash = safeCodeHashes[role] ?? lock?.runtimeCodeHash;
      check(
        `code.${role}`,
        expectedHash === undefined || runtimeCodeHash === expectedHash,
        "Historical runtime identity (presence alone is discovery)",
        { address, runtimeCodeHash, expectedHash },
      );
      if (lock) {
        const compilerInput = await readFile(
          resolve(repoRoot, lock.compilerInputPath),
        );
        const inputHash = createHash("sha256")
          .update(compilerInput)
          .digest("hex");
        const parsedInput = JSON.parse(compilerInput.toString()) as {
          language?: unknown;
          sources?: unknown;
          settings?: unknown;
        };
        const completeInput =
          parsedInput.language === "Solidity" &&
          parsedInput.sources !== null &&
          typeof parsedInput.sources === "object" &&
          Object.keys(parsedInput.sources).length > 0 &&
          typeof parsedInput.settings === "object" &&
          parsedInput.settings !== null;
        let runtimeMatched = false;
        if (
          lock.independentlyCompiled &&
          lock.compiledRuntime &&
          lock.immutableReferences
        ) {
          compareRuntime(lock.compiledRuntime, code, lock.immutableReferences);
          runtimeMatched = true;
        }
        const matches =
          runtimeMatched &&
          runtimeCodeHash === lock.runtimeCodeHash &&
          inputHash === lock.compilerInputSha256 &&
          completeInput;
        check(
          `source.${role}`,
          matches,
          "Retained input, independently compiled runtime and historical bytecode must match",
          { compilerInputSha256: inputHash },
        );
        allSourcesMatched &&= matches;
      } else allSourcesMatched = false;
    } catch {
      check(
        `code.${role}`,
        false,
        "Historical code or retained compiler input read failed",
        { address },
      );
      allSourcesMatched = false;
    }
  }
  check(
    "sources.verified-input-coverage",
    allSourcesMatched,
    "Every dependency requires retained compiler input and independent compilation evidence matching historical runtime, with immutable and metadata differences explicitly bounded",
  );

  const stockAbi = await artifactAbi("IERC8056.sol/IScaledUIAmount.json");
  const quoterAbi = await artifactAbi("IV4Quoter.sol/IV4Quoter.json");
  if (inputs.quoter)
    await read(
      "quoter",
      quoterAbi,
      "poolManager",
      undefined,
      candidates.poolManager,
    );
  const assets = inputs.assets ?? [
    {
      kind: "usdg",
      address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
      decimals: 6,
    },
    { kind: "non-stock", address: candidates.weth, decimals: 18 },
  ];
  for (const kind of ["usdg", "stock", "non-stock"] as const) {
    const asset = assets.find((value) => value.kind === kind);
    check(
      `assets.${kind}`,
      asset !== undefined,
      "Authentic asset identity must be supplied and read at the origin",
    );
    if (!asset) continue;
    addresses[kind] = asset.address;
    await read(kind, erc20Abi, "decimals", undefined, asset.decimals);
    await read(kind, erc20Abi, "symbol");
    await read(kind, erc20Abi, "totalSupply");
    if (kind === "stock") await read(kind, stockAbi, "uiMultiplier");
    if (asset.address.toLowerCase() === candidates.weth.toLowerCase()) {
      check(
        `routes.${kind}`,
        asset.decimals === 18,
        "Canonical WETH unwrap path; actual acquisition/execution belongs to fork acceptance",
      );
      continue;
    }
    const route = inputs.routes?.[kind];
    if (
      !inputs.quoter ||
      !route ||
      route.pools.length < 1 ||
      route.pools.length > 2 ||
      !/^[1-9][0-9]*$/.test(route.amountInRaw)
    ) {
      check(
        `routes.${kind}`,
        false,
        "Missing bounded official-quoter route and raw input amount",
      );
      continue;
    }
    let currency = asset.address.toLowerCase();
    let amount = BigInt(route.amountInRaw);
    let quoted = true;
    for (const pool of route.pools) {
      const zeroForOne = currency === pool.currency0.toLowerCase();
      if (
        (!zeroForOne && currency !== pool.currency1.toLowerCase()) ||
        BigInt(pool.currency0) >= BigInt(pool.currency1) ||
        amount >= 2n ** 128n
      ) {
        quoted = false;
        break;
      }
      const quote = await read("quoter", quoterAbi, "quoteExactInputSingle", [
        { poolKey: pool, zeroForOne, exactAmount: amount, hookData: "0x" },
      ]);
      if (
        !Array.isArray(quote) ||
        typeof quote[0] !== "bigint" ||
        quote[0] === 0n
      ) {
        quoted = false;
        break;
      }
      amount = quote[0];
      currency = (zeroForOne ? pool.currency1 : pool.currency0).toLowerCase();
    }
    check(
      `routes.${kind}`,
      quoted && [zeroAddress, candidates.weth.toLowerCase()].includes(currency),
      "Pinned official-quoter route to ETH/WETH; a quote is not acquisition or swap/burn acceptance",
      {
        inputAsset: asset.address,
        amountInRaw: route.amountInRaw,
        outputAsset: currency,
        amountOutRaw: amount,
      },
    );
  }
  return finish();
}

export async function captureSourceSnapshot() {
  const paths = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: repoRoot },
  )
    .toString()
    .split("\0")
    .filter((path) => Boolean(path) && !/^specs\/[^/]+\/evidence\//.test(path))
    .sort();
  const snapshot = createHash("sha256");
  for (const path of paths) {
    snapshot.update(path).update("\0");
    try {
      snapshot.update(await readFile(resolve(repoRoot, path)));
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== "ENOENT" &&
        (error as NodeJS.ErrnoException).code !== "EISDIR"
      )
        throw error;
      snapshot.update("<deleted-or-submodule>");
    }
    snapshot.update("\0");
  }
  return {
    commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot })
      .toString()
      .trim(),
    dirty:
      execFileSync("git", ["status", "--porcelain"], { cwd: repoRoot }).length >
      0,
    snapshotSha256: snapshot.digest("hex"),
  };
}

async function main() {
  const config = validatePreflightEnvironment(process.env);
  const output = resolve(config.evidenceDir, "preflight");
  await mkdir(output, { recursive: true });
  const client = createPublicClient({
    transport: http(config.originRpc, { retryCount: 0, timeout: 15000 }),
  });
  const inputs: Inputs = JSON.parse(
    await readFile(
      process.env.BBF_FORK_INPUTS ?? resolve(repoRoot, originPin.inputsPath),
      "utf8",
    ),
  );
  const report = await runPreflight(client, config.origin, inputs);
  const source = await captureSourceSnapshot();
  await writeFile(
    resolve(output, "report.json"),
    JSON.stringify({ ...report, source }, null, 2) + "\n",
  );
  for (const check of report.checks.filter(
    (value) => value.status === "failed",
  ))
    console.error(`${check.id}: ${check.reason}`);
  console.log(
    `Read-only preflight ${report.status}; retained ${resolve(output, "report.json")}`,
  );
  process.exitCode = report.status === "passed" ? 0 : 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(() => {
    console.error(
      "Preflight could not complete. Check required pins, retained input files, compiled artifacts, and private RPC access; provider details are omitted.",
    );
    process.exitCode = 1;
  });
}
