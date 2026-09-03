"use client";

import { useRef, useState } from "react";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import type { Address } from "viem";

type CopyState = "idle" | "copied" | "unavailable";

export function CopyableAddress({
  address,
  explorerUrl,
  label,
}: {
  address: Address;
  explorerUrl?: string;
  label: string;
}) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const addressRef = useRef<HTMLSpanElement>(null);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setCopyState("copied");
    } catch {
      const selection = window.getSelection();
      if (selection && addressRef.current) {
        const range = document.createRange();
        range.selectNodeContents(addressRef.current);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      setCopyState("unavailable");
    }
  }

  const copyLabel = `Copy ${label.toLowerCase()} address`;

  return (
    <span className="copyable-address">
      <span className="copyable-address-line">
        <span className="font-mono" ref={addressRef}>
          {address}
        </span>
        <button
          aria-label={
            copyState === "copied"
              ? `${label} address copied`
              : copyState === "unavailable"
                ? `${label} address selected`
                : copyLabel
          }
          className="copyable-address-button"
          onClick={() => void copyAddress()}
          title={copyState === "copied" ? "Copied" : copyLabel}
          type="button"
        >
          {copyState === "copied" ? (
            <CheckIcon aria-hidden="true" size={17} weight="bold" />
          ) : (
            <CopyIcon aria-hidden="true" size={17} weight="regular" />
          )}
        </button>
      </span>
      {explorerUrl && (
        <a
          className="copyable-address-explorer"
          href={`${explorerUrl}/address/${address}`}
          rel="noreferrer"
          target="_blank"
        >
          View on explorer
        </a>
      )}
      <span aria-live="polite" className="sr-only">
        {copyState === "copied"
          ? `${label} address copied to the clipboard.`
          : copyState === "unavailable"
            ? `${label} address selected. Copy it manually.`
            : ""}
      </span>
    </span>
  );
}
