import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareRuntime,
  exactLibraryRuntime,
  type ImmutableReferences,
} from "./verify-runtime";
import type { verifyProtocolGraph } from "./verify-protocol-graph";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(resolve(root, "web/package.json"));
const {
  keccak256,
  getCreate2Address,
  stringToHex,
  encodeAbiParameters,
  concatHex,
}: typeof import("../../web/node_modules/viem") = require("viem");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");

/** Recheck retained protocol bytes offline; raw store data never uses metadata masking. */
export function verifyRetainedProtocolSources(
  proof: Awaited<ReturnType<typeof verifyProtocolGraph>>,
) {
  if (proof.schemaVersion !== 3)
    throw new Error("Invalid protocol graph proof");
  if (
    !Array.isArray(proof.minimumPayments) ||
    proof.minimumPayments.some(
      (item) =>
        BigInt(item.minimum) <= 0n || BigInt(item.minimum) >= 1n << 112n,
    )
  )
    throw new Error("Invalid retained minimum payments");
  const ledgerSalt = keccak256(stringToHex("Backed By Fans vesting ledger v1"));
  const ledgerAddress = getCreate2Address({
    from: "0x4e59b44847b379578588920cA78FbF26c0B4956C",
    salt: ledgerSalt,
    bytecodeHash: keccak256(proof.library.initCode),
  });
  if (
    ledgerAddress.toLowerCase() !== proof.library.address.toLowerCase() ||
    proof.library.salt !== ledgerSalt
  )
    throw new Error("Retained library deployment identity differs");
  if (
    proof.executorCodeStore.runtime !==
      `0x00${proof.executorCodeStore.creationCode.slice(2)}` ||
    keccak256(proof.executorCodeStore.runtime) !==
      proof.executorCodeStore.runtimeCodeHash
  )
    throw new Error("Retained executor code store differs");
  if (keccak256(proof.tierCreationCode) !== proof.creationCodeHash)
    throw new Error("Tier creation source hash differs");
  if (
    proof.tierLibraries[
      "src/libraries/VestingLedger.sol:VestingLedger"
    ].toLowerCase() !== proof.library.address.toLowerCase()
  )
    throw new Error("Retained library link differs");
  if (
    exactLibraryRuntime(
      proof.library.runtimeTemplate,
      proof.library.address,
    ).toLowerCase() !== proof.library.runtime?.toLowerCase()
  )
    throw new Error("Retained library source differs");
  if (
    keccak256(proof.library.runtime as `0x${string}`) !==
    proof.library.runtimeCodeHash
  )
    throw new Error("Retained library runtime hash differs");
  const implementation = proof.implementation;
  const salt = keccak256(stringToHex("Backed By Fans tier implementation v1"));
  if (
    implementation.salt !== salt ||
    implementation.initCode !== proof.tierCreationCode ||
    getCreate2Address({
      from: "0x4e59b44847b379578588920cA78FbF26c0B4956C",
      salt,
      bytecodeHash: proof.creationCodeHash,
    }).toLowerCase() !== implementation.address.toLowerCase()
  )
    throw new Error("Retained implementation identity differs");
  const implementationRecord = proof.records.find(
    (record) => record.role === "tierImplementation",
  );
  if (
    !implementationRecord ||
    implementationRecord.address.toLowerCase() !==
      implementation.address.toLowerCase()
  )
    throw new Error("Retained implementation source address differs");
  const roles = new Set(proof.records.map((record) => record.role));
  for (const role of [
    "factory",
    "tierImplementation",
    "buybackVault",
    "burnRouter",
    "mediaStoreFactory",
    "renderer",
    "previewHarness",
  ]) {
    if (!roles.has(role as (typeof proof.records)[number]["role"]))
      throw new Error(`Missing protocol source: ${role}`);
  }
  for (const record of proof.records) {
    const result = compareRuntime(
      record.compiled.object,
      record.code,
      record.compiled.immutableReferences ?? {},
    );
    if (!result.exact)
      throw new Error(`${record.role}: retained protocol metadata differs`);
  }
}

// Offline reproduction: runtime-record contains code read at the pinned origin,
// never RPC credentials. Preflight subsequently compares these locks to the live
// archive again. Compiler binaries must match the retained official artifact hash.
async function main() {
  const [compilerDir, runtimePath, outputPath] = process.argv.slice(2);
  if (!compilerDir || !runtimePath || !outputPath)
    throw new Error(
      "Usage: verify-sources.ts COMPILER_DIR PINNED_RUNTIME_JSON OUTPUT_JSON",
    );
  const manifestPath = resolve(
    root,
    "contracts/external/verification/4663/sources.json",
  );
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString());
  const runtimes = JSON.parse(await readFile(runtimePath, "utf8"));
  const runtimeLocks: Record<string, unknown> = {};
  for (const [role, record] of Object.entries(manifest.records) as Array<
    [
      string,
      {
        address: string;
        compilerInputPath: string;
        compilerInputSha256: string;
        compilerVersion: string;
        compilerArtifact: { sha256: string };
        target: string;
      },
    ]
  >) {
    const input = await readFile(resolve(root, record.compilerInputPath));
    if (sha256(input) !== record.compilerInputSha256)
      throw new Error(`${role}: compiler input hash differs`);
    const compiler = resolve(
      compilerDir,
      `solc-${record.compilerVersion.split("+")[0]}`,
    );
    const compilerSha256 = sha256(await readFile(compiler));
    if (`0x${compilerSha256}` !== record.compilerArtifact.sha256)
      throw new Error(`${role}: compiler binary hash differs`);
    const version = execFileSync(compiler, ["--version"], { encoding: "utf8" });
    if (!version.includes(record.compilerVersion))
      throw new Error(`${role}: compiler version differs`);
    const parsed = JSON.parse(input.toString());
    parsed.settings.outputSelection = {
      "*": { "*": ["evm.deployedBytecode"], "": ["ast"] },
    };
    const compiled = JSON.parse(
      execFileSync(compiler, ["--standard-json"], {
        input: JSON.stringify(parsed),
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      }),
    );
    const errors = (compiled.errors ?? []).filter(
      (error: { severity: string }) => error.severity === "error",
    );
    if (errors.length)
      throw new Error(
        `${role}: independent compilation failed: ${JSON.stringify(errors)}`,
      );
    const separator = record.target.lastIndexOf(":");
    const target = compiled.contracts[record.target.slice(0, separator)][
      record.target.slice(separator + 1)
    ].evm.deployedBytecode as {
      object: string;
      immutableReferences?: ImmutableReferences;
    };
    const runtime = runtimes[role];
    if (runtime?.address.toLowerCase() !== record.address.toLowerCase())
      throw new Error(`${role}: origin address differs`);
    const comparison = compareRuntime(
      target.object,
      runtime.code,
      target.immutableReferences ?? {},
    );
    runtimeLocks[role] = {
      ...record,
      runtimeCodeHash: keccak256(runtime.code),
      independentlyCompiled: true,
      compilerSha256,
      compiledRuntime: `0x${target.object}`,
      immutableReferences: target.immutableReferences ?? {},
      ...comparison,
    };
    process.stdout.write(
      `${role}: ${comparison.exact ? "exact runtime" : "runtime matches; metadata differs"}\n`,
    );
  }
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        origin: manifest.origin,
        sourceManifestSha256: sha256(manifestBytes),
        runtimeLocks,
      },
      null,
      2,
    ) + "\n",
  );
}

if (import.meta.main)
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Source verification failed"}\n`,
    );
    process.exitCode = 1;
  });
