"use client";

import { useMemo } from "react";
import { publicActions, type PublicClient } from "viem";
import { useConnectorClient } from "wagmi";

import type { SupportedChainId } from "@/lib/chains";

export function useWalletPublicClient(chainId: SupportedChainId) {
  const connectorClient = useConnectorClient({ chainId });

  return useMemo(
    () =>
      connectorClient.data
        ? (connectorClient.data.extend(
            publicActions,
          ) as unknown as PublicClient)
        : undefined,
    [connectorClient.data],
  );
}
