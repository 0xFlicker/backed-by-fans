"use client";

import { useEffect, type ReactNode } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";

import { getSupportedChain, type SupportedChainId } from "@/lib/chains";

export function ChainRouteBoundary({
  chainId,
  children,
}: {
  chainId: SupportedChainId;
  children: ReactNode;
}) {
  const account = useAccount();
  const selectedChainId = useChainId();
  const activeChainId =
    account.isConnected && account.chainId !== undefined
      ? account.chainId
      : selectedChainId;
  const switchChain = useSwitchChain();
  const mismatch = activeChainId !== chainId;

  useEffect(() => {
    if (!account.isConnected && mismatch) {
      switchChain.switchChain({ chainId });
    }
  }, [account.isConnected, chainId, mismatch, switchChain]);

  return (
    <>
      {account.isConnected && mismatch && (
        <aside className="inline-status" role="status">
          This link is for {getSupportedChain(chainId).name}.{" "}
          <button
            className="text-button"
            disabled={switchChain.isPending}
            onClick={() => switchChain.switchChain({ chainId })}
            type="button"
          >
            Switch wallet network
          </button>
        </aside>
      )}
      {switchChain.error && (
        <p className="inline-status" role="alert">
          Network switch rejected. This page remains bound to{" "}
          {getSupportedChain(chainId).name}, and writes stay disabled until the
          wallet matches it.
        </p>
      )}
      {children}
    </>
  );
}
