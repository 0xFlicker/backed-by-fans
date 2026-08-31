import { getAddress, isAddress, type Address, type PublicClient } from "viem";

import { membershipTierAbi, robinhoodMembershipFactoryAbi } from "@/contracts";
import type { ProtocolDependencySnapshot } from "@/contracts/types";
import type { AccountTierResult } from "@/features/membership/account-cache";
import { readProtocolDependencies } from "@/features/protocol/protocol-read";
import {
  tierBindingFailures,
  verifyTierAuthenticity,
} from "@/lib/authenticity";
import { isSameAddress } from "@/lib/address";
import type { ReadyDeployment } from "@/lib/config";
import { membershipInterfaces } from "@/lib/membership-interfaces";
import {
  multicall3Address,
  readCatalogPage,
  verifyMulticall3,
} from "@/lib/direct-read";

export const accountDiscoveryPageLimit = 12;

export type AccountDiscoveryPage = {
  capturedBlock: bigint;
  total: bigint;
  offset: bigint;
  scannedTo: bigint;
  nextOffset: bigint | null;
  scannedTiers: Address[];
  results: AccountTierResult[];
  skipped: string[];
};

async function inspectTier(
  client: PublicClient,
  input: {
    tier: Address;
    deployment: ReadyDeployment;
    wallet: Address;
    blockNumber: bigint;
  },
): Promise<{ result?: AccountTierResult; skipped?: string }> {
  const authenticity = await verifyTierAuthenticity(client, {
    deployment: input.deployment,
    tier: input.tier,
    blockNumber: input.blockNumber,
  });
  if (authenticity.status !== "verified") {
    return { skipped: `${input.tier}: ${authenticity.label}` };
  }

  try {
    const [name, tokenId, claimableReferral, owner] = await Promise.all([
      client.readContract({
        address: input.tier,
        abi: membershipTierAbi,
        functionName: "name",
        blockNumber: input.blockNumber,
      }),
      client.readContract({
        address: input.tier,
        abi: membershipTierAbi,
        functionName: "tokenOf",
        args: [input.wallet],
        blockNumber: input.blockNumber,
      }),
      client.readContract({
        address: input.tier,
        abi: membershipTierAbi,
        functionName: "claimableReferral",
        args: [input.wallet],
        blockNumber: input.blockNumber,
      }),
      client.readContract({
        address: input.tier,
        abi: membershipTierAbi,
        functionName: "owner",
        blockNumber: input.blockNumber,
      }),
    ]);
    const [active, claimableReward, creatorProceeds] = await Promise.all([
      tokenId === 0n
        ? false
        : client.readContract({
            address: input.tier,
            abi: membershipTierAbi,
            functionName: "isActiveToken",
            args: [tokenId],
            blockNumber: input.blockNumber,
          }),
      tokenId === 0n
        ? 0n
        : client.readContract({
            address: input.tier,
            abi: membershipTierAbi,
            functionName: "claimableReward",
            args: [tokenId],
            blockNumber: input.blockNumber,
          }),
      isSameAddress(owner, input.wallet)
        ? client.readContract({
            address: input.tier,
            abi: membershipTierAbi,
            functionName: "creatorProceeds",
            blockNumber: input.blockNumber,
          })
        : 0n,
    ]);
    const creatorOwned = isSameAddress(owner, input.wallet);
    if (
      !creatorOwned &&
      tokenId === 0n &&
      claimableReferral === 0n &&
      creatorProceeds === 0n
    ) {
      return {};
    }
    return {
      result: {
        tier: input.tier,
        name,
        creatorOwned,
        tokenId,
        active,
        claimableReward,
        claimableReferral,
        creatorProceeds,
      },
    };
  } catch (error) {
    return {
      skipped: `${input.tier}: ${
        error instanceof Error ? error.message : "claim reads unavailable"
      }`,
    };
  }
}

type BatchCandidate = {
  tier: Address;
  name: string;
  tokenId: bigint;
  claimableReferral: bigint;
  owner: Address;
};

type MulticallResult =
  { status: "success"; result: unknown } | { status: "failure" };

async function inspectTiersWithMulticall(
  client: PublicClient,
  input: {
    tiers: Address[];
    deployment: ReadyDeployment;
    protocolDependencies: ProtocolDependencySnapshot;
    wallet: Address;
    blockNumber: bigint;
  },
) {
  const interfaceIds = membershipInterfaces.map(({ id }) => id);
  const contracts = input.tiers.flatMap((tier) => [
    {
      address: input.deployment.factoryAddress,
      abi: robinhoodMembershipFactoryAbi,
      functionName: "isRegisteredTier" as const,
      args: [tier] as const,
    },
    {
      address: tier,
      abi: membershipTierAbi,
      functionName: "factory" as const,
    },
    {
      address: tier,
      abi: membershipTierAbi,
      functionName: "paymentToken" as const,
    },
    {
      address: tier,
      abi: membershipTierAbi,
      functionName: "renderer" as const,
    },
    {
      address: tier,
      abi: membershipTierAbi,
      functionName: "rendererVersion" as const,
    },
    {
      address: tier,
      abi: membershipTierAbi,
      functionName: "rendererRuntimeCodehash" as const,
    },
    ...interfaceIds.map((interfaceId) => ({
      address: tier,
      abi: membershipTierAbi,
      functionName: "supportsInterface" as const,
      args: [interfaceId] as const,
    })),
    { address: tier, abi: membershipTierAbi, functionName: "name" as const },
    {
      address: tier,
      abi: membershipTierAbi,
      functionName: "tokenOf" as const,
      args: [input.wallet] as const,
    },
    {
      address: tier,
      abi: membershipTierAbi,
      functionName: "claimableReferral" as const,
      args: [input.wallet] as const,
    },
    { address: tier, abi: membershipTierAbi, functionName: "owner" as const },
  ]);
  const reads = (await client.multicall({
    contracts,
    allowFailure: true,
    blockNumber: input.blockNumber,
    multicallAddress: multicall3Address,
  })) as MulticallResult[];
  const groupSize = 10 + interfaceIds.length;
  const candidates: BatchCandidate[] = [];
  const skipped: string[] = [];

  input.tiers.forEach((tier, index) => {
    const group = reads.slice(index * groupSize, (index + 1) * groupSize);
    if (
      group.length !== groupSize ||
      group.some((result) => result.status !== "success")
    ) {
      skipped.push(`${tier}: batched contract reads unavailable`);
      return;
    }
    const values = group.map((result) =>
      result.status === "success" ? result.result : undefined,
    );
    const registered = values[0];
    const tierFactory = values[1];
    const tierToken = values[2];
    const tierRenderer = values[3];
    const tierRendererVersion = values[4];
    const tierRendererRuntimeCodehash = values[5];
    const supported = values.slice(6, 6 + interfaceIds.length);
    const [name, tokenId, claimableReferral, owner] = values.slice(
      6 + interfaceIds.length,
    );
    const bindingFailures = tierBindingFailures({
      registered,
      tierFactory,
      tierToken,
      supportedInterfaces: supported,
      factory: input.deployment.factoryAddress,
      paymentToken: input.deployment.usdgAddress,
      tierRenderer,
      tierRendererVersion,
      tierRendererRuntimeCodehash,
      renderers: input.protocolDependencies.renderers,
    });
    if (
      bindingFailures.length > 0 ||
      typeof name !== "string" ||
      typeof tokenId !== "bigint" ||
      typeof claimableReferral !== "bigint" ||
      !isAddress(owner as string)
    ) {
      skipped.push(`${tier}: registration, bindings, or interfaces mismatch`);
      return;
    }
    candidates.push({
      tier,
      name,
      tokenId,
      claimableReferral,
      owner: getAddress(owner as string),
    });
  });

  const claims = new Map<
    Address,
    { active: boolean; claimableReward: bigint; creatorProceeds: bigint }
  >();
  const claimRequests: {
    tier: Address;
    field: "active" | "claimableReward" | "creatorProceeds";
    contract: Record<string, unknown>;
  }[] = [];
  for (const candidate of candidates) {
    claims.set(candidate.tier, {
      active: false,
      claimableReward: 0n,
      creatorProceeds: 0n,
    });
    if (candidate.tokenId !== 0n) {
      claimRequests.push(
        {
          tier: candidate.tier,
          field: "active",
          contract: {
            address: candidate.tier,
            abi: membershipTierAbi,
            functionName: "isActiveToken",
            args: [candidate.tokenId],
          },
        },
        {
          tier: candidate.tier,
          field: "claimableReward",
          contract: {
            address: candidate.tier,
            abi: membershipTierAbi,
            functionName: "claimableReward",
            args: [candidate.tokenId],
          },
        },
      );
    }
    if (isSameAddress(candidate.owner, input.wallet)) {
      claimRequests.push({
        tier: candidate.tier,
        field: "creatorProceeds",
        contract: {
          address: candidate.tier,
          abi: membershipTierAbi,
          functionName: "creatorProceeds",
        },
      });
    }
  }

  const failedClaims = new Set<Address>();
  if (claimRequests.length > 0) {
    const claimReads = (await client.multicall({
      contracts: claimRequests.map(({ contract }) => contract) as never,
      allowFailure: true,
      blockNumber: input.blockNumber,
      multicallAddress: multicall3Address,
    })) as MulticallResult[];
    claimRequests.forEach((request, index) => {
      const result = claimReads[index];
      const current = claims.get(request.tier)!;
      if (result?.status !== "success") {
        failedClaims.add(request.tier);
      } else if (
        request.field === "active" &&
        typeof result.result === "boolean"
      ) {
        current.active = result.result;
      } else if (
        request.field !== "active" &&
        typeof result.result === "bigint"
      ) {
        current[request.field] = result.result;
      } else {
        failedClaims.add(request.tier);
      }
    });
  }

  const results: AccountTierResult[] = [];
  for (const candidate of candidates) {
    if (failedClaims.has(candidate.tier)) {
      skipped.push(`${candidate.tier}: batched claim reads unavailable`);
      continue;
    }
    const claim = claims.get(candidate.tier)!;
    const creatorOwned = isSameAddress(candidate.owner, input.wallet);
    if (
      !creatorOwned &&
      candidate.tokenId === 0n &&
      candidate.claimableReferral === 0n &&
      claim.creatorProceeds === 0n
    ) {
      continue;
    }
    results.push({
      tier: candidate.tier,
      name: candidate.name,
      creatorOwned,
      tokenId: candidate.tokenId,
      active: claim.active,
      claimableReward: claim.claimableReward,
      claimableReferral: candidate.claimableReferral,
      creatorProceeds: claim.creatorProceeds,
    });
  }
  return { results, skipped };
}

export async function discoverAccountPage(
  client: PublicClient,
  input: {
    deployment: ReadyDeployment;
    wallet: Address;
    offset: bigint;
  },
): Promise<AccountDiscoveryPage> {
  const capturedBlock = await client.getBlockNumber({ cacheTime: 0 });
  const [page, multicallStatus] = await Promise.all([
    readCatalogPage(client, input.deployment.factoryAddress, {
      offset: input.offset,
      limit: accountDiscoveryPageLimit,
      blockNumber: capturedBlock,
    }),
    verifyMulticall3(client, capturedBlock),
  ]);
  const batch =
    multicallStatus === "verified"
      ? await readProtocolDependencies(
          client,
          input.deployment,
          page.capturedBlock,
        ).then((protocol) =>
          protocol.status === "valid"
            ? inspectTiersWithMulticall(client, {
                ...input,
                protocolDependencies: protocol.data,
                tiers: page.addresses,
                blockNumber: page.capturedBlock,
              })
            : undefined,
        )
      : undefined;
  const inspected: Awaited<ReturnType<typeof inspectTier>>[] = [];
  if (!batch) {
    for (const tier of page.addresses) {
      inspected.push(
        await inspectTier(client, {
          ...input,
          tier,
          blockNumber: page.capturedBlock,
        }),
      );
    }
  }
  return {
    capturedBlock: page.capturedBlock,
    total: page.total,
    offset: page.offset,
    scannedTo: page.offset + BigInt(page.addresses.length),
    nextOffset: page.nextOffset,
    scannedTiers: page.addresses,
    results:
      batch?.results ??
      inspected.flatMap(({ result }) => (result ? [result] : [])),
    skipped:
      batch?.skipped ??
      inspected.flatMap(({ skipped }) => (skipped ? [skipped] : [])),
  };
}
