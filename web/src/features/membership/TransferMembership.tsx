"use client";
import { useEffect, useId, useState } from "react";
import { getAddress, type Address } from "viem";
import { isNonZeroAddress } from "@/lib/address";

export function TransferMembership({
  tokenId,
  expiration,
  asOf,
  canOperate,
  pending,
  onTransfer,
}: {
  tokenId: bigint;
  expiration: bigint;
  asOf: bigint;
  canOperate: boolean;
  pending: boolean;
  onTransfer: (recipient: Address) => Promise<unknown>;
}) {
  const id = useId();
  const [recipient, setRecipient] = useState("");
  const [confirmedRecipient, setConfirmedRecipient] = useState("");
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
  return (
    <section
      className="control-group membership-transfer"
      aria-label={`Transfer membership #${tokenId}`}
      aria-busy={pending}
    >
      <div className="membership-transfer-intro">
        <h2>Transfer membership #{tokenId.toString()}</h2>
        <p>
          Remaining time, membership benefits and unclaimed member rewards go to
          the recipient. Weight, funding history and the locked referral choice
          stay with this token.
        </p>
        <p>
          Live memberships can transfer while the tier is paused or accounting
          is incomplete.
        </p>
      </div>
      {!live && (
        <p role="status">This membership has expired and cannot transfer.</p>
      )}
      <div className="creator-field">
        <label htmlFor={`${id}-recipient`}>Transfer recipient wallet</label>
        <input
          id={`${id}-recipient`}
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
          disabled={pending}
          aria-invalid={Boolean(recipient) && !recipientValid}
          aria-describedby={`${id}-recipient-help`}
        />
        <span className="field-hint" id={`${id}-recipient-help`}>
          {recipient && !recipientValid
            ? "Enter a nonzero wallet or receiving-contract address."
            : "Receiving contracts must accept safe ERC-721 transfers."}
        </span>
      </div>
      <label className="membership-transfer-confirmation">
        <input
          type="checkbox"
          disabled={pending || !recipientValid || !live}
          checked={recipientValid && confirmedRecipient === recipient.trim()}
          onChange={(event) =>
            setConfirmedRecipient(event.target.checked ? recipient.trim() : "")
          }
        />
        <span>
          I confirm I will transfer the entire membership #{tokenId.toString()}{" "}
          to {recipientValid ? recipient.trim() : "the recipient"}.
        </span>
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
    </section>
  );
}
