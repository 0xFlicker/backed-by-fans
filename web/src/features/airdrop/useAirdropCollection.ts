"use client";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import type { SupportedChainId } from "@/lib/chains";
import { inspectCollection } from "./collection";

export function useAirdropCollection(
  chainId: SupportedChainId,
  collection?: Address,
  helper?: Address,
) {
  const client = usePublicClient({ chainId });
  return useQuery({
    queryKey: ["airdrop-collection", chainId, collection, helper],
    enabled: Boolean(client && collection && helper),
    retry: false,
    queryFn: () => {
      if (!client || !collection || !helper)
        throw new Error("Enter a collection on the selected network.");
      return inspectCollection(client, collection, helper);
    },
  });
}
