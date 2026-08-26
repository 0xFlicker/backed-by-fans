"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

export function WalletControl() {
  return (
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
  );
}
