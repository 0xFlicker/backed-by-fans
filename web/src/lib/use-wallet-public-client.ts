"use client";

import { useMemo } from "react";
import { publicActions, type PublicClient } from "viem";
import { useConnectorClient } from "wagmi";

import type { SupportedChainId } from "@/lib/chains";
import { useHydratedAccount } from "@/lib/use-hydrated-account";

export function useWalletPublicClient(chainId: SupportedChainId) {
  const account = useHydratedAccount();
  const walletReady = account.isConnected && account.chainId === chainId;
  const connectorClient = useConnectorClient({
    chainId,
    query: { enabled: walletReady },
  });

  return useMemo(
    () =>
      walletReady && connectorClient.data
        ? (connectorClient.data.extend(
            publicActions,
          ) as unknown as PublicClient)
        : undefined,
    [connectorClient.data, walletReady],
  );
}
