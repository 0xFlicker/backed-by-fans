import {
  parseEventLogs,
  BaseError,
  ContractFunctionRevertedError,
  type Address,
  type Log,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import type { QueryClient } from "@tanstack/react-query";
import { membershipTierAbi } from "@/contracts";
import { isSameAddress } from "@/lib/address";

import {
  decodeTransactionError,
  type TransactionEvent,
} from "@/lib/transaction-state";

export type SuccessfulWriteReceipt = TransactionReceipt & {
  status: "success";
};

export type SuccessfulReceiptLogs = { logs: Log[] };

export async function reconcileMembershipTransfer(
  client: PublicClient,
  receipt: SuccessfulWriteReceipt,
  input: { tier: Address; tokenId: bigint; from: Address; to: Address },
) {
  const transferred = parseEventLogs({
    abi: membershipTierAbi,
    eventName: "Transfer",
    logs: receipt.logs,
    strict: true,
  }).some(
    (event) =>
      isSameAddress(event.address, input.tier) &&
      event.args.tokenId === input.tokenId &&
      isSameAddress(event.args.from, input.from) &&
      isSameAddress(event.args.to, input.to),
  );
  if (!transferred) return undefined;
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  const common = {
    address: input.tier,
    abi: membershipTierAbi,
    blockNumber,
  } as const;
  let currentOwner: Address | undefined;
  try {
    currentOwner = await client.readContract({
      ...common,
      functionName: "ownerOf",
      args: [input.tokenId],
    });
  } catch (error) {
    const cause =
      error instanceof BaseError
        ? error.walk((item) => item instanceof ContractFunctionRevertedError)
        : undefined;
    if (
      !(cause instanceof ContractFunctionRevertedError) ||
      cause.data?.errorName !== "ERC721NonexistentToken"
    )
      throw error;
  }
  const [active, formerOwnerPage, recipientPage] = await Promise.all([
    client.readContract({
      ...common,
      functionName: "isActiveToken",
      args: [input.tokenId],
    }),
    client.readContract({
      ...common,
      functionName: "tokensOfOwner",
      args: [input.from, 0n, 100n],
    }),
    client.readContract({
      ...common,
      functionName: "tokensOfOwner",
      args: [input.to, 0n, 100n],
    }),
  ]);
  return {
    recipient: input.to,
    currentOwner,
    active,
    formerOwnerPage,
    recipientPage,
    blockNumber,
  };
}

/** Invalidate both ownership and beneficiary views only after a successful supplied receipt. */
export async function invalidateMembershipReads(
  queries: QueryClient,
  receipt: SuccessfulWriteReceipt,
  input: { chainId: number; tier: Address; owners: Address[] },
) {
  const owners = new Set(input.owners.map((owner) => owner.toLowerCase()));
  for (const event of parseEventLogs({
    abi: membershipTierAbi,
    eventName: "Transfer",
    logs: receipt.logs,
    strict: true,
  })) {
    if (isSameAddress(event.address, input.tier)) {
      owners.add(event.args.from.toLowerCase());
      owners.add(event.args.to.toLowerCase());
    }
  }
  for (const event of parseEventLogs({
    abi: membershipTierAbi,
    eventName: "PaymentProcessed",
    logs: receipt.logs,
    strict: true,
  })) {
    if (isSameAddress(event.address, input.tier))
      owners.add(event.args.recipient.toLowerCase());
  }
  await queries.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      if (key[0] === "account-discovery")
        return [...owners].some(
          (owner) =>
            String(key[1]).toLowerCase().includes(`:${input.chainId}:`) &&
            String(key[1]).toLowerCase().endsWith(`:${owner}`),
        );
      if (key[1] !== input.chainId) return false;
      if (key[0] === "account-rewards")
        return owners.has(String(key[3]).toLowerCase());
      return (
        [
          "tier-supporter",
          "owner-positions",
          "membership-earnings",
          "retired-credit",
          "nft-token-approval",
          "nft-operator-approval",
        ].includes(String(key[0])) &&
        String(key[2]).toLowerCase() === input.tier.toLowerCase()
      );
    },
  });
}

export function isSuccessfulWriteReceipt(
  receipt: TransactionReceipt,
): receipt is SuccessfulWriteReceipt {
  return receipt.status === "success";
}

/**
 * Application reconciliation starts only after wagmi/viem returns a successful
 * receipt. It may inspect that receipt and refresh canonical domain reads; it
 * never looks up, polls for, or reconstructs a transaction outcome.
 */
export async function reconcileSuccessfulWrite<Result>(input: {
  receipt: SuccessfulWriteReceipt;
  reconcile: (receipt: SuccessfulWriteReceipt) => Promise<Result | undefined>;
  dispatch: (event: TransactionEvent) => void;
}): Promise<Result | undefined> {
  input.dispatch({ type: "RECONCILE" });
  try {
    const result = await input.reconcile(input.receipt);
    if (result === undefined) {
      input.dispatch({
        type: "UNCERTAIN",
        error:
          "The transaction receipt succeeded, but the expected onchain result is not visible in the latest direct read.",
      });
      return undefined;
    }
    input.dispatch({ type: "RECONCILED" });
    return result;
  } catch (error) {
    input.dispatch({
      type: "UNCERTAIN",
      error: `The transaction receipt succeeded, but the updated onchain state could not be verified. ${decodeTransactionError(error)}`,
    });
    return undefined;
  }
}
