import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { Address, Hex, Log } from "../../web/node_modules/viem";
import { captureSourceSnapshot } from "./preflight";
import {
  iPonsLaunchFactoryAbi,
  iSafeAbi,
  protocolBuybackVaultAbi,
} from "../../web/src/contracts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(resolve(root, "web/package.json"));
const {
  createPublicClient,
  http,
  keccak256,
  parseEventLogs,
  decodeFunctionData,
  erc20Abi,
  serializeTransaction,
}: typeof import("../../web/node_modules/viem") = require("viem");
const Ajv: typeof import("../../web/node_modules/ajv").default = require("ajv");
type RecordValue = Record<string, unknown>;
type Receipt = {
  transactionHash: Hex;
  blockHash: Hex;
  blockNumber: string;
  from: Address;
  to: Address | null;
  contractAddress: Address | null;
  status: string;
  logs: Log[];
};
const json = (value: unknown) =>
  JSON.stringify(value, (_, v) => (typeof v === "bigint" ? String(v) : v), 2) +
  "\n";
const sha = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
const pending = () => ({
  status: "not-run",
  evidenceClass: "none",
  artifacts: [],
  reason: "Independent acceptance reconciliation has not run",
});

export async function publicFiles(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.isSymbolicLink())
      throw new Error("Evidence must not contain symbolic links");
    const path = resolve(directory, item.name);
    if (item.isDirectory()) result.push(...(await publicFiles(path)));
    else if (item.isFile()) result.push(path);
  }
  return result.sort();
}
export function extractReceipts(value: unknown): Receipt[] {
  if (Array.isArray(value)) return value.flatMap(extractReceipts);
  if (!value || typeof value !== "object") return [];
  const item = value as RecordValue;
  if (
    typeof item.transactionHash === "string" &&
    typeof item.blockHash === "string" &&
    Array.isArray(item.logs) &&
    typeof item.status === "string"
  )
    return [item as unknown as Receipt];
  return Object.values(item).flatMap(extractReceipts);
}

export function acquiredAmount(receipt: Receipt, asset: Address): bigint {
  return parseEventLogs({
    abi: erc20Abi,
    eventName: "Transfer",
    logs: receipt.logs.filter(
      (log) => log.address.toLowerCase() === asset.toLowerCase(),
    ),
  }).reduce((net, log) => {
    const account = receipt.from.toLowerCase();
    return (
      net +
      (log.args.to.toLowerCase() === account ? log.args.value : 0n) -
      (log.args.from.toLowerCase() === account ? log.args.value : 0n)
    );
  }, 0n);
}

// Test-artifact exporter. Public deployment discovery remains exclusively the
// Wagmi Foundry plugin; nothing here feeds addresses into the application.
export async function exportEvidence(directory: string) {
  directory = resolve(directory);
  const read = async (path: string) =>
    JSON.parse(await readFile(resolve(directory, path), "utf8"));
  const bootstrap = await read("bootstrap.json"),
    preflight = await read("preflight/report.json"),
    fixture = await read("fixture.json");
  const rpcUrl =
    process.env.BBF_FORK_EXECUTION_RPC_URL ??
    process.env.BBF_ADMIN_RPC_URL ??
    "";
  const url = new URL(rpcUrl);
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("Evidence reads require the local execution endpoint");
  const client = createPublicClient({
    transport: http(rpcUrl, { retryCount: 0 }),
  });
  if ((await client.getChainId()) !== 31337)
    throw new Error("Evidence execution chain mismatch");
  const sourceInputs = process.env.BBF_FORK_INPUTS;
  if (!sourceInputs) throw new Error("Retained preflight inputs required");
  const inputBytes = await readFile(sourceInputs);
  const inputs = JSON.parse(inputBytes.toString());
  await mkdir(resolve(directory, "dependencies"), { recursive: true });
  await writeFile(resolve(directory, "dependencies/inputs.json"), inputBytes);
  const dependencies = [];
  for (const [role, value] of Object.entries(inputs.runtimeLocks)) {
    const lock = value as {
      address: Address;
      runtimeCodeHash: Hex;
      compilerInputPath: string;
      compilerInputSha256: string;
      compilerVersion: string;
      constructorArguments: Hex | null;
      sourceLicenses: string[];
      immutables: Record<string, string>;
      independentlyCompiled: boolean;
    };
    const data = await readFile(resolve(root, lock.compilerInputPath));
    if (sha(data) !== lock.compilerInputSha256 || !lock.independentlyCompiled)
      throw new Error(`Dependency source mismatch: ${role}`);
    const code = await client.getCode({ address: lock.address });
    if (!code || keccak256(code) !== lock.runtimeCodeHash)
      throw new Error(`Dependency runtime mismatch: ${role}`);
    const path = `dependencies/${lock.compilerInputSha256}.input.json`;
    await writeFile(resolve(directory, path), data);
    const settings = JSON.parse(data.toString()).settings;
    dependencies.push({
      role,
      address: lock.address,
      runtimeCodeHash: lock.runtimeCodeHash,
      sourceRevision: lock.compilerInputSha256,
      sourceFiles: [
        {
          path,
          sha256: lock.compilerInputSha256,
          license: lock.sourceLicenses.join(", "),
        },
      ],
      compiler: {
        version: lock.compilerVersion,
        evmVersion: settings.evmVersion,
        optimizerRuns: settings.optimizer?.runs ?? 0,
        viaIR: settings.viaIR ?? false,
        inputSha256: lock.compilerInputSha256,
      },
      constructorArguments: lock.constructorArguments,
      immutables: Object.entries(lock.immutables ?? {}).map(
        ([name, value]) => ({ name, value }),
      ),
      verification: {
        status: "passed",
        evidenceClass: "authentic-fork",
        artifacts: ["preflight/report.json", "dependencies/inputs.json", path],
        reason:
          "Pinned independently compiled source and current local runtime match",
      },
    });
  }
  const files = await publicFiles(directory),
    receipts = [];
  const receiptMap = new Map<string, { receipt: Receipt; path: string }>();
  let broadcast:
    | {
        transactions: {
          hash: Hex;
          contractAddress?: Address;
          contractName?: string;
          function?: string;
          transaction: { to?: Address; input?: Hex; data?: Hex };
        }[];
        receipts: Receipt[];
      }
    | undefined;
  for (const path of files.filter(
    (path) =>
      path.endsWith(".json") &&
      !path.includes("/dependencies/") &&
      !path.endsWith("/manifest.json"),
  )) {
    const value = JSON.parse(await readFile(path, "utf8"));
    if (path.includes("/broadcast/") && path.endsWith("/run-latest.json"))
      broadcast = value;
    for (const receipt of extractReceipts(value))
      receiptMap.set(`${receipt.blockHash}:${receipt.transactionHash}`, {
        receipt,
        path: relative(directory, path),
      });
  }
  if (!broadcast)
    throw new Error("Actual local bootstrap broadcast receipts are missing");
  for (const { receipt, path } of receiptMap.values()) {
    const inner = parseEventLogs({
      abi: iSafeAbi,
      logs: receipt.logs,
      eventName: ["ExecutionSuccess", "ExecutionFailure"],
    }).filter(
      (log) => log.address.toLowerCase() === bootstrap.safe.toLowerCase(),
    );
    receipts.push({
      hash: receipt.transactionHash,
      blockHash: receipt.blockHash,
      blockNumber: String(BigInt(receipt.blockNumber)),
      chainId: 31337,
      from: receipt.from,
      to: receipt.to,
      status:
        receipt.status === "0x1" || receipt.status === "success"
          ? "success"
          : "reverted",
      kind: path,
      evidenceClass: path.includes("/branches/")
        ? "browser"
        : path.includes("vesting") || path.includes("sweep")
          ? "simulated-participation"
          : "authentic-fork",
      decodedEvidence: path,
      safeInnerOutcome: inner[0]?.eventName ?? "not-safe",
    });
  }
  const launchReceipt = broadcast.receipts.find((receipt) =>
    parseEventLogs({
      abi: iPonsLaunchFactoryAbi,
      eventName: "TokenLaunched",
      logs: receipt.logs,
    }).some(
      (event) =>
        event.args.token.toLowerCase() ===
        bootstrap.protocolToken.toLowerCase(),
    ),
  );
  if (!launchReceipt) throw new Error("Fresh token launch receipt missing");
  const launchTransaction = broadcast.transactions.find(
    (tx) => tx.hash === launchReceipt.transactionHash,
  );
  const data =
    launchTransaction?.transaction.input ?? launchTransaction?.transaction.data;
  if (!data) throw new Error("Launch transaction input missing");
  const decoded = decodeFunctionData({ abi: iPonsLaunchFactoryAbi, data });
  if (decoded.functionName !== "launchToken")
    throw new Error("Unexpected launch entrypoint");
  const params = decoded.args[0];
  const purchaseReceipt = broadcast.receipts.find(
    (receipt) => receipt.to?.toLowerCase() === bootstrap.curve.toLowerCase(),
  );
  const safeReceipt = broadcast.receipts.find(
    (receipt) =>
      receipt.to?.toLowerCase() ===
      "0x14f2982d601c9458f93bd70b218933a6f8165e7b",
  );
  if (!purchaseReceipt || !safeReceipt)
    throw new Error(
      "Launch purchase or canonical Safe deployment receipt missing",
    );
  const deployments = [];
  const measuredDeployments = [];
  const executor = await client.readContract({
    address: bootstrap.buybackVault,
    abi: protocolBuybackVaultAbi,
    functionName: "executor",
  });
  for (const role of [
    "safe",
    "protocolToken",
    "curve",
    "factory",
    "buybackVault",
    "executor",
    "mediaStoreFactory",
    "renderer",
    "previewHarness",
  ]) {
    const address = (
      role === "executor" ? executor : bootstrap[role]
    ) as Address;
    const transaction = broadcast.transactions.find(
      (tx) => tx.contractAddress?.toLowerCase() === address.toLowerCase(),
    );
    const hash =
      role === "safe"
        ? safeReceipt.transactionHash
        : role === "protocolToken" || role === "curve"
          ? launchReceipt.transactionHash
          : role === "buybackVault" || role === "executor"
            ? broadcast.transactions.find(
                (tx) =>
                  tx.contractAddress?.toLowerCase() ===
                  bootstrap.factory.toLowerCase(),
              )?.hash
            : transaction?.hash;
    const code = await client.getCode({ address });
    if (!code || !hash) throw new Error(`Deployment proof missing: ${role}`);
    deployments.push({
      role,
      address,
      runtimeCodeHash: keccak256(code),
      receipt: hash,
    });
    measuredDeployments.push({
      role,
      address,
      runtimeBytes: (code.length - 2) / 2,
      creatingTransaction: hash,
    });
  }
  const measuredTransactions = [];
  for (const receipt of broadcast.receipts) {
    const tx = await client.getTransaction({ hash: receipt.transactionHash });
    if (tx.type !== "legacy" || !tx.r || !tx.s || tx.v === undefined)
      throw new Error(
        "Bootstrap measurements require the actual signed legacy transaction",
      );
    const serialized = serializeTransaction(
      {
        type: "legacy",
        chainId: 31337,
        nonce: tx.nonce,
        gas: tx.gas,
        gasPrice: tx.gasPrice,
        to: tx.to ?? undefined,
        value: tx.value,
        data: tx.input,
      },
      { r: tx.r, s: tx.s, v: tx.v },
    );
    if (keccak256(serialized) !== receipt.transactionHash)
      throw new Error(
        "Serialized bootstrap transaction does not match its mined hash",
      );
    measuredTransactions.push({
      hash: receipt.transactionHash,
      calldataBytes: (tx.input.length - 2) / 2,
      serializedBytes: (serialized.length - 2) / 2,
      gasUsed: String(
        BigInt((receipt as Receipt & { gasUsed: string }).gasUsed),
      ),
      createsContract: tx.to === null,
    });
  }
  await writeFile(
    resolve(directory, "deployment-measurements.json"),
    json({
      deployments: measuredDeployments,
      transactions: measuredTransactions,
    }),
  );
  const checkpoint = await read("checkpoint.json");
  const assets = [];
  const assetRows = [
    { asset: fixture.assets.usdg, kind: "usdg", amount: fixture.purchasedUSDG },
    { asset: fixture.assets.amd, kind: "stock", amount: fixture.purchasedAMD },
    { asset: fixture.assets.weth, kind: "non-stock" },
    { asset: bootstrap.protocolToken, kind: "protocol-token" },
  ];
  const unroutedPath = "browser/scenarios/unrouted-authentic-asset.json";
  const unrouted = files.includes(resolve(directory, unroutedPath))
    ? await read(unroutedPath)
    : undefined;
  if (unrouted)
    assetRows.push({
      asset: unrouted.asset,
      kind: "illiquid",
      amount: unrouted.acquiredAmount,
    });
  for (const row of assetRows) {
    const scenarioPath =
      row.kind === "non-stock"
        ? "browser/scenarios/asset-burn-refund-WETH.json"
        : row.kind === "illiquid"
          ? unroutedPath
          : row.kind === "protocol-token"
            ? "browser/scenarios/wallet-direct-burn-refund.json"
            : "fixture.json";
    const source = await read(scenarioPath);
    let candidates = [...receiptMap.values()].filter(
      (item) =>
        item.receipt.status === "success" || item.receipt.status === "0x1",
    );
    if (row.kind === "non-stock")
      candidates = candidates.filter(
        (item) =>
          item.path === scenarioPath &&
          item.receipt.to?.toLowerCase() === row.asset.toLowerCase(),
      );
    else if (row.kind === "protocol-token")
      candidates = candidates.filter(
        (item) =>
          item.receipt.transactionHash === purchaseReceipt.transactionHash,
      );
    else if (row.kind === "illiquid")
      candidates = candidates.filter(
        (item) => item.receipt.transactionHash === unrouted.purchaseReceipt,
      );
    else
      candidates = candidates.filter(
        (item) =>
          item.path.startsWith("fixture-transactions/") &&
          item.receipt.logs.some(
            (log) => log.address.toLowerCase() === row.asset.toLowerCase(),
          ),
      );
    const acquired = candidates.find(
      (item) => acquiredAmount(item.receipt, row.asset) > 0n,
    );
    if (!acquired)
      throw new Error(`Asset acquisition proof missing: ${row.kind}`);
    const observedAmount = acquiredAmount(acquired.receipt, row.asset);
    const expectedAmount = BigInt(
      row.kind === "protocol-token"
        ? bootstrap.developerTokensPurchased
        : (row.amount ?? source.gross),
    );
    if (observedAmount !== expectedAmount)
      throw new Error(`Asset acquisition amount mismatch: ${row.kind}`);
    let symbol: string, decimals: number;
    if (row.kind === "illiquid") {
      symbol = unrouted.symbol;
      decimals = unrouted.decimals;
    } else {
      [symbol, decimals] = await Promise.all([
        client.readContract({
          address: row.asset,
          abi: erc20Abi,
          functionName: "symbol",
        }),
        client.readContract({
          address: row.asset,
          abi: erc20Abi,
          functionName: "decimals",
        }),
      ]);
    }
    assets.push({
      address: row.asset,
      kind: row.kind,
      symbol,
      decimals,
      displayMultiplier: "1000000000000000000",
      acquisition: {
        method: row.kind === "non-stock" ? "native-wrap" : "trade",
        account: acquired.receipt.from,
        amountRaw: String(observedAmount),
        receipt: acquired.receipt.transactionHash,
        evidence: acquired.path,
      },
      routeEvidence:
        row.kind === "stock"
          ? "browser/scenarios/asset-burn-refund-AMD.json"
          : row.kind === "usdg"
            ? "browser/scenarios/runner-replacement.json"
            : scenarioPath,
      policyEvidence: scenarioPath,
    });
  }
  const manifest = {
    schemaVersion: 1,
    runId: bootstrap.runId,
    mode: "run",
    status: "running",
    source: preflight.source,
    tools: ["forge", "anvil", "bun"].map((name) => ({
      name,
      version: execFileSync(name, ["--version"], { encoding: "utf8" }).trim(),
    })),
    dependencies,
    origin: inputs.origin,
    execution: { chainId: 31337, rpcUrl },
    safe: {
      address: bootstrap.safe,
      owners: bootstrap.safeOwners,
      threshold: 2,
      singleton: "0xEdd160fEBBD92E350D4D398fb636302fccd67C7e",
      proxyFactory: "0x14F2982D601c9458F93bd70B218933A6f8165e7b",
      deploymentReceipt: safeReceipt.transactionHash,
    },
    deployments,
    launch: {
      factory: bootstrap.ponsFactory,
      token: bootstrap.protocolToken,
      curve: bootstrap.curve,
      developer: bootstrap.developer,
      creatorFeeRecipient: params.creatorFeeRecipient,
      pairToken: decoded.args[2],
      preset: String(decoded.args[1]),
      expectedEconomics: params.expectedEconomics,
      launchFeeWei: bootstrap.launchFeeWei,
      developerPurchaseWei: bootstrap.developerPurchaseWei,
      developerTokensReceived: bootstrap.developerTokensPurchased,
      buybackEnabled: params.buybackEnabled,
      creatorTaxBps: params.creatorTaxBps,
      launchReceipt: launchReceipt.transactionHash,
      purchaseReceipt: purchaseReceipt.transactionHash,
      roleMap: [
        {
          role: "external-owner",
          address: checkpoint.after.data.externalOwner,
          authority:
            "Pons administration as disclosed in source and fault tests",
        },
        {
          role: "external-sweep-operator",
          address: checkpoint.after.data.sweepOperator,
          authority:
            "Simulated participation for native fee conversion only; BBF runner has no operator key",
        },
        {
          role: "membership-configuration",
          address: bootstrap.safe,
          authority:
            "Threshold Safe configures routes, tokens, bounds and pauses; cannot withdraw fee inventory",
        },
      ],
    },
    assets,
    funding: [
      {
        role: "deployer",
        account: bootstrap.developer,
        amountWei: String(20n * 10n ** 18n),
        method: "local-test-eth",
        evidence: "bootstrap.json",
      },
      ...fixture.accounts.map((account: Address) => ({
        role: "member",
        account,
        amountWei: String(100n * 10n ** 18n),
        method: "local-test-eth",
        evidence: "fixture.json",
      })),
    ],
    receipts,
    gates: Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [`G${i + 1}`, pending()]),
    ),
    acceptance: Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [
        `SC-${String(i + 1).padStart(3, "0")}`,
        pending(),
      ]),
    ),
    scenarios: [],
  };
  const schema = JSON.parse(
    await readFile(
      resolve(root, "scripts/protocol-fork/manifest.schema.json"),
      "utf8",
    ),
  );
  const validate = new Ajv({ allErrors: true, strict: true }).compile(schema);
  if (!validate(manifest))
    throw new Error(
      `Exported manifest is invalid: ${JSON.stringify(validate.errors)}`,
    );
  await writeFile(resolve(directory, "manifest.json"), json(manifest));
  await writeFile(
    resolve(directory, "source-at-export.json"),
    json(await captureSourceSnapshot()),
  );
  const index = [];
  for (const path of await publicFiles(directory)) {
    if (
      path.endsWith("/artifacts.json") ||
      path.endsWith("/lifecycle.json") ||
      path.endsWith("/manifest.json") ||
      /\/(?:anvil|web|export-evidence|verify-evidence)\.log$/.test(path)
    )
      continue;
    const data = await readFile(path);
    index.push({
      path: relative(directory, path),
      bytes: data.length,
      sha256: sha(data),
    });
  }
  await writeFile(resolve(directory, "artifacts.json"), json(index));
  return manifest;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  exportEvidence(process.argv[2])
    .then((manifest) =>
      console.log(
        `Exported ${manifest.receipts.length} receipt records; independent acceptance remains pending`,
      ),
    )
    .catch((error) => {
      console.error(
        String(error).replace(
          process.env.BBF_FORK_RPC_URL ?? "<unset>",
          "[PRIVATE_ORIGIN_RPC]",
        ),
      );
      process.exitCode = 1;
    });
