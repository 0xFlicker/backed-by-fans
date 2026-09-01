import {
  encodeAbiParameters,
  getAddress,
  getCreate2Address,
  keccak256,
  type Address,
  type Hex,
} from "viem";
import { describe, expect, it } from "vitest";

import {
  maxRendererPackageBytes,
  parseRendererPackage,
  RendererPackageImportError,
} from "@/features/renderer-lab/package-import";

const canonicalChainId = 46_630;
const canonicalCreate2Deployer = getAddress(
  "0x4e59b44847b379578588920cA78FbF26c0B4956C",
);
const interfaceSchema = `0x${"12".repeat(32)}` as Hex;
const salt = `0x${"34".repeat(32)}` as Hex;

type CompilerProfile = {
  solidity: string;
  evmVersion: string;
  optimizerEnabled: boolean;
  optimizerRuns: number;
};

type RendererPackageFixture = {
  formatVersion: 1;
  rendererName: string;
  interfaceSchema: Hex;
  compiler: CompilerProfile;
  artifacts: {
    sourceRoot: string;
    abi: string;
    creationBytecode: Hex;
    runtimeBytecode: Hex;
    artifactFingerprint: Hex;
    creationByteLength?: number;
    runtimeByteLength?: number;
  };
  deployment: {
    chainId: number;
    create2Deployer: Address;
    salt: Hex;
    initCodeHash: Hex;
    predictedAddress: Address;
    rawByteLength: number;
  };
  examples: Array<{
    requestId: string;
    tokenId: 1 | 7 | 42;
    state: "active" | "expired";
    imageMode: "none" | "browser-slot";
    method: "previewSVG" | "previewTokenURI";
    contextWithoutMedia: Record<string, unknown>;
    localImageSlot: boolean;
  }>;
  skill: string;
  llms: string;
};

function byteLength(value: Hex): number {
  return (value.length - 2) / 2;
}

function computeFixtureFingerprint(
  creationBytecode: Hex,
  runtimeBytecode: Hex,
  compiler: CompilerProfile,
): Hex {
  return keccak256(
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
}

function packageFixture({
  creationBytecode = "0x6000600055",
  runtimeBytecode = "0x6000",
}: {
  creationBytecode?: Hex;
  runtimeBytecode?: Hex;
} = {}): RendererPackageFixture {
  const compiler: CompilerProfile = {
    solidity: "0.8.36",
    evmVersion: "cancun",
    optimizerEnabled: true,
    optimizerRuns: 200,
  };
  const initCodeHash = keccak256(creationBytecode);

  return {
    formatVersion: 1,
    rendererName: "Test Renderer",
    interfaceSchema,
    compiler,
    artifacts: {
      sourceRoot: "/local/renderer",
      abi: "[]",
      creationBytecode,
      runtimeBytecode,
      artifactFingerprint: computeFixtureFingerprint(
        creationBytecode,
        runtimeBytecode,
        compiler,
      ),
      creationByteLength: byteLength(creationBytecode),
      runtimeByteLength: byteLength(runtimeBytecode),
    },
    deployment: {
      chainId: canonicalChainId,
      create2Deployer: canonicalCreate2Deployer,
      salt,
      initCodeHash,
      predictedAddress: getCreate2Address({
        from: canonicalCreate2Deployer,
        salt,
        bytecodeHash: initCodeHash,
      }),
      rawByteLength: byteLength(salt) + byteLength(creationBytecode),
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
    skill: ".agents/skills/backed-by-fans-renderer/SKILL.md",
    llms: ".agents/skills/backed-by-fans-renderer/llms.txt",
  };
}

function serialize(value: RendererPackageFixture): string {
  return JSON.stringify(value);
}

function expectImportError(
  action: () => unknown,
  code: RendererPackageImportError["code"],
) {
  try {
    action();
    throw new Error("Expected package import to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(RendererPackageImportError);
    expect(error).toMatchObject({ code });
  }
}

describe("parseRendererPackage", () => {
  it("validates a package and returns independently recomputed integrity fields", () => {
    const fixture = packageFixture();
    const parsed = parseRendererPackage(serialize(fixture));

    expect(parsed.artifacts).toMatchObject({
      creationByteLength: 5,
      runtimeByteLength: 2,
      artifactFingerprint: fixture.artifacts.artifactFingerprint,
    });
    expect(parsed.deployment).toMatchObject({
      chainId: canonicalChainId,
      create2Deployer: canonicalCreate2Deployer,
      salt,
      initCodeHash: fixture.deployment.initCodeHash,
      rawByteLength: 37,
      predictedAddress: fixture.deployment.predictedAddress,
    });
  });

  it("rejects a package above the 1,000,000-byte UTF-8 limit before parsing JSON", () => {
    const oversized = `"${"é".repeat(maxRendererPackageBytes / 2)}"`;

    expect(new TextEncoder().encode(oversized).length).toBeGreaterThan(
      maxRendererPackageBytes,
    );
    expectImportError(
      () => parseRendererPackage(oversized),
      "package-too-large",
    );
  });

  it("rejects malformed JSON and packages that do not satisfy the Ajv schema", () => {
    expectImportError(() => parseRendererPackage("{"), "invalid-json");

    const fixture = packageFixture();
    const invalid = { ...fixture } as Partial<RendererPackageFixture>;
    delete invalid.rendererName;
    expectImportError(
      () => parseRendererPackage(JSON.stringify(invalid)),
      "schema-invalid",
    );
  });

  it("keeps imported paths and descriptive strings inert", () => {
    const fixture = packageFixture();
    fixture.rendererName = "<img src=x onerror=globalThis.rendererRan=true>";
    fixture.artifacts.sourceRoot =
      "javascript:globalThis.rendererRan=true;../../private-key";
    fixture.skill = "data:text/javascript,globalThis.rendererRan=true";
    fixture.llms = "<script>globalThis.rendererRan=true</script>";

    const parsed = parseRendererPackage(serialize(fixture));

    expect(parsed.rendererName).toBe(fixture.rendererName);
    expect(parsed.artifacts.sourceRoot).toBe(fixture.artifacts.sourceRoot);
    expect(parsed.skill).toBe(fixture.skill);
    expect(parsed.llms).toBe(fixture.llms);
    expect(
      (globalThis as typeof globalThis & { rendererRan?: boolean }).rendererRan,
    ).toBeUndefined();
  });

  it("rejects a package for a noncanonical chain or deployer", () => {
    const wrongChain = packageFixture();
    wrongChain.deployment.chainId = 31_337;
    expectImportError(
      () => parseRendererPackage(serialize(wrongChain)),
      "wrong-chain",
    );

    const wrongDeployer = packageFixture();
    wrongDeployer.deployment.create2Deployer = getAddress(
      "0x1111111111111111111111111111111111111111",
    );
    expectImportError(
      () => parseRendererPackage(serialize(wrongDeployer)),
      "wrong-deployer",
    );

    const badChecksumDeployer = packageFixture();
    badChecksumDeployer.deployment.create2Deployer =
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaA" as Address;
    expectImportError(
      () => parseRendererPackage(serialize(badChecksumDeployer)),
      "wrong-deployer",
    );
  });

  it("rejects artifact fingerprint and initcode hash mismatches", () => {
    const fingerprintMismatch = packageFixture();
    fingerprintMismatch.artifacts.artifactFingerprint = `0x${"ff".repeat(32)}`;
    expectImportError(
      () => parseRendererPackage(serialize(fingerprintMismatch)),
      "artifact-fingerprint-mismatch",
    );

    const initcodeMismatch = packageFixture();
    initcodeMismatch.deployment.initCodeHash = `0x${"ee".repeat(32)}`;
    expectImportError(
      () => parseRendererPackage(serialize(initcodeMismatch)),
      "initcode-hash-mismatch",
    );
  });

  it("rejects declared artifact and raw payload sizes that differ from the bytes", () => {
    const creationSizeMismatch = packageFixture();
    creationSizeMismatch.artifacts.creationByteLength = 500;
    expectImportError(
      () => parseRendererPackage(serialize(creationSizeMismatch)),
      "creation-size-mismatch",
    );

    const runtimeSizeMismatch = packageFixture();
    runtimeSizeMismatch.artifacts.runtimeByteLength = 200;
    expectImportError(
      () => parseRendererPackage(serialize(runtimeSizeMismatch)),
      "runtime-size-mismatch",
    );

    const payloadSizeMismatch = packageFixture();
    payloadSizeMismatch.deployment.rawByteLength += 1;
    expectImportError(
      () => parseRendererPackage(serialize(payloadSizeMismatch)),
      "raw-payload-size-mismatch",
    );
  });

  it("accepts 94,999 raw salt-plus-initcode bytes and rejects 95,000", () => {
    const accepted = packageFixture({
      creationBytecode: `0x${"00".repeat(94_967)}`,
    });
    expect(
      parseRendererPackage(serialize(accepted)).deployment.rawByteLength,
    ).toBe(94_999);

    const rejected = packageFixture({
      creationBytecode: `0x${"00".repeat(94_968)}`,
    });
    rejected.deployment.rawByteLength = 94_999;
    expectImportError(
      () => parseRendererPackage(serialize(rejected)),
      "raw-payload-too-large",
    );
  });

  it("rejects a predicted CREATE2 address that was not derived from the package", () => {
    const fixture = packageFixture();
    fixture.deployment.predictedAddress = getAddress(
      "0x2222222222222222222222222222222222222222",
    );

    expectImportError(
      () => parseRendererPackage(serialize(fixture)),
      "predicted-address-mismatch",
    );
  });
});
