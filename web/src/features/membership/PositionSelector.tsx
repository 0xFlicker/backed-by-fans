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
  if (initialPage.balance === 0n) return null;

  return (
    <section
      className="membership-position-choice"
      aria-label="Membership selection"
      aria-busy={page.isFetching}
    >
      <div className="membership-position-actions">
        {initialPage.balance === 1n ? (
          selectedTokenId !== 0n ? (
            <span>Your membership #{selectedTokenId.toString()}</span>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => onSelect(initialPage.tokenIds[0])}
            >
              Back to your membership
            </button>
          )
        ) : (
          <label>
            <span>Your memberships</span>
            <select
              value={selectedTokenId.toString()}
              disabled={busy}
              onChange={(event) => onSelect(BigInt(event.target.value))}
            >
              <option value="0" disabled>
                Choose a membership
              </option>
              {selectedTokenId !== 0n &&
                !page.data?.tokenIds.includes(selectedTokenId) && (
                  <option value={selectedTokenId.toString()}>
                    Membership #{selectedTokenId.toString()}
                  </option>
                )}
              {page.data?.tokenIds.map((id) => (
                <option key={id.toString()} value={id.toString()}>
                  Membership #{id.toString()}
                </option>
              ))}
            </select>
          </label>
        )}
        {selectedTokenId !== 0n && (
          <button type="button" disabled={busy} onClick={() => onSelect(0n)}>
            Join again
          </button>
        )}
      </div>
      {page.isPending && <p role="status">Loading memberships…</p>}
      {page.error && (
        <p role="alert">
          {decodeTransactionError(page.error)}{" "}
          <button type="button" onClick={() => void page.refetch()}>
            Retry
          </button>
        </p>
      )}
      {(offset > 0n || (page.data && !page.data.complete)) && (
        <nav
          className="membership-position-pages"
          aria-label="Membership pages"
        >
          {offset > 0n && (
            <button
              type="button"
              disabled={busy || page.isFetching}
              onClick={() => setOffset(offset > 100n ? offset - 100n : 0n)}
            >
              Previous memberships
            </button>
          )}
          {page.data && <span>{page.data.balance.toString()} memberships</span>}
          {page.data && !page.data.complete && (
            <button
              type="button"
              disabled={busy || page.isFetching}
              onClick={() => page.data && setOffset(page.data.nextOffset)}
            >
              More memberships
            </button>
          )}
        </nav>
      )}
    </section>
  );
}
