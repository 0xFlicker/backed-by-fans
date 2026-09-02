import {
  parseEventLogs,
  zeroAddress,
  type Address,
  type PublicClient,
} from "viem";

import { membershipTierAbi } from "@/contracts";
import type { SuccessfulWriteReceipt } from "@/features/protocol/write-reconciliation";
import { isSameAddress } from "@/lib/address";
import { multicall3Address, verifyMulticall3 } from "@/lib/direct-read";

export const expiredMembershipScanPageSize = 100;
export const expiredMembershipSyncBatchSize = 100;

type AllowFailureResult =
  | { status: "success"; result: unknown }
  | { status: "failure"; error?: unknown };

export type ExpiredMembershipScanProgress = {
  scanned: bigint;
  total: bigint;
  expired: number;
};

export type ExpiredMembershipScan = ExpiredMembershipScanProgress & {
  capturedBlock: bigint;
  tokenIds: bigint[];
};

function tokenContracts(tier: Address, tokenIds: readonly bigint[]) {
  return tokenIds.flatMap((tokenId) => [
    {
      address: tier,
      abi: membershipTierAbi,
      functionName: "isOccupied",
      args: [tokenId],
    },
    {
      address: tier,
      abi: membershipTierAbi,
      functionName: "isActiveToken",
      args: [tokenId],
    },
  ]);
}

async function readTokenStates(
  client: PublicClient,
  input: {
    tier: Address;
    tokenIds: readonly bigint[];
    blockNumber?: bigint;
  },
) {
  const multicallStatus = await verifyMulticall3(
    client,
    input.blockNumber ?? (await client.getBlockNumber({ cacheTime: 0 })),
  );
  let results: AllowFailureResult[];
  if (multicallStatus === "verified") {
    results = (await client.multicall({
      contracts: tokenContracts(input.tier, input.tokenIds) as never,
      allowFailure: true,
      blockNumber: input.blockNumber,
      multicallAddress: multicall3Address,
    })) as AllowFailureResult[];
  } else {
    const pairs = await Promise.all(
      input.tokenIds.map(async (tokenId) => {
        const settled = await Promise.allSettled([
          client.readContract({
            address: input.tier,
            abi: membershipTierAbi,
            functionName: "isOccupied",
            args: [tokenId],
            blockNumber: input.blockNumber,
          }),
          client.readContract({
            address: input.tier,
            abi: membershipTierAbi,
            functionName: "isActiveToken",
            args: [tokenId],
            blockNumber: input.blockNumber,
          }),
        ]);
        return settled.map((result) =>
          result.status === "fulfilled"
            ? ({ status: "success", result: result.value } as const)
            : ({ status: "failure", error: result.reason } as const),
        );
      }),
    );
    results = pairs.flat();
  }
  if (results.length !== input.tokenIds.length * 2) {
    throw new Error("The membership scan returned an incomplete RPC response.");
  }

  return input.tokenIds.map((tokenId, index) => {
    const occupiedResult = results[index * 2];
    const activeResult = results[index * 2 + 1];
    if (
      occupiedResult.status !== "success" ||
      activeResult.status !== "success"
    ) {
      throw new Error(`Membership #${tokenId} could not be verified.`);
    }
    const occupied = occupiedResult.result as boolean;
    const active = activeResult.result as boolean;
    if (!occupied) {
      if (active)
        throw new Error(`Membership #${tokenId} returned inconsistent state.`);
      return { tokenId, minted: false, active: false } as const;
    }
    return {
      tokenId,
      minted: true,
      active,
    } as const;
  });
}

export async function scanExpiredMemberships(
  client: PublicClient,
  input: {
    tier: Address;
    totalMinted: bigint;
    capturedBlock: bigint;
    onProgress?: (progress: ExpiredMembershipScanProgress) => void;
  },
): Promise<ExpiredMembershipScan> {
  const tokenIds: bigint[] = [];
  let scanned = 0n;

  while (scanned < input.totalMinted) {
    const remaining = input.totalMinted - scanned;
    const length = Number(
      remaining > BigInt(expiredMembershipScanPageSize)
        ? BigInt(expiredMembershipScanPageSize)
        : remaining,
    );
    const page = Array.from(
      { length },
      (_, index) => scanned + BigInt(index) + 1n,
    );
    const states = await readTokenStates(client, {
      tier: input.tier,
      tokenIds: page,
      blockNumber: input.capturedBlock,
    });
    for (const state of states) {
      if (state.minted && !state.active) tokenIds.push(state.tokenId);
    }
    scanned += BigInt(length);
    input.onProgress?.({
      scanned,
      total: input.totalMinted,
      expired: tokenIds.length,
    });
  }

  return {
    capturedBlock: input.capturedBlock,
    scanned,
    total: input.totalMinted,
    expired: tokenIds.length,
    tokenIds,
  };
}

export async function reconcileExpiredMembershipSync(
  client: PublicClient,
  input: {
    tier: Address;
    tokenIds: readonly bigint[];
    receipt: SuccessfulWriteReceipt;
  },
) {
  const requested = new Set(input.tokenIds.map(String));
  const synchronizedEvents = parseEventLogs({
    abi: membershipTierAbi,
    eventName: "ExpiredMembershipSynchronized",
    logs: input.receipt.logs,
    strict: true,
  }).filter((event) => isSameAddress(event.address, input.tier));
  const burnEvents = parseEventLogs({
    abi: membershipTierAbi,
    eventName: "Transfer",
    logs: input.receipt.logs,
    strict: true,
  }).filter(
    (event) =>
      isSameAddress(event.address, input.tier) &&
      isSameAddress(event.args.to, zeroAddress),
  );
  const burnedInReceipt = new Set(
    burnEvents.map((event) => String(event.args.tokenId)),
  );
  if (
    synchronizedEvents.some(
      (event) =>
        !requested.has(String(event.args.tokenId)) ||
        !burnedInReceipt.has(String(event.args.tokenId)),
    )
  ) {
    return undefined;
  }

  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  const states = await readTokenStates(client, {
    tier: input.tier,
    tokenIds: input.tokenIds,
    blockNumber,
  });
  const burnedIds: bigint[] = [];
  const renewedIds: bigint[] = [];
  for (const state of states) {
    if (!state.minted) burnedIds.push(state.tokenId);
    else if (state.active) renewedIds.push(state.tokenId);
    else return undefined;
  }
  return { blockNumber, burnedIds, renewedIds };
}
