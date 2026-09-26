"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { getAddress } from "viem";
import { isNonZeroAddress } from "@/lib/address";
import type { SupportedChainId } from "@/lib/chains";

export function WalletLookup({ chainId }: { chainId: SupportedChainId }) {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = address.trim();
    if (!isNonZeroAddress(value)) {
      setError("Enter a valid, nonzero wallet address.");
      return;
    }
    setError("");
    router.push(`/chains/${chainId}/wallets/${getAddress(value)}` as Route);
  }

  return (
    <form className="wallet-lookup" onSubmit={submit}>
      <label className="creator-field">
        <span>Wallet address</span>
        <input
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "wallet-lookup-error" : undefined}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          placeholder="0x…"
          required
          value={address}
          onChange={(event) => {
            setAddress(event.target.value);
            setError("");
          }}
        />
      </label>
      <button className="button button-outline" type="submit">
        View wallet
      </button>
      {error && (
        <p id="wallet-lookup-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
