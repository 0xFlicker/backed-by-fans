"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useChainId, useSwitchChain } from "wagmi";

import {
  getSupportedChain,
  isSupportedChainId,
  publicChains,
  localAnvil,
} from "@/lib/chains";
import { publicConfig } from "@/lib/config";

export function WalletControl() {
  const account = useAccount();
  const selectedChainId = useChainId();
  const chainId =
    account.isConnected && account.chainId !== undefined
      ? account.chainId
      : selectedChainId;
  const switchChain = useSwitchChain();
  const chains = publicConfig.anvilRpcUrl
    ? [...publicChains, localAnvil]
    : [...publicChains];
  const activeChain = isSupportedChainId(chainId)
    ? getSupportedChain(chainId)
    : undefined;

  return (
    <div className="wallet-control">
      <label className="network-selector">
        <span className="sr-only">Membership network</span>
        <select
          aria-label="Membership network"
          onChange={(event) => {
            const nextChainId = Number(event.target.value);
            if (isSupportedChainId(nextChainId)) {
              switchChain.switchChain({ chainId: nextChainId });
            }
          }}
          value={activeChain?.id ?? ""}
        >
          {!activeChain && <option value="">Unsupported network</option>}
          {chains.map((chain) => (
            <option key={chain.id} value={chain.id}>
              {chain.name}
            </option>
          ))}
        </select>
      </label>
      {activeChain?.testnet && <span className="testnet-badge">Testnet</span>}
      <ConnectButton.Custom>
        {({
          account,
          chain,
          mounted,
          openAccountModal,
          openChainModal,
          openConnectModal,
        }) => {
          const ready = mounted;
          const connected = ready && account && chain;

          if (!connected) {
            return (
              <button
                className="button button-small button-dark"
                disabled={!ready}
                onClick={openConnectModal}
                type="button"
              >
                Connect wallet
              </button>
            );
          }

          if (chain.unsupported) {
            return (
              <button
                className="button button-small button-warning"
                onClick={openChainModal}
                type="button"
              >
                <span aria-hidden="true">!</span> Wrong network
              </button>
            );
          }

          return (
            <button
              className="button button-small button-dark font-mono"
              onClick={openAccountModal}
              type="button"
            >
              {account.displayName}
            </button>
          );
        }}
      </ConnectButton.Custom>
      {switchChain.error && (
        <span className="network-error" role="alert">
          Network switch rejected. Your current network was preserved.
        </span>
      )}
    </div>
  );
}
