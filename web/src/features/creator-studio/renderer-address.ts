import {
  getAddress,
  isAddress,
  keccak256,
  stringToHex,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

import { onchainMetadataRendererAbi } from "@/contracts";
import { decodeRendererSurface } from "@/features/creator-studio/renderer-preview";

export type CanonicalRendererChainId = 46_630 | 31_337;

export type RendererAddressErrorCode =
  | "invalid-address"
  | "wrong-chain"
  | "no-code"
  | "interface-mismatch"
  | "invalid-manifest"
  | "rpc-unavailable";

export class RendererAddressError extends Error {
  readonly code: RendererAddressErrorCode;

  constructor(
    code: RendererAddressErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "RendererAddressError";
    this.code = code;
  }
}

export type RendererAddressResolution = {
  chainId: CanonicalRendererChainId;
  address: Address;
  capturedBlock: bigint;
  runtimeCodeHash: Hex;
  schema: Hex;
  name: string;
  engines: readonly string[];
};

const maxRendererManifestEngines = 64;

export function normalizeRendererAddress(value: string): Address {
  const trimmed = value.trim();
  if (!isAddress(trimmed)) {
    throw new RendererAddressError(
      "invalid-address",
      "Enter a valid renderer address.",
    );
  }

  const address = getAddress(trimmed);
  if (address === zeroAddress) {
    throw new RendererAddressError(
      "invalid-address",
      "The renderer cannot use the zero address.",
    );
  }
  return address;
}

function rendererReadError(message: string, cause: unknown) {
  return new RendererAddressError("interface-mismatch", message, { cause });
}

export async function resolveRendererAddress(
  client: PublicClient,
  input: {
    address: string;
    canonicalChainId: CanonicalRendererChainId;
    expectedSchema: Hex;
  },
): Promise<RendererAddressResolution> {
  const address = normalizeRendererAddress(input.address);

  let actualChainId: number;
  try {
    actualChainId = await client.getChainId();
  } catch (cause) {
    throw new RendererAddressError(
      "rpc-unavailable",
      "The canonical chain could not be reached.",
      { cause },
    );
  }
  if (actualChainId !== input.canonicalChainId) {
    throw new RendererAddressError(
      "wrong-chain",
      `The renderer can only be checked on canonical chain ${input.canonicalChainId}; the RPC reported chain ${actualChainId}.`,
    );
  }

  let capturedBlock: bigint;
  let code: Hex | undefined;
  try {
    capturedBlock = await client.getBlockNumber({ cacheTime: 0 });
    code = await client.getBytecode({ address, blockNumber: capturedBlock });
  } catch (cause) {
    throw new RendererAddressError(
      "rpc-unavailable",
      "The renderer code could not be read from the canonical chain.",
      { cause },
    );
  }
  if (!code || code === "0x") {
    throw new RendererAddressError(
      "no-code",
      `No renderer contract exists at ${address} on canonical chain ${input.canonicalChainId}.`,
    );
  }

  let schema: Hex;
  try {
    schema = await client.readContract({
      address,
      abi: onchainMetadataRendererAbi,
      functionName: "rendererSchema",
      blockNumber: capturedBlock,
    });
  } catch (cause) {
    throw rendererReadError(
      "The contract does not expose the required renderer interface.",
      cause,
    );
  }
  if (schema !== input.expectedSchema) {
    throw new RendererAddressError(
      "interface-mismatch",
      "The contract does not use the required membership renderer schema.",
    );
  }

  let rawName: string;
  let rawEngineCount: number;
  try {
    [rawName, rawEngineCount] = await Promise.all([
      client.readContract({
        address,
        abi: onchainMetadataRendererAbi,
        functionName: "rendererName",
        blockNumber: capturedBlock,
      }),
      client.readContract({
        address,
        abi: onchainMetadataRendererAbi,
        functionName: "engineCount",
        blockNumber: capturedBlock,
      }),
    ]);
  } catch (cause) {
    throw rendererReadError(
      "The renderer manifest could not be read from the contract.",
      cause,
    );
  }

  const name = rawName.trim();
  const engineCount = Number(rawEngineCount);
  if (
    !name ||
    !Number.isSafeInteger(engineCount) ||
    engineCount < 1 ||
    engineCount > maxRendererManifestEngines
  ) {
    throw new RendererAddressError(
      "invalid-manifest",
      "The renderer returned an incomplete name or engine manifest.",
    );
  }

  let engines: readonly string[];
  try {
    engines = await Promise.all(
      Array.from({ length: engineCount }, (_, engine) =>
        client.readContract({
          address,
          abi: onchainMetadataRendererAbi,
          functionName: "engineName",
          args: [engine],
          blockNumber: capturedBlock,
        }),
      ),
    );
  } catch (cause) {
    throw rendererReadError(
      "The renderer engine manifest could not be read from the contract.",
      cause,
    );
  }

  const normalizedEngines = engines.map((engine) => engine.trim());
  if (normalizedEngines.some((engine) => !engine)) {
    throw new RendererAddressError(
      "invalid-manifest",
      "The renderer returned an incomplete name or engine manifest.",
    );
  }

  return {
    chainId: input.canonicalChainId,
    address,
    capturedBlock,
    runtimeCodeHash: keccak256(code),
    schema,
    name,
    engines: normalizedEngines,
  };
}

export const representativeRendererPreviews = [
  {
    id: "token-1-active-without-image",
    tokenId: 1,
    membershipState: "active",
    imageMode: "without-image",
  },
  {
    id: "token-1-expired-with-image",
    tokenId: 1,
    membershipState: "expired",
    imageMode: "with-image",
  },
  {
    id: "token-7-active-with-image",
    tokenId: 7,
    membershipState: "active",
    imageMode: "with-image",
  },
  {
    id: "token-7-expired-without-image",
    tokenId: 7,
    membershipState: "expired",
    imageMode: "without-image",
  },
  {
    id: "token-42-active-without-image",
    tokenId: 42,
    membershipState: "active",
    imageMode: "without-image",
  },
  {
    id: "token-42-expired-with-image",
    tokenId: 42,
    membershipState: "expired",
    imageMode: "with-image",
  },
] as const;

export type RepresentativeRendererPreviewId =
  (typeof representativeRendererPreviews)[number]["id"];

export type RepresentativeRendererResult =
  | {
      id: RepresentativeRendererPreviewId;
      status: "ready";
      image: string;
    }
  | {
      id: RepresentativeRendererPreviewId;
      status: "failed";
      error: string;
    };

type FingerprintedRepresentativeRendererResult = Extract<
  RepresentativeRendererResult,
  { status: "ready" }
> & {
  resultFingerprint: Hex;
};

type RepresentativeRendererFailure = {
  id: RepresentativeRendererPreviewId;
  error: string;
};

export type RepresentativeRendererResultState =
  | {
      status: "pending";
      canApprove: false;
      missing: readonly RepresentativeRendererPreviewId[];
    }
  | {
      status: "failed";
      canApprove: false;
      failures: readonly RepresentativeRendererFailure[];
      missing: readonly RepresentativeRendererPreviewId[];
    }
  | {
      status: "ready";
      canApprove: true;
      results: readonly FingerprintedRepresentativeRendererResult[];
      resultFingerprints: readonly Hex[];
    };

const representativePreviewIds = new Set<RepresentativeRendererPreviewId>(
  representativeRendererPreviews.map((preview) => preview.id),
);

function fingerprintRepresentativeResult(
  id: RepresentativeRendererPreviewId,
  image: string,
) {
  return keccak256(stringToHex(JSON.stringify([id, image])));
}

function previewErrorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "The renderer did not return a displayable image.";
}

export function createRepresentativeRendererResultState(
  results: readonly RepresentativeRendererResult[],
): RepresentativeRendererResultState {
  const byId = new Map<
    RepresentativeRendererPreviewId,
    RepresentativeRendererResult
  >();
  for (const result of results) {
    if (!representativePreviewIds.has(result.id)) {
      throw new Error(`Unexpected representative preview ${result.id}.`);
    }
    if (byId.has(result.id)) {
      throw new Error(`Duplicate representative preview ${result.id}.`);
    }
    byId.set(result.id, result);
  }

  const missing = representativeRendererPreviews
    .filter((preview) => !byId.has(preview.id))
    .map((preview) => preview.id);
  const failures: RepresentativeRendererFailure[] = [];
  const ready: FingerprintedRepresentativeRendererResult[] = [];

  for (const preview of representativeRendererPreviews) {
    const result = byId.get(preview.id);
    if (!result) continue;
    if (result.status === "failed") {
      failures.push({
        id: result.id,
        error:
          result.error.trim() || "The renderer could not produce this image.",
      });
      continue;
    }

    try {
      decodeRendererSurface(result.image, "svg");
      ready.push({
        ...result,
        resultFingerprint: fingerprintRepresentativeResult(
          result.id,
          result.image,
        ),
      });
    } catch (error) {
      failures.push({ id: result.id, error: previewErrorMessage(error) });
    }
  }

  if (failures.length > 0) {
    return { status: "failed", canApprove: false, failures, missing };
  }
  if (missing.length > 0) {
    return { status: "pending", canApprove: false, missing };
  }

  return {
    status: "ready",
    canApprove: true,
    results: ready,
    resultFingerprints: ready.map((result) => result.resultFingerprint),
  };
}

export type RendererAddressApproval = {
  fingerprint: Hex;
  chainId: CanonicalRendererChainId;
  rendererAddress: Address;
  rendererRuntimeCodeHash: Hex;
  requestSetFingerprint: Hex;
  resultFingerprints: readonly Hex[];
  approvedAt: number;
};

type RendererAddressApprovalInput = {
  renderer: RendererAddressResolution;
  requestSetFingerprint: Hex;
  previewState: Extract<RepresentativeRendererResultState, { status: "ready" }>;
};

function approvalFingerprint(input: RendererAddressApprovalInput): Hex {
  return keccak256(
    stringToHex(
      JSON.stringify({
        chainId: input.renderer.chainId,
        rendererAddress: input.renderer.address.toLowerCase(),
        rendererRuntimeCodeHash: input.renderer.runtimeCodeHash.toLowerCase(),
        requestSetFingerprint: input.requestSetFingerprint.toLowerCase(),
        resultFingerprints: input.previewState.resultFingerprints.map(
          (fingerprint) => fingerprint.toLowerCase(),
        ),
      }),
    ),
  );
}

export function createRendererAddressApproval(
  input: RendererAddressApprovalInput & { approvedAt?: number },
): RendererAddressApproval {
  return {
    fingerprint: approvalFingerprint(input),
    chainId: input.renderer.chainId,
    rendererAddress: input.renderer.address,
    rendererRuntimeCodeHash: input.renderer.runtimeCodeHash,
    requestSetFingerprint: input.requestSetFingerprint,
    resultFingerprints: input.previewState.resultFingerprints,
    approvedAt: input.approvedAt ?? Date.now(),
  };
}

export function isRendererAddressApprovalCurrent(
  approval: RendererAddressApproval | undefined,
  input: RendererAddressApprovalInput,
) {
  return approval?.fingerprint === approvalFingerprint(input);
}
