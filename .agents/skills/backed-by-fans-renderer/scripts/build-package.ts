import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { randomInt } from "node:crypto";

export const CANONICAL_CHAIN_ID = 46_630;
export const DEFAULT_INTERFACE_SCHEMA =
  "0xfed0707e5f6edd2453280da0318c42550633f3b8bcb13fee8818ae2d70294ab4";
export const MAX_RUNTIME_BYTES = 88_000;
// Preserves room for ABI and a conservatively large signed EIP-1559 envelope under Nitro's
// 95,000-byte transaction limit.
export const MAX_INITCODE_BYTES = 94_656;
export const LOCAL_ANVIL_BLOCK_GAS_LIMIT = 100_000_000;

const SKILL_REFERENCE = "SKILL.md";
const LLMS_REFERENCE = "llms.txt";
const ARTIFACT_FINGERPRINT_SIGNATURE =
  "f(bytes,bytes,string,string,bool,uint256,bytes32)";
const REQUIRED_RENDERER_METHODS = [
  "rendererSchema",
  "rendererName",
  "engineCount",
  "engineName",
  "validateConfiguration",
  "previewSVG",
  "previewTokenURI",
  "renderTokenURI",
] as const;
const LOOPBACK_HOST = "127.0.0.1";
const HIGH_PORT_MIN = 49_152;
const HIGH_PORT_MAX = 65_535;

type Hex = `0x${string}`;

type FoundryAbiEntry = {
  type?: string;
  name?: string;
  inputs?: unknown[];
};

export type FoundryRendererArtifact = {
  abi: FoundryAbiEntry[];
  bytecode: { object: string };
  deployedBytecode: { object: string };
  metadata: {
    compiler: { version: string };
    settings: {
      compilationTarget?: Record<string, string>;
      evmVersion?: string;
      optimizer?: { enabled?: boolean; runs?: number };
    };
  };
};

export type RendererPackageExample = {
  requestId: string;
  tokenId: 1 | 7 | 42;
  state: "active" | "expired";
  imageMode: "none" | "browser-slot";
  method: "previewSVG";
  contextWithoutMedia: {
    token: {
      tierName: string;
      description: string;
      externalURI: string;
      tierIdentity: Hex;
      art: {
        engine: number;
        collectionSeed: number;
        palette: number;
        intensity: number;
        density: number;
        symmetry: number;
        typographyScale: number;
        typographyStyle: number;
        textVisibility: number;
        imageFit: number;
        focalX: number;
        focalY: number;
        grain: number;
        mediaMix: number;
        primary: number;
        secondary: number;
        tertiary: number;
      };
      media: {
        mime: number;
        store: Hex;
        length: number;
        digest: Hex;
        runtimeCodehash: Hex;
      };
      tokenId: 1 | 7 | 42;
      expiration: number;
      active: boolean;
    };
  };
  localImageSlot: boolean;
};

export type RendererPackage = {
  formatVersion: 2;
  rendererName: string;
  interfaceSchema: Hex;
  compiler: {
    solidity: "0.8.36";
    evmVersion: "cancun";
    optimizerEnabled: true;
    optimizerRuns: number;
  };
  artifacts: {
    sourceRoot: string;
    abi: string;
    creationBytecode: Hex;
    runtimeBytecode: Hex;
    artifactFingerprint: Hex;
    creationByteLength: number;
    runtimeByteLength: number;
  };
  deployment: {
    chainId: typeof CANONICAL_CHAIN_ID;
    initCodeByteLength: number;
  };
  examples: RendererPackageExample[];
  skill: string;
  llms: string;
};

type BuildRendererPackageOptions = {
  artifact: FoundryRendererArtifact;
  constructorArgs?: string;
  finalRuntimeBytecode: string;
  membershipName?: string;
  rendererName?: string;
  sourceRoot: string;
};

export type LocalAnvil = {
  process: Bun.Subprocess;
  rpcUrl: string;
};

export type SimulatedRendererDeployment = {
  rendererAddress: Hex;
  runtimeBytecode: Hex;
};

export type AnvilRpcRequest = (
  rpcUrl: string,
  method: string,
  params: unknown[],
) => Promise<unknown>;

type CliOptions = {
  sourceRoot: string;
  artifactPath?: string;
  constructorArgs?: string;
  membershipName?: string;
  outputPath?: string;
  rendererName?: string;
};

function commandOutput(command: string[]): string {
  const result = Bun.spawnSync(command, {
    stderr: "pipe",
    stdout: "pipe",
  });
  if (result.exitCode !== 0) {
    const detail = new TextDecoder().decode(result.stderr).trim();
    throw new Error(
      `${command[0]} failed${detail ? `: ${detail}` : ` with exit ${result.exitCode}`}`,
    );
  }
  return new TextDecoder().decode(result.stdout).trim();
}

export async function anvilRpc(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) {
    throw new Error(`Local Anvil RPC returned HTTP ${response.status}.`);
  }
  const payload = (await response.json()) as {
    error?: { code?: number; message?: string };
    result?: unknown;
  };
  if (payload.error) {
    throw new Error(
      payload.error.message ?? `Local Anvil RPC error ${payload.error.code}.`,
    );
  }
  return payload.result;
}

async function waitForAnvil(local: LocalAnvil): Promise<boolean> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (local.process.exitCode !== null) return false;
    try {
      await anvilRpc(local.rpcUrl, "eth_chainId", []);
      return true;
    } catch {
      await Bun.sleep(25);
    }
  }
  return false;
}

export function localAnvilCommand(port: number): string[] {
  return [
    "anvil",
    "--host",
    LOOPBACK_HOST,
    "--port",
    String(port),
    "--hardfork",
    "cancun",
    "--chain-id",
    String(CANONICAL_CHAIN_ID),
    "--timestamp",
    "1800000000",
    "--gas-limit",
    String(LOCAL_ANVIL_BLOCK_GAS_LIMIT),
    "--disable-code-size-limit",
  ];
}

export async function startLocalAnvil(): Promise<LocalAnvil> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const port = randomInt(HIGH_PORT_MIN, HIGH_PORT_MAX + 1);
    const local = {
      rpcUrl: `http://${LOOPBACK_HOST}:${port}`,
      process: Bun.spawn(localAnvilCommand(port), {
        stderr: "pipe",
        stdout: "ignore",
      }),
    };
    if (await waitForAnvil(local)) return local;
    local.process.kill();
    await local.process.exited;
  }
  throw new Error("Could not start a loopback-only local Anvil instance.");
}

async function executeFinalInitcode(creationBytecode: Hex): Promise<Hex> {
  const local = await startLocalAnvil();
  try {
    const runtime = await anvilRpc(local.rpcUrl, "eth_call", [
      { data: creationBytecode },
      "latest",
    ]);
    if (typeof runtime !== "string" || runtime === "0x") {
      throw new Error(
        "The complete renderer initcode did not return runtime bytecode.",
      );
    }
    return normalizeHex(runtime, "Final renderer runtime bytecode");
  } finally {
    local.process.kill();
    await local.process.exited;
  }
}

function normalizeHex(value: string, label: string): Hex {
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(normalized)) {
    throw new Error(`${label} must be complete hexadecimal bytes.`);
  }
  return normalized.toLowerCase() as Hex;
}

function normalizeBytes32(value: string, label: string): Hex {
  const normalized = normalizeHex(value, label);
  if (normalized.length !== 66) {
    throw new Error(`${label} must contain exactly 32 bytes.`);
  }
  return normalized;
}

function byteLength(value: Hex): number {
  return (value.length - 2) / 2;
}

function concatenateHex(first: Hex, second: Hex): Hex {
  return `${first}${second.slice(2)}` as Hex;
}

export async function simulateRendererDeployment(
  local: LocalAnvil,
  creationBytecodeInput: string,
  rpc: AnvilRpcRequest = anvilRpc,
): Promise<SimulatedRendererDeployment> {
  const creationBytecode = normalizeHex(
    creationBytecodeInput,
    "Final renderer initcode",
  );
  const accounts = await rpc(local.rpcUrl, "eth_accounts", []);
  const deployer = Array.isArray(accounts) ? accounts[0] : undefined;
  if (typeof deployer !== "string") {
    throw new Error("Local Anvil returned no unlocked deployment account.");
  }
  const transaction = { data: creationBytecode, from: deployer };
  const estimatedGas = await rpc(local.rpcUrl, "eth_estimateGas", [transaction]);
  if (
    typeof estimatedGas !== "string" ||
    !/^0x[0-9a-fA-F]+$/.test(estimatedGas) ||
    BigInt(estimatedGas) === 0n
  ) {
    throw new Error("Local renderer deployment returned no valid gas estimate.");
  }
  const transactionHash = await rpc(local.rpcUrl, "eth_sendTransaction", [
    { ...transaction, gas: estimatedGas },
  ]);
  if (typeof transactionHash !== "string") {
    throw new Error("Local renderer deployment returned no transaction hash.");
  }
  let rendererAddress: unknown;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const receipt = (await rpc(local.rpcUrl, "eth_getTransactionReceipt", [
      transactionHash,
    ])) as { contractAddress?: unknown; status?: unknown } | null;
    if (receipt) {
      if (receipt.status !== "0x1" || typeof receipt.contractAddress !== "string") {
        throw new Error("Local renderer deployment reverted.");
      }
      rendererAddress = receipt.contractAddress;
      break;
    }
    await Bun.sleep(25);
  }
  if (typeof rendererAddress !== "string") {
    throw new Error("Local renderer deployment receipt did not arrive.");
  }
  const runtimeBytecode = normalizeHex(
    await rpc(local.rpcUrl, "eth_getCode", [rendererAddress, "latest"]),
    "Local renderer runtime bytecode",
  );
  if (runtimeBytecode === "0x") {
    throw new Error("Local renderer deployment produced no runtime code.");
  }
  return {
    rendererAddress: rendererAddress as Hex,
    runtimeBytecode,
  };
}

function keccakBytes(value: Hex): Hex {
  return normalizeBytes32(
    commandOutput(["cast", "keccak", value]),
    "Keccak hash",
  );
}

function artifactContractName(artifact: FoundryRendererArtifact): string {
  const targets = Object.values(
    artifact.metadata.settings.compilationTarget ?? {},
  );
  if (targets.length !== 1 || !targets[0]) {
    throw new Error(
      "The Foundry artifact must identify exactly one compilation target.",
    );
  }
  return targets[0];
}

function compilerProfile(artifact: FoundryRendererArtifact) {
  const version = artifact.metadata.compiler.version.split("+")[0];
  const optimizer = artifact.metadata.settings.optimizer;
  if (
    version !== "0.8.36" ||
    artifact.metadata.settings.evmVersion !== "cancun" ||
    optimizer?.enabled !== true ||
    !Number.isInteger(optimizer.runs) ||
    (optimizer.runs ?? 0) < 1
  ) {
    throw new Error(
      "Renderer artifacts must use Solidity 0.8.36, Cancun, and an enabled optimizer with at least one run.",
    );
  }
  return {
    solidity: "0.8.36" as const,
    evmVersion: "cancun" as const,
    optimizerEnabled: true as const,
    optimizerRuns: optimizer.runs!,
  };
}

function completeCreationBytecode(
  artifact: FoundryRendererArtifact,
  constructorArgs?: string,
): Hex {
  const constructor = artifact.abi.find(
    (entry) => entry.type === "constructor",
  );
  if ((constructor?.inputs?.length ?? 0) > 0 && constructorArgs === undefined) {
    throw new Error(
      "This renderer has constructor inputs; pass their complete ABI-encoded bytes with --constructor-args.",
    );
  }
  return concatenateHex(
    normalizeHex(artifact.bytecode.object, "Artifact creation bytecode"),
    normalizeHex(constructorArgs ?? "0x", "Constructor arguments"),
  );
}

function packageSourceRoot(sourceRoot: string): string {
  if (!isAbsolute(sourceRoot)) return sourceRoot.replaceAll("\\", "/");
  const fromWorkingDirectory = relative(process.cwd(), sourceRoot);
  return (
    fromWorkingDirectory.startsWith("..")
      ? sourceRoot
      : fromWorkingDirectory || "."
  ).replaceAll("\\", "/");
}

export function representativeRendererExamples(
  membershipName = "Renderer Gallery",
): RendererPackageExample[] {
  const previewMembershipName = membershipName.trim();
  if (!previewMembershipName) {
    throw new Error("Preview membership name cannot be empty.");
  }
  const zeroHash = `0x${"00".repeat(32)}` as Hex;
  const zeroAddress = `0x${"00".repeat(20)}` as Hex;
  const matrix = [
    [1, "active", "none"],
    [1, "expired", "browser-slot"],
    [7, "active", "browser-slot"],
    [7, "expired", "none"],
    [42, "active", "none"],
    [42, "expired", "browser-slot"],
  ] as const;

  return matrix.map(([tokenId, state, imageMode]) => {
    const active = state === "active";
    return {
      requestId: `token-${tokenId}-${state}-${imageMode}`,
      tokenId,
      state,
      imageMode,
      method: "previewSVG",
      contextWithoutMedia: {
        token: {
          tierName: previewMembershipName,
          description: "Six representative membership states",
          externalURI: "",
          tierIdentity: DEFAULT_INTERFACE_SCHEMA as Hex,
          art: {
            engine: 0,
            collectionSeed: 46_630,
            palette: 2,
            intensity: 72,
            density: 58,
            symmetry: 40,
            typographyScale: 64,
            typographyStyle: 1,
            textVisibility: 1,
            imageFit: 0,
            focalX: 50,
            focalY: 50,
            grain: 24,
            mediaMix: 68,
            primary: 75,
            secondary: 42,
            tertiary: 18,
          },
          media: {
            mime: 0,
            store: zeroAddress,
            length: 0,
            digest: zeroHash,
            runtimeCodehash: zeroHash,
          },
          tokenId,
          expiration: active ? 2_000_000_000 : 1,
          active,
        },
      },
      localImageSlot: imageMode === "browser-slot",
    };
  });
}

export function buildRendererPackage(
  options: BuildRendererPackageOptions,
): RendererPackage {
  const compiler = compilerProfile(options.artifact);
  const creationBytecode = completeCreationBytecode(
    options.artifact,
    options.constructorArgs,
  );
  const runtimeBytecode = normalizeHex(
    options.finalRuntimeBytecode,
    "Final renderer runtime bytecode",
  );
  const interfaceSchema = DEFAULT_INTERFACE_SCHEMA as Hex;
  const creationByteLength = byteLength(creationBytecode);
  const runtimeByteLength = byteLength(runtimeBytecode);
  if (creationByteLength > MAX_INITCODE_BYTES) {
    throw new Error(
      `Final renderer initcode is ${creationByteLength} bytes; the project limit is ${MAX_INITCODE_BYTES}.`,
    );
  }
  if (runtimeByteLength > MAX_RUNTIME_BYTES) {
    throw new Error(
      `Renderer runtime is ${runtimeByteLength} bytes; the project limit is ${MAX_RUNTIME_BYTES}.`,
    );
  }

  const encodedFingerprint = normalizeHex(
    commandOutput([
      "cast",
      "abi-encode",
      ARTIFACT_FINGERPRINT_SIGNATURE,
      creationBytecode,
      runtimeBytecode,
      compiler.solidity,
      compiler.evmVersion,
      String(compiler.optimizerEnabled),
      String(compiler.optimizerRuns),
      interfaceSchema,
    ]),
    "Encoded artifact fingerprint",
  );
  const artifactFingerprint = keccakBytes(encodedFingerprint);
  const rendererName = (
    options.rendererName ?? artifactContractName(options.artifact)
  ).trim();
  const sourceRoot = packageSourceRoot(options.sourceRoot);
  const abi = JSON.stringify(options.artifact.abi);
  if (!rendererName || rendererName.length > 120) {
    throw new Error("Renderer name must contain between 1 and 120 characters.");
  }
  if (sourceRoot.length > 2_048) {
    throw new Error("Renderer source root exceeds the package schema limit.");
  }
  if (abi.length > 200_000) {
    throw new Error("Renderer ABI exceeds the package schema limit.");
  }

  return {
    formatVersion: 2,
    rendererName,
    interfaceSchema,
    compiler,
    artifacts: {
      sourceRoot,
      abi,
      creationBytecode,
      runtimeBytecode,
      artifactFingerprint,
      creationByteLength,
      runtimeByteLength,
    },
    deployment: {
      chainId: CANONICAL_CHAIN_ID,
      initCodeByteLength: creationByteLength,
    },
    examples: representativeRendererExamples(options.membershipName),
    skill: SKILL_REFERENCE,
    llms: LLMS_REFERENCE,
  };
}

function artifactImplementsRenderer(
  artifact: FoundryRendererArtifact,
): boolean {
  const creationBytecode = artifact.bytecode.object.replace(/^0x/, "");
  const runtimeBytecode = artifact.deployedBytecode.object.replace(/^0x/, "");
  if (creationBytecode.length === 0 || runtimeBytecode.length === 0) {
    return false;
  }
  const methods = new Set(
    artifact.abi
      .filter((entry) => entry.type === "function")
      .map((entry) => entry.name),
  );
  return REQUIRED_RENDERER_METHODS.every((method) => methods.has(method));
}

function jsonFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...jsonFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(path);
  }
  return files;
}

function readArtifact(path: string): FoundryRendererArtifact {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    throw new Error(`Could not read Foundry artifact ${path}.`, { cause });
  }
  const artifact = value as Partial<FoundryRendererArtifact>;
  if (
    !Array.isArray(artifact.abi) ||
    typeof artifact.bytecode?.object !== "string" ||
    typeof artifact.deployedBytecode?.object !== "string" ||
    typeof artifact.metadata?.compiler?.version !== "string" ||
    typeof artifact.metadata?.settings !== "object"
  ) {
    throw new Error(`${path} is not a complete Foundry contract artifact.`);
  }
  return artifact as FoundryRendererArtifact;
}

function findRendererArtifact(sourceRoot: string): string {
  const out = join(sourceRoot, "out");
  const candidates = jsonFiles(out)
    .sort()
    .filter((path) => {
      try {
        return artifactImplementsRenderer(readArtifact(path));
      } catch {
        return false;
      }
    });
  if (candidates.length !== 1) {
    throw new Error(
      `Expected exactly one complete membership renderer artifact, found ${candidates.length}. Pass --artifact when the project contains multiple renderers.`,
    );
  }
  return candidates[0]!;
}

function optionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

function parseCliOptions(args: string[]): CliOptions {
  const [sourceRootInput, ...rest] = args;
  if (!sourceRootInput || sourceRootInput.startsWith("--")) {
    throw new Error(
      "Usage: bun build-package.ts <foundry-root> [--artifact path] [--constructor-args 0x...] [--renderer-name name] [--membership-name name] [--output path]",
    );
  }
  const options: CliOptions = { sourceRoot: resolve(sourceRootInput) };
  for (let index = 0; index < rest.length; index += 2) {
    const option = rest[index]!;
    const value = optionValue(rest, index, option);
    switch (option) {
      case "--artifact":
        options.artifactPath = value;
        break;
      case "--constructor-args":
        options.constructorArgs = value;
        break;
      case "--output":
        options.outputPath = value;
        break;
      case "--renderer-name":
        options.rendererName = value;
        break;
      case "--membership-name":
        options.membershipName = value;
        break;
      default:
        throw new Error(`Unknown option: ${option}`);
    }
  }
  return options;
}

export async function runBuildPackageCli(args: string[]): Promise<string> {
  const options = parseCliOptions(args);
  commandOutput(["forge", "build", "--root", options.sourceRoot]);
  const artifactPath = options.artifactPath
    ? resolve(options.sourceRoot, options.artifactPath)
    : findRendererArtifact(options.sourceRoot);
  const artifact = readArtifact(artifactPath);
  const creationBytecode = completeCreationBytecode(
    artifact,
    options.constructorArgs,
  );
  const local = await startLocalAnvil();
  let finalRuntimeBytecode: Hex;
  try {
    finalRuntimeBytecode = (
      await simulateRendererDeployment(local, creationBytecode)
    ).runtimeBytecode;
  } finally {
    local.process.kill();
    await local.process.exited;
  }
  const rendererPackage = buildRendererPackage({
    artifact,
    constructorArgs: options.constructorArgs,
    finalRuntimeBytecode,
    membershipName: options.membershipName,
    rendererName: options.rendererName,
    sourceRoot: options.sourceRoot,
  });
  const outputPath = resolve(
    options.outputPath ?? join(options.sourceRoot, "renderer-package.json"),
  );
  const serialized = `${JSON.stringify(rendererPackage, null, 2)}\n`;
  if (new TextEncoder().encode(serialized).length > 1_000_000) {
    throw new Error("Renderer package exceeds the 1,000,000-byte limit.");
  }
  writeFileSync(outputPath, serialized);
  return outputPath;
}

if (import.meta.main) {
  try {
    const outputPath = await runBuildPackageCli(Bun.argv.slice(2));
    console.log(`Renderer package: ${outputPath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
