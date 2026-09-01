import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { randomInt } from "node:crypto";

export const CANONICAL_CHAIN_ID = 46_630;
export const CANONICAL_CREATE2_DEPLOYER =
  "0x4e59b44847b379578588920cA78FbF26c0B4956C";
export const DEFAULT_INTERFACE_SCHEMA =
  "0xfed0707e5f6edd2453280da0318c42550633f3b8bcb13fee8818ae2d70294ab4";
export const MAX_RUNTIME_BYTES = 88_000;
export const MAX_INITCODE_BYTES = 176_000;
export const MAX_RAW_CREATE2_BYTES = 95_000;

const SKILL_REFERENCE = ".agents/skills/backed-by-fans-renderer/SKILL.md";
const LLMS_REFERENCE = ".agents/skills/backed-by-fans-renderer/llms.txt";
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
const LOCAL_TRACE_CALLER = "0x000000000000000000000000000000000000b0bf";

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
  formatVersion: 1;
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
    create2Deployer: typeof CANONICAL_CREATE2_DEPLOYER;
    salt: Hex;
    initCodeHash: Hex;
    predictedAddress: Hex;
    rawByteLength: number;
  };
  examples: RendererPackageExample[];
  skill: string;
  llms: string;
};

type BuildRendererPackageOptions = {
  artifact: FoundryRendererArtifact;
  constructorArgs?: string;
  finalRuntimeBytecode: string;
  rendererName?: string;
  salt?: string;
  sourceRoot: string;
};

export type LocalAnvil = {
  process: Bun.Subprocess;
  rpcUrl: string;
};

type StateOverride = {
  code?: Hex;
  stateDiff?: Record<string, Hex>;
};

export type SimulatedRendererDeployment = {
  runtimeBytecode: Hex;
  stateOverrides: Record<string, StateOverride>;
};

type CliOptions = {
  sourceRoot: string;
  artifactPath?: string;
  constructorArgs?: string;
  outputPath?: string;
  rendererName?: string;
  salt?: string;
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

export async function startLocalAnvil(): Promise<LocalAnvil> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const port = randomInt(HIGH_PORT_MIN, HIGH_PORT_MAX + 1);
    const local = {
      rpcUrl: `http://${LOOPBACK_HOST}:${port}`,
      process: Bun.spawn(
        [
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
          "--disable-code-size-limit",
        ],
        { stderr: "pipe", stdout: "ignore" },
      ),
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

function tracePostValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;
  const change = value as Record<string, unknown>;
  if (typeof change["+"] === "string") return change["+"];
  if (change["-"] !== undefined) return `0x${"00".repeat(32)}`;
  const replacement = change["*"];
  if (replacement && typeof replacement === "object") {
    const to = (replacement as Record<string, unknown>).to;
    if (typeof to === "string") return to;
  }
  return undefined;
}

export async function simulateRendererDeployment(
  local: LocalAnvil,
  deployment: {
    creationBytecode: string;
    predictedAddress: string;
    salt: string;
  },
): Promise<SimulatedRendererDeployment> {
  const creationBytecode = normalizeHex(
    deployment.creationBytecode,
    "Final renderer initcode",
  );
  const salt = normalizeBytes32(deployment.salt, "CREATE2 salt");
  if (!/^0x[0-9a-fA-F]{40}$/.test(deployment.predictedAddress)) {
    throw new Error("Predicted CREATE2 address is invalid.");
  }
  const trace = (await anvilRpc(local.rpcUrl, "debug_traceCall", [
    {
      data: concatenateHex(salt, creationBytecode),
      from: LOCAL_TRACE_CALLER,
      gas: "0x3b9aca00",
      to: CANONICAL_CREATE2_DEPLOYER,
    },
    "latest",
    { tracer: "prestateTracer", tracerConfig: { diffMode: true } },
  ])) as { post?: Record<string, Record<string, unknown>> };
  if (!trace.post) {
    throw new Error("Local CREATE2 simulation returned no post-state.");
  }

  const stateOverrides: Record<string, StateOverride> = {};
  for (const [address, account] of Object.entries(trace.post)) {
    const code = tracePostValue(account.code);
    const storageEntries = Object.entries(
      (account.storage as Record<string, unknown> | undefined) ?? {},
    ).flatMap(([slot, change]) => {
      const value = tracePostValue(change);
      return value
        ? [[slot, normalizeHex(value, "Simulated storage value")]]
        : [];
    });
    if (code || storageEntries.length > 0) {
      stateOverrides[address.toLowerCase()] = {
        ...(code ? { code: normalizeHex(code, "Simulated account code") } : {}),
        ...(storageEntries.length > 0
          ? { stateDiff: Object.fromEntries(storageEntries) }
          : {}),
      };
    }
  }

  const rendererState =
    stateOverrides[deployment.predictedAddress.toLowerCase()];
  if (!rendererState?.code || rendererState.code === "0x") {
    throw new Error(
      "Local CREATE2 simulation produced no runtime at the predicted address.",
    );
  }
  return { runtimeBytecode: rendererState.code, stateOverrides };
}

function keccakBytes(value: Hex): Hex {
  return normalizeBytes32(
    commandOutput(["cast", "keccak", value]),
    "Keccak hash",
  );
}

function keccakText(value: string): Hex {
  return normalizeBytes32(
    commandOutput(["cast", "keccak", value]),
    "Keccak hash",
  );
}

function create2Deployment(creationBytecode: Hex, requestedSalt?: string) {
  const initCodeHash = keccakBytes(creationBytecode);
  const salt = normalizeBytes32(
    requestedSalt ?? keccakText(`BackedByFans.RendererSalt.v1:${initCodeHash}`),
    "CREATE2 salt",
  );
  const rawByteLength = 32 + byteLength(creationBytecode);
  if (rawByteLength >= MAX_RAW_CREATE2_BYTES) {
    throw new Error(
      `Raw salt || initcode is ${rawByteLength} bytes; Robinhood Nitro requires fewer than ${MAX_RAW_CREATE2_BYTES}.`,
    );
  }
  const predictedAddress = commandOutput([
    "cast",
    "create2",
    "--deployer",
    CANONICAL_CREATE2_DEPLOYER,
    "--salt",
    salt,
    "--init-code-hash",
    initCodeHash,
  ]) as Hex;
  if (!/^0x[0-9a-fA-F]{40}$/.test(predictedAddress)) {
    throw new Error("Foundry returned an invalid predicted CREATE2 address.");
  }
  return { initCodeHash, predictedAddress, rawByteLength, salt };
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

export function representativeRendererExamples(): RendererPackageExample[] {
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
          tierName: "Renderer Gallery",
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
  const { initCodeHash, predictedAddress, rawByteLength, salt } =
    create2Deployment(creationBytecode, options.salt);
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
    formatVersion: 1,
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
      create2Deployer: CANONICAL_CREATE2_DEPLOYER,
      salt,
      initCodeHash,
      predictedAddress,
      rawByteLength,
    },
    examples: representativeRendererExamples(),
    skill: SKILL_REFERENCE,
    llms: LLMS_REFERENCE,
  };
}

function artifactImplementsRenderer(
  artifact: FoundryRendererArtifact,
): boolean {
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
      "Usage: bun build-package.ts <foundry-root> [--artifact path] [--constructor-args 0x...] [--salt 0x...] [--renderer-name name] [--output path]",
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
      case "--salt":
        options.salt = value;
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
  const deployment = create2Deployment(creationBytecode, options.salt);
  const local = await startLocalAnvil();
  let finalRuntimeBytecode: Hex;
  try {
    finalRuntimeBytecode = (
      await simulateRendererDeployment(local, {
        creationBytecode,
        predictedAddress: deployment.predictedAddress,
        salt: deployment.salt,
      })
    ).runtimeBytecode;
  } finally {
    local.process.kill();
    await local.process.exited;
  }
  const rendererPackage = buildRendererPackage({
    artifact,
    constructorArgs: options.constructorArgs,
    finalRuntimeBytecode,
    rendererName: options.rendererName,
    salt: deployment.salt,
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
