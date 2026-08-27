import type { Metadata } from "next";

import { ChainRouteBoundary } from "@/components/ChainRouteBoundary";
import { ReadStateView } from "@/components/ReadState";
import { TierManagement } from "@/features/creator/TierManagement";
import { parseSupportedChainId } from "@/lib/chains";
import { validateTierRouteParam } from "@/lib/direct-read";

type ManagePageProps = {
  params: Promise<{ chainId: string; tierAddress: string }>;
};

export const metadata: Metadata = {
  title: "Manage membership",
  description:
    "Direct creator controls for a registered Backed By Fans membership.",
};

export default async function ManagePage({ params }: ManagePageProps) {
  const route = await params;
  const chainId = parseSupportedChainId(route.chainId);
  const address = validateTierRouteParam(route.tierAddress);

  return (
    <section className="page-shell manage-page">
      {!chainId || !address ? (
        <ReadStateView
          state={{
            status: "invalid-address",
            value: `${route.chainId}/${route.tierAddress}`,
            label:
              "This management URL does not contain a supported chain and valid EVM address.",
          }}
        />
      ) : (
        <ChainRouteBoundary chainId={chainId}>
          <TierManagement chainId={chainId} tierAddress={address} />
        </ChainRouteBoundary>
      )}
    </section>
  );
}
