import Ajv2020 from "ajv/dist/2020";
import { encodeAbiParameters, keccak256, type Hex } from "viem";

import rendererPackageSchema from "@/features/renderer-lab/renderer-package.schema.json";

export const maxRendererPackageBytes = 1_000_000;
export const maxRendererRuntimeBytes = 88_000;
export const maxRendererInitcodeBytes = 94_656;
export const canonicalRendererPackageChainId = 46_630;

type CompilerProfile = {
  solidity: "0.8.36";
  evmVersion: "cancun";
  optimizerEnabled: true;
  optimizerRuns: number;
};

export type RendererPackageExample = {
  requestId: string;
  tokenId: 1 | 7 | 42;
  state: "active" | "expired";
  imageMode: "none" | "browser-slot";
  method: "previewSVG" | "previewTokenURI";
  contextWithoutMedia: Record<string, unknown>;
  localImageSlot: boolean;
};

export type RendererPackage = {
  formatVersion: 2;
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
    initCodeByteLength: number;
  };
  examples: RendererPackageExample[];
  skill: string;
  llms: string;
};

export type ParsedRendererPackage = RendererPackage & {
  artifacts: RendererPackage["artifacts"] & {
    creationByteLength: number;
    runtimeByteLength: number;
  };
};

export type RendererPackageImportErrorCode =
  | "package-too-large"
  | "invalid-json"
  | "schema-invalid"
  | "wrong-chain"
  | "creation-too-large"
  | "runtime-too-large"
  | "artifact-fingerprint-mismatch"
  | "creation-size-mismatch"
  | "runtime-size-mismatch";

export class RendererPackageImportError extends Error {
  readonly code: RendererPackageImportErrorCode;

  constructor(code: RendererPackageImportErrorCode, message: string) {
    super(message);
    this.name = "RendererPackageImportError";
    this.code = code;
  }
}

const ajv = new Ajv2020({ allErrors: true });
const validateRendererPackage = ajv.compile<RendererPackage>(
  rendererPackageSchema,
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function rejectNoncanonicalProfile(value: unknown): void {
  if (!isRecord(value) || !isRecord(value.deployment)) return;

  const { chainId } = value.deployment;
  if (
    typeof chainId === "number" &&
    chainId !== canonicalRendererPackageChainId
  ) {
    throw new RendererPackageImportError(
      "wrong-chain",
      `This package targets chain ${chainId}; the renderer lab requires canonical chain ${canonicalRendererPackageChainId}.`,
    );
  }
}

function schemaErrorMessage(): string {
  const details = (validateRendererPackage.errors ?? [])
    .slice(0, 3)
    .map((error) => `${error.instancePath || "package"} ${error.message}`)
    .join("; ");
  return details
    ? `Renderer package schema validation failed: ${details}.`
    : "Renderer package schema validation failed.";
}

function hexByteLength(value: Hex, label: string): number {
  const digits = value.length - 2;
  if (digits % 2 !== 0) {
    throw new RendererPackageImportError(
      "schema-invalid",
      `${label} must contain complete bytes.`,
    );
  }
  return digits / 2;
}

export function computeRendererArtifactFingerprint({
  creationBytecode,
  runtimeBytecode,
  compiler,
  interfaceSchema,
}: Pick<RendererPackage, "compiler" | "interfaceSchema"> &
  Pick<RendererPackage["artifacts"], "creationBytecode" | "runtimeBytecode">) {
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

function assertEqual(
  actual: string | number,
  expected: string | number,
  code: RendererPackageImportErrorCode,
  message: string,
): void {
  const matches =
    typeof actual === "string" && typeof expected === "string"
      ? actual.toLowerCase() === expected.toLowerCase()
      : actual === expected;
  if (!matches) throw new RendererPackageImportError(code, message);
}

export function parseRendererPackage(
  serialized: string,
): ParsedRendererPackage {
  if (new TextEncoder().encode(serialized).length > maxRendererPackageBytes) {
    throw new RendererPackageImportError(
      "package-too-large",
      `Renderer packages must be ${maxRendererPackageBytes.toLocaleString()} bytes or smaller.`,
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch {
    throw new RendererPackageImportError(
      "invalid-json",
      "The renderer package is not valid JSON.",
    );
  }

  rejectNoncanonicalProfile(value);
  if (!validateRendererPackage(value)) {
    throw new RendererPackageImportError(
      "schema-invalid",
      schemaErrorMessage(),
    );
  }

  const creationByteLength = hexByteLength(
    value.artifacts.creationBytecode,
    "Creation bytecode",
  );
  const runtimeByteLength = hexByteLength(
    value.artifacts.runtimeBytecode,
    "Runtime bytecode",
  );
  if (creationByteLength > maxRendererInitcodeBytes) {
    throw new RendererPackageImportError(
      "creation-too-large",
      `Renderer initcode exceeds the ${maxRendererInitcodeBytes.toLocaleString()}-byte project limit.`,
    );
  }
  if (runtimeByteLength > maxRendererRuntimeBytes) {
    throw new RendererPackageImportError(
      "runtime-too-large",
      `Renderer runtime exceeds the ${maxRendererRuntimeBytes.toLocaleString()}-byte project limit.`,
    );
  }

  if (value.artifacts.creationByteLength !== undefined) {
    assertEqual(
      value.artifacts.creationByteLength,
      creationByteLength,
      "creation-size-mismatch",
      "The declared creation byte length does not match the imported initcode.",
    );
  }
  if (value.artifacts.runtimeByteLength !== undefined) {
    assertEqual(
      value.artifacts.runtimeByteLength,
      runtimeByteLength,
      "runtime-size-mismatch",
      "The declared runtime byte length does not match the imported runtime bytecode.",
    );
  }
  assertEqual(
    value.deployment.initCodeByteLength,
    creationByteLength,
    "creation-size-mismatch",
    "The deployment byte length does not match the imported initcode.",
  );

  const artifactFingerprint = computeRendererArtifactFingerprint({
    creationBytecode: value.artifacts.creationBytecode,
    runtimeBytecode: value.artifacts.runtimeBytecode,
    compiler: value.compiler,
    interfaceSchema: value.interfaceSchema,
  });
  assertEqual(
    value.artifacts.artifactFingerprint,
    artifactFingerprint,
    "artifact-fingerprint-mismatch",
    "The artifact fingerprint does not match the imported renderer artifacts.",
  );

  return {
    ...value,
    artifacts: {
      ...value.artifacts,
      artifactFingerprint,
      creationByteLength,
      runtimeByteLength,
    },
    deployment: value.deployment,
  };
}
