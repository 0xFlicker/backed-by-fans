import {
  getAddress,
  isAddress,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

import { membershipTierAbi, membershipFactoryAbi } from "@/contracts";
import type {
  CatalogPage,
  CatalogTierSummary,
  TierSnapshot,
} from "@/contracts/types";
import {
  isTierArtConfig,
  isTierMediaConfig,
  verifyTierAuthenticity,
} from "@/lib/authenticity";
import type { ReadyDeployment } from "@/lib/config";
import { readAcceptedPaymentTokens } from "@/lib/payment-token-read";
import { classifyReadError, type ReadState } from "@/lib/read-state";

export const catalogPageLimit = 24;
export const maxCatalogPageLimit = 100;
export const staleBlockDistance = 25n;
export const multicall3Address = getAddress(
  "0xca11bde05977b3631167028862be2a173976ca11",
);
export const multicall3RuntimeHash =
  "0xd5c15df687b16f2ff992fc8d767b4216323184a2bbc6ee2f9c398c318e770891";

type MulticallResult =
  { status: "success"; result: unknown } | { status: "failure" };

const summaryFields = [
  "name",
  "symbol",
  "owner",
  "description",
  "externalURI",
  "paymentToken",
  "pricePerPeriod",
  "periodDuration",
  "paused",
  "renderer",
  "artConfig",
  "mediaConfig",
] as const;

export function tierArtworkRevision(input: {
  name: string;
  description: string;
  externalURI: string;
  renderer: Address;
  art: CatalogTierSummary["art"];
  media: CatalogTierSummary["media"];
}): Hex {
  const { art, media } = input;
  const values = [
    input.name,
    input.description,
    input.externalURI,
    input.renderer.toLowerCase(),
    art.engine,
    art.collectionSeed,
    art.palette,
    art.intensity,
    art.density,
    art.symmetry,
    art.typographyScale,
    art.typographyStyle,
    art.textVisibility,
    art.imageFit,
    art.focalX,
    art.focalY,
    art.grain,
    art.mediaMix,
    art.primary,
    art.secondary,
    art.tertiary,
    media.mime,
    media.store.toLowerCase(),
    media.length,
    media.digest,
    media.runtimeCodehash,
  ];
  return keccak256(stringToHex(values.map(String).join("\u001f")));
}

export function validateTierRouteParam(value: string): Address | undefined {
  return isAddress(value) ? getAddress(value) : undefined;
}

export async function readCatalogPage(
  client: PublicClient,
  factory: Address,
  input: { offset?: bigint; limit?: number; blockNumber?: bigint } = {},
): Promise<CatalogPage> {
  const offset = input.offset ?? 0n;
  const limit = input.limit ?? catalogPageLimit;
  if (offset < 0n || limit < 1 || limit > maxCatalogPageLimit) {
    throw new RangeError("Catalog pagination is outside the factory bounds.");
  }

  const capturedBlock =
    input.blockNumber ?? (await client.getBlockNumber({ cacheTime: 0 }));
  const [total, addresses] = await Promise.all([
    client.readContract({
      address: factory,
      abi: membershipFactoryAbi,
      functionName: "tierCount",
      blockNumber: capturedBlock,
    }),
    client.readContract({
      address: factory,
      abi: membershipFactoryAbi,
      functionName: "tiers",
      args: [offset, BigInt(limit)],
      blockNumber: capturedBlock,
    }),
  ]);
  const nextOffset =
    offset + BigInt(addresses.length) < total
      ? offset + BigInt(addresses.length)
      : null;

  return {
    capturedBlock,
    total,
    offset,
    limit,
    addresses: [...addresses],
    nextOffset,
  };
}

export async function verifyMulticall3(
  client: PublicClient,
  blockNumber: bigint,
): Promise<"verified" | "missing" | "mismatch"> {
  const code = await client.getBytecode({
    address: multicall3Address,
    blockNumber,
  });
  if (!code || code === "0x") return "missing";
  return keccak256(code) === multicall3RuntimeHash ? "verified" : "mismatch";
}

function summaryFromResults(
  address: Address,
  results: unknown[],
): CatalogTierSummary | undefined {
  if (
    typeof results[0] !== "string" ||
    typeof results[1] !== "string" ||
    typeof results[2] !== "string" ||
    typeof results[3] !== "string" ||
    typeof results[4] !== "string" ||
    typeof results[5] !== "string" ||
    typeof results[6] !== "bigint" ||
    typeof results[7] !== "bigint" ||
    typeof results[8] !== "boolean" ||
    typeof results[9] !== "string" ||
    !isTierArtConfig(results[10]) ||
    !isTierMediaConfig(results[11])
  ) {
    return undefined;
  }
  const summary = {
    address,
    name: results[0],
    symbol: results[1],
    creator: getAddress(results[2]),
    description: results[3],
    externalURI: results[4],
    paymentToken: getAddress(results[5]),
    pricePerPeriod: results[6],
    periodDuration: results[7],
    paused: results[8],
    renderer: getAddress(results[9]),
    art: results[10],
    media: results[11],
  };
  return { ...summary, artworkRevision: tierArtworkRevision(summary) };
}

async function readSummariesDirectly(
  client: PublicClient,
  addresses: Address[],
  blockNumber: bigint,
) {
  const summaries: CatalogTierSummary[] = [];
  const missing: string[] = [];

  for (const address of addresses) {
    const results = await Promise.allSettled(
      summaryFields.map((functionName) =>
        client.readContract({
          address,
          abi: membershipTierAbi,
          functionName,
          blockNumber,
        }),
      ),
    );
    const values = results.map((result, index) => {
      if (result.status === "fulfilled") return result.value;
      missing.push(`${address}.${summaryFields[index]}`);
      return undefined;
    });
    const summary = summaryFromResults(address, values);
    if (summary) summaries.push(summary);
  }

  return { summaries, missing };
}

export async function readTierSummaries(
  client: PublicClient,
  addresses: Address[],
  blockNumber: bigint,
): Promise<ReadState<CatalogTierSummary[]>> {
  if (addresses.length > catalogPageLimit) {
    throw new RangeError("Tier summaries must remain within one bounded page.");
  }

  try {
    const multicallStatus = await verifyMulticall3(client, blockNumber);
    if (multicallStatus !== "verified") {
      const direct = await readSummariesDirectly(
        client,
        addresses,
        blockNumber,
      );
      return {
        status: "partial",
        data: direct.summaries,
        capturedBlock: blockNumber,
        reason: "missing-multicall",
        missing: [
          `verified Multicall3 bytecode (${multicallStatus})`,
          ...direct.missing,
        ],
        label:
          "Verified Multicall3 is unavailable. Results use bounded direct reads and writes remain disabled.",
      };
    }

    const contracts = addresses.flatMap((address) =>
      summaryFields.map((functionName) => ({
        address,
        abi: membershipTierAbi,
        functionName,
      })),
    );
    const results = await client.multicall({
      contracts,
      allowFailure: true,
      blockNumber,
      multicallAddress: multicall3Address,
    });
    const summaries: CatalogTierSummary[] = [];
    const missing: string[] = [];

    addresses.forEach((address, addressIndex) => {
      const start = addressIndex * summaryFields.length;
      const group = results.slice(start, start + summaryFields.length);
      const values = group.map((result, fieldIndex) => {
        if (result.status === "success") return result.result;
        missing.push(`${address}.${summaryFields[fieldIndex]}`);
        return undefined;
      });
      const summary = summaryFromResults(address, values);
      if (summary) summaries.push(summary);
    });

    if (missing.length > 0) {
      return {
        status: "partial",
        data: summaries,
        capturedBlock: blockNumber,
        reason: "incomplete-response",
        missing,
        label:
          "Some tier fields were unavailable at the captured block. Missing values were not treated as zero.",
      };
    }

    return { status: "valid", data: summaries, capturedBlock: blockNumber };
  } catch (error) {
    const classified = classifyReadError(error);
    return classified.status === "rate-limited"
      ? classified
      : {
          status: "unavailable",
          reason: "rpc-unavailable",
          label: classified.label,
        };
  }
}

export async function readTierSnapshotState(
  client: PublicClient,
  input: {
    tier: Address;
    deployment: ReadyDeployment;
  },
): Promise<ReadState<TierSnapshot>> {
  const authenticity = await verifyTierAuthenticity(client, {
    deployment: input.deployment,
    tier: input.tier,
  });

  if (authenticity.status === "rate-limited") return authenticity;
  if (authenticity.status === "unavailable") {
    return {
      status: "unavailable",
      reason: "rpc-unavailable",
      label: authenticity.label,
    };
  }
  if (authenticity.status === "interface-mismatch") {
    return {
      status: "interface-mismatch",
      address: authenticity.address,
      failedChecks: authenticity.failedChecks,
      label: authenticity.label,
    };
  }

  const blockNumber = authenticity.capturedBlock;
  const fields = [
    "name",
    "symbol",
    "owner",
    "pricePerPeriod",
    "periodDuration",
    "paused",
    "description",
    "externalURI",
    "rewardBps",
    "referralBps",
    "supplyCap",
    "occupiedSupply",
    "maxPrepaidPeriods",
  ] as const;

  try {
    const missing: string[] = [];
    let values: unknown[];
    const multicallStatus = await verifyMulticall3(client, blockNumber);
    if (multicallStatus === "verified") {
      const results = (await client.multicall({
        contracts: fields.map((functionName) => ({
          address: input.tier,
          abi: membershipTierAbi,
          functionName,
        })),
        allowFailure: true,
        blockNumber,
        multicallAddress: multicall3Address,
      })) as MulticallResult[];
      values = results.map((result, index) => {
        if (result.status === "success") return result.result;
        missing.push(fields[index]);
        return undefined;
      });
    } else {
      const settled: PromiseSettledResult<unknown>[] = [];
      for (let offset = 0; offset < fields.length; offset += 4) {
        settled.push(
          ...(await Promise.allSettled(
            fields.slice(offset, offset + 4).map((functionName) =>
              client.readContract({
                address: input.tier,
                abi: membershipTierAbi,
                functionName,
                blockNumber,
              }),
            ),
          )),
        );
      }
      values = settled.map((result, index) => {
        if (result.status === "fulfilled") return result.value;
        missing.push(fields[index]);
        return undefined;
      });
    }

    if (missing.length > 0) {
      return {
        status: "partial",
        capturedBlock: blockNumber,
        reason: "incomplete-response",
        missing,
        label:
          "The tier is verified, but some current fields could not be read. Missing values were not treated as zero.",
      };
    }

    const paymentTokens = await readAcceptedPaymentTokens(client, {
      chainId: input.deployment.chainId,
      factory: authenticity.protocolDependencies.factory,
      blockNumber,
    });
    const paymentTokenState =
      paymentTokens.status === "valid" || paymentTokens.status === "partial"
        ? paymentTokens.data.find(
            (token) =>
              token.address.toLowerCase() ===
              authenticity.paymentToken.toLowerCase(),
          )
        : undefined;
    if (!paymentTokenState) {
      throw new Error("The tier payment token metadata is unavailable.");
    }

    const snapshot: TierSnapshot = {
      address: input.tier,
      name: values[0] as string,
      symbol: values[1] as string,
      creator: values[2] as Address,
      pricePerPeriod: values[3] as bigint,
      periodDuration: values[4] as bigint,
      paused: values[5] as boolean,
      description: values[6] as string,
      externalURI: values[7] as string,
      tierIdentity: authenticity.tierIdentity,
      art: authenticity.art,
      media: authenticity.media,
      rewardBps: Number(values[8]),
      referralBps: Number(values[9]),
      supplyCap: values[10] as bigint,
      occupiedSupply: values[11] as bigint,
      maxPrepaidPeriods: values[12] as bigint,
      paymentToken: authenticity.paymentToken,
      paymentTokenState,
      factory: authenticity.protocolDependencies.factory,
      renderer: authenticity.renderer,
      protocolDependencies: authenticity.protocolDependencies,
    };
    const latestBlock = await client.getBlockNumber({ cacheTime: 0 });
    if (latestBlock - blockNumber > staleBlockDistance) {
      return {
        status: "stale",
        data: snapshot,
        capturedBlock: blockNumber,
        latestBlock,
        label:
          "This verified snapshot is stale. Refresh before preparing a transaction.",
      };
    }

    return { status: "valid", data: snapshot, capturedBlock: blockNumber };
  } catch (error) {
    const classified = classifyReadError(error);
    return classified.status === "rate-limited"
      ? classified
      : {
          status: "unavailable",
          reason: "rpc-unavailable",
          label: classified.label,
        };
  }
}
