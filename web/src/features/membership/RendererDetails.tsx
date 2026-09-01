"use client";

import { useState } from "react";
import type { Address } from "viem";

type CopyState = "idle" | "copied" | "unavailable";

const copyPresentation: Record<
  CopyState,
  { button: string; guidance: string }
> = {
  idle: { button: "Copy renderer address", guidance: "" },
  copied: {
    button: "Renderer address copied",
    guidance: "Paste it into the renderer field for another membership.",
  },
  unavailable: {
    button: "Copy unavailable",
    guidance: "Select the address above and copy it manually.",
  },
};

function chainName(chainId: number) {
  if (chainId === 46_630) return "Robinhood Chain Testnet";
  if (chainId === 31_337) return "local Anvil";
  return "Robinhood Chain";
}

export function RendererDetails({
  chainId,
  renderer,
}: {
  chainId: number;
  renderer: Address;
}) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const copy = copyPresentation[copyState];

  async function copyRendererAddress() {
    try {
      await navigator.clipboard.writeText(renderer);
      setCopyState("copied");
    } catch {
      setCopyState("unavailable");
    }
  }

  return (
    <details className="membership-reference">
      <summary>Reuse this artwork</summary>
      <p>
        Copy the renderer address to try this artwork when creating another
        membership on the same network. This address is on {chainName(chainId)}.
      </p>
      <dl aria-label="Renderer details">
        <div>
          <dt>Renderer address</dt>
          <dd className="font-mono">{renderer}</dd>
        </div>
      </dl>
      <button
        className="text-button"
        onClick={() => void copyRendererAddress()}
        type="button"
      >
        {copy.button}
      </button>
      <span aria-live="polite" className="small-copy">
        {copy.guidance}
      </span>
    </details>
  );
}
