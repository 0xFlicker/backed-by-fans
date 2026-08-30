import "server-only";

import { createPublicClient, http, type PublicClient } from "viem";

import { getSupportedChain, type SupportedChainId } from "@/lib/chains";
import { publicConfig } from "@/lib/config";
import { resolveServerRpcUrl } from "@/lib/server-rpc-config";

export function getServerPublicClient(chainId: SupportedChainId): PublicClient {
  const rpcUrl = resolveServerRpcUrl(
    {
      mainnetRpcUrl: process.env.ROBINHOOD_MAINNET_RPC_URL,
      testnetRpcUrl: process.env.ROBINHOOD_TESTNET_RPC_URL,
      anvilRpcUrl: publicConfig.anvilRpcUrl,
    },
    chainId,
  );

  return createPublicClient({
    chain: getSupportedChain(chainId),
    transport: http(rpcUrl),
  }) as PublicClient;
}
