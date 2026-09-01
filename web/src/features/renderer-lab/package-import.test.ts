import { encodeAbiParameters, keccak256, type Hex } from "viem";
import { describe, expect, it } from "vitest";

import {
  maxRendererPackageBytes,
  parseRendererPackage,
  RendererPackageImportError,
  type RendererPackage,
} from "@/features/renderer-lab/package-import";

const interfaceSchema = `0x${"12".repeat(32)}` as Hex;

function byteLength(value: Hex): number {
  return (value.length - 2) / 2;
}

function fixture({
  creationBytecode = "0x6000600055",
  runtimeBytecode = "0x6000",
}: {
  creationBytecode?: Hex;
  runtimeBytecode?: Hex;
} = {}): RendererPackage {
  const compiler = {
    solidity: "0.8.36" as const,
    evmVersion: "cancun" as const,
    optimizerEnabled: true as const,
    optimizerRuns: 200,
  };
  const artifactFingerprint = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes" },
        { type: "bytes" },
        { type: "string" },
        { type: "string" },
        { type: "bool" },
        { type: "uint256" },
        { type: "bytes32" },
      ],
      [
        creationBytecode,
        runtimeBytecode,
        compiler.solidity,
        compiler.evmVersion,
        compiler.optimizerEnabled,
        BigInt(compiler.optimizerRuns),
        interfaceSchema,
      ],
    ),
  );
  return {
    formatVersion: 2,
    rendererName: "Test Renderer",
    interfaceSchema,
    compiler,
    artifacts: {
      sourceRoot: "/local/renderer",
      abi: "[]",
      creationBytecode,
      runtimeBytecode,
      artifactFingerprint,
      creationByteLength: byteLength(creationBytecode),
      runtimeByteLength: byteLength(runtimeBytecode),
    },
    deployment: {
      chainId: 46_630,
      initCodeByteLength: byteLength(creationBytecode),
    },
    examples: [
      [1, "active", "none"],
      [1, "expired", "browser-slot"],
      [7, "active", "browser-slot"],
      [7, "expired", "none"],
      [42, "active", "none"],
      [42, "expired", "browser-slot"],
    ].map(([tokenId, state, imageMode], index) => ({
      requestId: `example-${index + 1}`,
      tokenId: tokenId as 1 | 7 | 42,
      state: state as "active" | "expired",
      imageMode: imageMode as "none" | "browser-slot",
      method: "previewSVG" as const,
      contextWithoutMedia: { tokenId, state },
      localImageSlot: imageMode === "browser-slot",
    })),
    skill: "/skill",
    llms: "/llms.txt",
  };
}

function expectImportError(action: () => unknown, code: string) {
  try {
    action();
    throw new Error("Expected package import to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(RendererPackageImportError);
    expect(error).toMatchObject({ code });
  }
}

describe("parseRendererPackage", () => {
  it("validates version 2 and recomputes artifact fields", () => {
    const value = fixture();
    const parsed = parseRendererPackage(JSON.stringify(value));

    expect(parsed.artifacts).toMatchObject({
      creationByteLength: 5,
      runtimeByteLength: 2,
      artifactFingerprint: value.artifacts.artifactFingerprint,
    });
    expect(parsed.deployment).toEqual({
      chainId: 46_630,
      initCodeByteLength: 5,
    });
  });

  it("rejects oversized, malformed, and schema-invalid input", () => {
    const oversized = `"${"é".repeat(maxRendererPackageBytes / 2)}"`;
    expectImportError(
      () => parseRendererPackage(oversized),
      "package-too-large",
    );
    expectImportError(() => parseRendererPackage("{"), "invalid-json");

    const value = fixture() as Partial<RendererPackage>;
    delete value.rendererName;
    expectImportError(
      () => parseRendererPackage(JSON.stringify(value)),
      "schema-invalid",
    );
  });

  it("keeps descriptive strings inert", () => {
    const value = fixture();
    value.rendererName = "<img src=x onerror=globalThis.rendererRan=true>";
    value.artifacts.sourceRoot = "javascript:globalThis.rendererRan=true";
    value.skill = "data:text/javascript,globalThis.rendererRan=true";

    const parsed = parseRendererPackage(JSON.stringify(value));
    expect(parsed.rendererName).toBe(value.rendererName);
    expect(parsed.artifacts.sourceRoot).toBe(value.artifacts.sourceRoot);
    expect(parsed.skill).toBe(value.skill);
    expect(
      (globalThis as typeof globalThis & { rendererRan?: boolean }).rendererRan,
    ).toBeUndefined();
  });

  it("rejects the wrong chain and obsolete version 1 packages", () => {
    const wrongChain = fixture();
    wrongChain.deployment.chainId = 31_337;
    expectImportError(
      () => parseRendererPackage(JSON.stringify(wrongChain)),
      "wrong-chain",
    );

    const obsolete = { ...fixture(), formatVersion: 1 };
    expectImportError(
      () => parseRendererPackage(JSON.stringify(obsolete)),
      "schema-invalid",
    );
  });

  it("rejects fingerprint and declared byte-length mismatches", () => {
    const fingerprint = fixture();
    fingerprint.artifacts.artifactFingerprint = `0x${"ff".repeat(32)}`;
    expectImportError(
      () => parseRendererPackage(JSON.stringify(fingerprint)),
      "artifact-fingerprint-mismatch",
    );

    const artifactSize = fixture();
    artifactSize.artifacts.creationByteLength = 500;
    expectImportError(
      () => parseRendererPackage(JSON.stringify(artifactSize)),
      "creation-size-mismatch",
    );

    const deploymentSize = fixture();
    deploymentSize.deployment.initCodeByteLength = 500;
    expectImportError(
      () => parseRendererPackage(JSON.stringify(deploymentSize)),
      "creation-size-mismatch",
    );
  });

  it("accepts the registry limit and rejects one byte above it", () => {
    const accepted = fixture({
      creationBytecode: `0x${"00".repeat(94_656)}`,
    });
    expect(
      parseRendererPackage(JSON.stringify(accepted)).deployment
        .initCodeByteLength,
    ).toBe(94_656);

    const rejected = fixture({
      creationBytecode: `0x${"00".repeat(94_657)}`,
    });
    expectImportError(
      () => parseRendererPackage(JSON.stringify(rejected)),
      "schema-invalid",
    );
  });
});
