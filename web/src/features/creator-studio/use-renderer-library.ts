import { useQuery } from "@tanstack/react-query";
import type { Address, Hex, PublicClient } from "viem";

import type { StudioRenderer } from "@/features/creator-studio/CreatorStudio";
import {
  resolveRendererAddress,
  type CanonicalRendererChainId,
} from "@/features/creator-studio/renderer-address";
import { readRendererLibraryAddresses } from "@/features/renderer-registry/registry-read";

export function useRendererLibrary({
  client,
  registry,
  owner,
  canonicalChainId,
  expectedSchema,
}: {
  client?: PublicClient;
  registry?: Address;
  owner?: Address;
  canonicalChainId?: CanonicalRendererChainId;
  expectedSchema?: Hex;
}) {
  return useQuery({
    queryKey: [
      "creator-renderer-library",
      canonicalChainId,
      registry,
      owner,
      expectedSchema,
    ],
    enabled: Boolean(
      client && registry && owner && canonicalChainId && expectedSchema,
    ),
    retry: false,
    queryFn: async (): Promise<readonly StudioRenderer[]> => {
      const addresses = await readRendererLibraryAddresses(
        client!,
        registry!,
        owner!,
      );
      const resolutions = await Promise.allSettled(
        addresses.map((address) =>
          resolveRendererAddress(client!, {
            address,
            canonicalChainId: canonicalChainId!,
            expectedSchema: expectedSchema!,
          }),
        ),
      );
      return resolutions.flatMap((resolution) =>
        resolution.status === "fulfilled" ? [resolution.value] : [],
      );
    },
  });
}
