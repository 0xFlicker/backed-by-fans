import {
  getAddress,
  isAddress,
  keccak256,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

import { onchainMetadataRendererAbi } from "@/contracts";

export type CanonicalRendererChainId = 4_663 | 46_630 | 31_337;

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
