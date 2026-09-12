"use client";
import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { getAddress, zeroAddress, type Address } from "viem";
import { membershipTierAbi } from "@/contracts";
import { isNonZeroAddress } from "@/lib/address";
import { decodeTransactionError } from "@/lib/transaction-state";
import type { SupportedChainId } from "@/lib/chains";

export function TransferMembership({
  chainId,
  tier,
  tokenId,
  owner,
  expiration,
  asOf,
  canOperate,
  pending,
  onTransfer,
  onApprove,
  onOperatorApproval,
}: {
  chainId: SupportedChainId;
  tier: Address;
  tokenId: bigint;
  owner: Address;
  expiration: bigint;
  asOf: bigint;
  canOperate: boolean;
  pending: boolean;
  onTransfer: (recipient: Address) => Promise<unknown>;
  onApprove: (spender: Address) => Promise<unknown>;
  onOperatorApproval: (
    operator: Address,
    approved: boolean,
  ) => Promise<unknown>;
}) {
  const client = usePublicClient({ chainId });
  const id = useId();
  const [recipient, setRecipient] = useState("");
  const [confirmedRecipient, setConfirmedRecipient] = useState("");
  const [spender, setSpender] = useState("");
  const [operator, setOperator] = useState("");
  const [clock, setClock] = useState({ asOf, now: asOf });
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(
      () =>
        setClock({
          asOf,
          now: asOf + BigInt(Math.floor((Date.now() - start) / 1000)),
        }),
      1000,
    );
    return () => clearInterval(timer);
  }, [asOf]);
  const now = clock.asOf === asOf ? clock.now : asOf;
  const live = now < expiration;
  const recipientValid = isNonZeroAddress(recipient.trim());
  const spenderValid = isNonZeroAddress(spender.trim());
  const operatorValid =
    isNonZeroAddress(operator.trim()) &&
    operator.toLowerCase() !== owner.toLowerCase();
  const tokenApproval = useQuery({
    queryKey: ["nft-token-approval", chainId, tier, tokenId.toString(), owner],
    enabled: Boolean(client),
    retry: false,
    queryFn: () =>
      client!.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "getApproved",
        args: [tokenId],
      }),
  });
  const operatorApproval = useQuery({
    queryKey: ["nft-operator-approval", chainId, tier, owner, operator.trim()],
    enabled: Boolean(client) && operatorValid,
    retry: false,
    queryFn: () =>
      client!.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "isApprovedForAll",
        args: [owner, getAddress(operator.trim())],
      }),
  });
  return (
    <section
      className="control-group membership-transfer"
      aria-label={`Transfer membership #${tokenId}`}
      aria-busy={pending}
    >
      <h2>Transfer membership #{tokenId.toString()}</h2>
      <p>
        Remaining time, membership benefits and unclaimed member rewards go to
        the recipient. Weight, funding history and the locked referral choice
        stay with this token.
      </p>
      <p>
        Live memberships can transfer while the tier is paused or accounting is
        incomplete.
      </p>
      {!live && (
        <p role="status">This membership has expired and cannot transfer.</p>
      )}
      <label className="creator-field">
        <span>Transfer recipient wallet</span>
        <input
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
          disabled={pending}
          aria-invalid={Boolean(recipient) && !recipientValid}
          aria-describedby={`${id}-recipient-help`}
        />
      </label>
      <p id={`${id}-recipient-help`}>
        {recipient && !recipientValid
          ? "Enter a nonzero wallet or receiving-contract address."
          : "Receiving contracts must accept safe ERC-721 transfers."}
      </p>
      <label>
        <input
          type="checkbox"
          disabled={pending || !recipientValid || !live}
          checked={recipientValid && confirmedRecipient === recipient.trim()}
          onChange={(event) =>
            setConfirmedRecipient(event.target.checked ? recipient.trim() : "")
          }
        />
        I confirm I will transfer the entire membership #{tokenId.toString()} to{" "}
        {recipientValid ? recipient.trim() : "the recipient"}.
      </label>
      <button
        className="button button-outline"
        type="button"
        disabled={
          !canOperate ||
          pending ||
          !live ||
          !recipientValid ||
          confirmedRecipient !== recipient.trim()
        }
        onClick={() => void onTransfer(getAddress(recipient.trim()))}
      >
        Transfer membership #{tokenId.toString()}
      </button>
      <details>
        <summary>NFT transfer approvals</summary>
        <p>
          These approvals only authorize NFT transfers. They do not authorize
          reward claims or renewal. Payment-token allowance is separate.
        </p>
        {tokenApproval.isPending && (
          <p role="status">Loading token approval…</p>
        )}
        {tokenApproval.error && (
          <p role="alert">
            {decodeTransactionError(tokenApproval.error)}{" "}
            <button type="button" onClick={() => void tokenApproval.refetch()}>
              Retry token approval
            </button>
          </p>
        )}
        {tokenApproval.data && (
          <p>
            Current approved address:{" "}
            {tokenApproval.data === zeroAddress ? "None" : tokenApproval.data}
          </p>
        )}
        <label className="creator-field">
          <span>Token transfer delegate</span>
          <input
            value={spender}
            disabled={pending}
            onChange={(event) => setSpender(event.target.value)}
            aria-invalid={Boolean(spender) && !spenderValid}
          />
        </label>
        <button
          type="button"
          disabled={!canOperate || pending || !spenderValid}
          onClick={() =>
            void onApprove(getAddress(spender.trim())).then(() =>
              tokenApproval.refetch(),
            )
          }
        >
          Approve token transfer
        </button>
        <button
          type="button"
          disabled={
            !canOperate ||
            pending ||
            !tokenApproval.data ||
            tokenApproval.data === zeroAddress ||
            tokenApproval.isError
          }
          onClick={() =>
            void onApprove(zeroAddress).then(() => tokenApproval.refetch())
          }
        >
          Revoke token transfer approval
        </button>
        <label className="creator-field">
          <span>Operator address</span>
          <input
            value={operator}
            disabled={pending}
            onChange={(event) => setOperator(event.target.value)}
            aria-invalid={Boolean(operator) && !operatorValid}
            aria-describedby={`${id}-operator-help`}
          />
        </label>
        <p id={`${id}-operator-help`}>
          An operator may transfer every membership you own in this tier,
          including future positions. Enter its address to check or change
          permission.
        </p>
        {operatorValid && operatorApproval.isPending && (
          <p role="status">Checking operator permission…</p>
        )}
        {operatorApproval.error && (
          <p role="alert">
            {decodeTransactionError(operatorApproval.error)}{" "}
            <button
              type="button"
              onClick={() => void operatorApproval.refetch()}
            >
              Retry operator permission
            </button>
          </p>
        )}
        {operatorValid && operatorApproval.data !== undefined && (
          <p>
            {operatorApproval.data
              ? "Operator transfer permission is enabled."
              : "Operator transfer permission is disabled."}
          </p>
        )}
        <button
          type="button"
          disabled={
            !canOperate ||
            pending ||
            !operatorValid ||
            operatorApproval.isPending ||
            operatorApproval.isError
          }
          onClick={() =>
            void onOperatorApproval(
              getAddress(operator.trim()),
              !operatorApproval.data,
            ).then(() => operatorApproval.refetch())
          }
        >
          {operatorApproval.data
            ? "Revoke operator transfer permission"
            : "Approve operator transfers"}
        </button>
      </details>
    </section>
  );
}
