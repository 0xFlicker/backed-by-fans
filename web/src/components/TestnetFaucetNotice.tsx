"use client";

import { useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { robinhoodTestnet } from "viem/chains";
import { useActiveNetwork } from "@/lib/use-active-network";

const subscribe = () => () => undefined;

export function TestnetFaucetNotice() {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [dismissed, setDismissed] = useState(false);
  const pathname = usePathname();
  const { chainId } = useActiveNetwork();
  const routeChain = pathname.match(/^\/chains\/(\d+)(?:\/|$)/)?.[1];
  const pageChainId = routeChain ? Number(routeChain) : chainId;

  if (!hydrated || dismissed || pageChainId !== robinhoodTestnet.id)
    return null;

  return (
    <aside
      className="testnet-faucet-notice"
      aria-labelledby="testnet-faucet-title"
    >
      <button
        className="testnet-faucet-dismiss"
        type="button"
        aria-label="Dismiss testnet notice"
        onClick={() => setDismissed(true)}
      >
        <span aria-hidden="true">×</span>
      </button>
      <h2 id="testnet-faucet-title">Trying out testnet?</h2>
      <p>Get free test coins from the Robinhood faucet to get started.</p>
      <a
        href="https://faucet.testnet.chain.robinhood.com/"
        target="_blank"
        rel="noopener noreferrer"
      >
        Get test coins <span aria-hidden="true">↗</span>
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </aside>
  );
}
