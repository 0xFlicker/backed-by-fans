"use client";

import type { Address } from "viem";

import type {
  AcceptedPaymentToken,
  AcceptedPaymentTokenReadState,
} from "@/lib/payment-token-read";
import { formatRawTokenAmount } from "@/lib/token-amount";

function balanceLabel(token: AcceptedPaymentToken) {
  if (token.walletRawBalance === undefined) return undefined;
  return `${formatRawTokenAmount({
    raw: token.walletRawBalance,
    decimals: token.decimals,
    multiplier: token.uiMultiplier,
  })} ${token.symbol}`;
}

export function PaymentTokenPicker({
  state,
  selected,
  onSelect,
  onRetry,
}: {
  state?: AcceptedPaymentTokenReadState;
  selected?: Address;
  onSelect: (address: Address) => void;
  onRetry: () => void;
}) {
  if (!state) return <p role="status">Loading payment tokens...</p>;

  if (state.status === "rate-limited" || state.status === "unavailable") {
    return (
      <div className="payment-token-notice" role="alert">
        <p>{state.label}</p>
        <button
          className="button button-outline"
          onClick={onRetry}
          type="button"
        >
          Try again
        </button>
      </div>
    );
  }

  const enabled = state.data.filter((token) => token.enabled);
  return (
    <div className="payment-token-picker">
      {enabled.length === 0 ? (
        <p role="alert">No payment tokens are available for new memberships.</p>
      ) : (
        <div
          aria-label="Payment token"
          className="payment-token-options"
          role="radiogroup"
        >
          {enabled.map((token) => {
            const checked =
              selected?.toLowerCase() === token.address.toLowerCase();
            const balance = balanceLabel(token);
            return (
              <label
                className="payment-token-option"
                data-selected={checked}
                key={token.address}
              >
                <input
                  checked={checked}
                  name="payment-token"
                  onChange={() => onSelect(token.address)}
                  type="radio"
                  value={token.address}
                />
                <span>
                  <strong>{token.symbol}</strong>
                  <small>{token.name}</small>
                </span>
                {balance ? (
                  <span className="payment-token-balance">{balance}</span>
                ) : null}
              </label>
            );
          })}
        </div>
      )}
      {state.failures.length > 0 ? (
        <div className="payment-token-notice" role="status">
          <p>
            {state.failures.length === 1
              ? "One payment token could not be loaded."
              : `${state.failures.length} payment tokens could not be loaded.`}
          </p>
          <button
            className="button button-outline"
            onClick={onRetry}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}
