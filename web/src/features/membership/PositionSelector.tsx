"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import { membershipTierAbi } from "@/contracts";
import type { TierSupporterSnapshot } from "@/contracts/types";
import type { SupportedChainId } from "@/lib/chains";
import { decodeTransactionError } from "@/lib/transaction-state";

export function PositionSelector({
  chainId,
  tier,
  owner,
  blockNumber,
  initialPage,
  selectedTokenId,
  onSelect,
  busy,
}: {
  chainId: SupportedChainId;
  tier: Address;
  owner: Address;
  blockNumber: bigint;
  initialPage: NonNullable<TierSupporterSnapshot["ownerPage"]>;
  selectedTokenId: bigint;
  onSelect: (id: bigint) => void;
  busy: boolean;
}) {
  const client = usePublicClient({ chainId });
  const [offset, setOffset] = useState(0n);
  const page = useQuery({
    queryKey: [
      "owner-positions",
      chainId,
      tier,
      owner,
      blockNumber.toString(),
      offset.toString(),
    ],
    initialData: offset === 0n ? initialPage : undefined,
    queryFn: () => {
      if (!client) throw new Error("The network is unavailable.");
      return client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "tokensOfOwner",
        args: [owner, offset, 100n],
        blockNumber,
      });
    },
    staleTime: Infinity,
    retry: false,
  });
  return (
    <section
      className="control-group"
      aria-label="Membership selection"
      aria-busy={page.isFetching}
    >
      <label className="creator-field">
        <span>Membership action</span>
        <select
          value={selectedTokenId.toString()}
          disabled={busy}
          onChange={(event) => onSelect(BigInt(event.target.value))}
        >
          <option value="0">New membership</option>
          {selectedTokenId !== 0n &&
            !page.data?.tokenIds.includes(selectedTokenId) && (
              <option value={selectedTokenId.toString()}>
                Selected membership #{selectedTokenId.toString()}
              </option>
            )}
          {page.data?.tokenIds.map((id) => (
            <option key={id.toString()} value={id.toString()}>
              Membership #{id.toString()}
            </option>
          ))}
        </select>
      </label>
      <p>
        New membership creates an independent position. Select an existing ID to
        view or renew it.
      </p>
      {page.isPending && <p role="status">Loading memberships…</p>}
      {page.error && (
        <p role="alert">
          {decodeTransactionError(page.error)}{" "}
          <button type="button" onClick={() => void page.refetch()}>
            Retry
          </button>
        </p>
      )}
      {page.data && (
        <p>
          {page.data.balance === 0n
            ? "No memberships in this wallet."
            : `Showing ${page.data.tokenIds.length} of ${page.data.balance} memberships. ${page.data.complete ? "End of this snapshot." : "More memberships are available."}`}
        </p>
      )}
      <div className="button-row">
        <button
          type="button"
          className="button button-outline"
          disabled={busy || page.isFetching || offset === 0n}
          onClick={() => setOffset(offset > 100n ? offset - 100n : 0n)}
        >
          Previous memberships
        </button>
        <button
          type="button"
          className="button button-outline"
          disabled={busy || page.isFetching || !page.data || page.data.complete}
          onClick={() => page.data && setOffset(page.data.nextOffset)}
        >
          More memberships
        </button>
      </div>
    </section>
  );
}
