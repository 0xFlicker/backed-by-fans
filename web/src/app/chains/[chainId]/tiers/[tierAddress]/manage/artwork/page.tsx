import type { Metadata } from "next";

import { ChainRouteBoundary } from "@/components/ChainRouteBoundary";
import { ReadStateView } from "@/components/ReadState";
import { ArtworkManagement } from "@/features/creator/ArtworkManagement";
import { parseSupportedChainId } from "@/lib/chains";
import { validateTierRouteParam } from "@/lib/direct-read";
import { readServerTierManagementState } from "@/lib/server-tier-state";

type ArtworkPageProps = {
  params: Promise<{ chainId: string; tierAddress: string }>;
};

export const metadata: Metadata = {
  title: "Update membership artwork",
  description: "Full Art Studio controls for a published membership.",
};

export default async function ArtworkPage({ params }: ArtworkPageProps) {
  const route = await params;
  const chainId = parseSupportedChainId(route.chainId);
  const address = validateTierRouteParam(route.tierAddress);
  const initialState =
    chainId && address
      ? await readServerTierManagementState(chainId, address)
      : undefined;

  return (
    <section className="page-shell artwork-studio-page">
      {!chainId || !address ? (
        <ReadStateView
          state={{
            status: "invalid-address",
            value: `${route.chainId}/${route.tierAddress}`,
            label:
              "This artwork URL does not contain a supported chain and valid EVM address.",
          }}
        />
      ) : (
        <ChainRouteBoundary chainId={chainId}>
          <ArtworkManagement
            chainId={chainId}
            initialState={initialState}
            tierAddress={address}
          />
        </ChainRouteBoundary>
      )}
    </section>
  );
}
