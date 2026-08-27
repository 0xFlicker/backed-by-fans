"use client";

import { useAccount, useChainId, usePublicClient } from "wagmi";

import { getSupportedChain, isSupportedChainId } from "@/lib/chains";
import { getDeployment, publicConfig } from "@/lib/config";

export function useActiveNetwork() {
  const account = useAccount();
  const selectedChainId = useChainId();
  const chainId =
    account.isConnected && account.chainId !== undefined
      ? account.chainId
      : selectedChainId;
  const clientChainId = isSupportedChainId(chainId)
    ? chainId
    : publicConfig.defaultChainId;
  const client = usePublicClient({ chainId: clientChainId });

  return {
    chainId,
    clientChainId,
    chain: isSupportedChainId(chainId) ? getSupportedChain(chainId) : undefined,
    client,
    deployment: getDeployment(publicConfig, chainId),
  };
}
