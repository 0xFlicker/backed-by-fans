import type { Metadata } from "next";

import { ChainRouteBoundary } from "@/components/ChainRouteBoundary";
import { ReadStateView } from "@/components/ReadState";
import { TierReadPanel } from "@/components/TierReadPanel";
import { parseSupportedChainId } from "@/lib/chains";
import { validateTierRouteParam } from "@/lib/direct-read";

type TierPageProps = {
  params: Promise<{ chainId: string; tierAddress: string }>;
};

export async function generateMetadata({
  params,
}: TierPageProps): Promise<Metadata> {
  const { chainId, tierAddress } = await params;
  return {
    title:
      parseSupportedChainId(chainId) && validateTierRouteParam(tierAddress)
        ? "Membership"
        : "Invalid membership link",
    description:
      "A direct, factory-registered Backed By Fans membership contract view.",
  };
}

export default async function TierPage({ params }: TierPageProps) {
  const route = await params;
  const chainId = parseSupportedChainId(route.chainId);
  const address = validateTierRouteParam(route.tierAddress);

  return (
    <section className="page-shell tier-page">
      {!chainId || !address ? (
        <ReadStateView
          state={{
            status: "invalid-address",
            value: `${route.chainId}/${route.tierAddress}`,
            label:
              "This URL does not contain a valid EVM address or supported chain. Check the shared link and try again.",
          }}
        />
      ) : (
        <ChainRouteBoundary chainId={chainId}>
          <TierReadPanel chainId={chainId} tierAddress={address} />
        </ChainRouteBoundary>
      )}
    </section>
  );
}
