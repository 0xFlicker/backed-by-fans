import {
  getAddress,
  isAddress,
  keccak256,
  type Address,
  type PublicClient,
} from "viem";

import { membershipTierAbi, robinhoodMembershipFactoryAbi } from "@/contracts";
import type { CatalogPage, TierSnapshot, TierSummary } from "@/contracts/types";
import { verifyTierAuthenticity } from "@/lib/authenticity";
import type { ReadyDeployment } from "@/lib/config";
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
  "pricePerPeriod",
  "periodDuration",
  "paused",
] as const;

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
      abi: robinhoodMembershipFactoryAbi,
      functionName: "tierCount",
      blockNumber: capturedBlock,
    }),
    client.readContract({
      address: factory,
      abi: robinhoodMembershipFactoryAbi,
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
): TierSummary | undefined {
  if (
    typeof results[0] !== "string" ||
    typeof results[1] !== "string" ||
    typeof results[2] !== "string" ||
    typeof results[3] !== "bigint" ||
    typeof results[4] !== "bigint" ||
    typeof results[5] !== "boolean"
  ) {
    return undefined;
  }
  return {
    address,
    name: results[0],
    symbol: results[1],
    creator: getAddress(results[2]),
    pricePerPeriod: results[3],
    periodDuration: results[4],
    paused: results[5],
  };
}

async function readSummariesDirectly(
  client: PublicClient,
  addresses: Address[],
  blockNumber: bigint,
) {
  const summaries: TierSummary[] = [];
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
): Promise<ReadState<TierSummary[]>> {
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
    const summaries: TierSummary[] = [];
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
    "imageURI",
    "externalURI",
    "rewardBps",
    "referralBps",
    "supplyCap",
    "occupiedSupply",
    "maxPrepaidPeriods",
    "paymentToken",
    "factory",
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

    const snapshot: TierSnapshot = {
      address: input.tier,
      name: values[0] as string,
      symbol: values[1] as string,
      creator: values[2] as Address,
      pricePerPeriod: values[3] as bigint,
      periodDuration: values[4] as bigint,
      paused: values[5] as boolean,
      description: values[6] as string,
      imageURI: values[7] as string,
      externalURI: values[8] as string,
      rewardBps: Number(values[9]),
      referralBps: Number(values[10]),
      supplyCap: values[11] as bigint,
      occupiedSupply: values[12] as bigint,
      maxPrepaidPeriods: values[13] as bigint,
      paymentToken: values[14] as Address,
      factory: values[15] as Address,
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
