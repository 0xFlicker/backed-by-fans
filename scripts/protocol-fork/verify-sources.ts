import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compareRuntime, type ImmutableReferences } from "./verify-runtime";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(resolve(root, "web/package.json"));
const {
  keccak256,
}: typeof import("../../web/node_modules/viem") = require("viem");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");

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
