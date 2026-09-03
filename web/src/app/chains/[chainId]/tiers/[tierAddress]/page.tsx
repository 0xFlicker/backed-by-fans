import type { Metadata } from "next";
import { cache } from "react";

import { ChainRouteBoundary } from "@/components/ChainRouteBoundary";
import { ReadStateView } from "@/components/ReadState";
import { TierReadPanel } from "@/components/TierReadPanel";
import { parseSupportedChainId } from "@/lib/chains";
import { publicConfig } from "@/lib/config";
import { validateTierRouteParam } from "@/lib/direct-read";
import { readServerTierSupporterState } from "@/lib/server-tier-state";

type TierPageProps = {
  params: Promise<{ chainId: string; tierAddress: string }>;
};

const readTierPageState = cache(readServerTierSupporterState);

export async function generateMetadata({
  params,
}: TierPageProps): Promise<Metadata> {
  const { chainId, tierAddress } = await params;
  const parsedChainId = parseSupportedChainId(chainId);
  const address = validateTierRouteParam(tierAddress);
  if (!parsedChainId || !address) {
    return {
      title: "Invalid membership link",
      description:
        "This URL does not contain a valid Backed By Fans membership.",
      robots: { index: false, follow: false },
    };
  }

  const state = await readTierPageState(parsedChainId, address);
  if (state.status !== "valid" && state.status !== "stale") {
    return {
      title: "Membership",
      description:
        "A direct, factory-registered Backed By Fans membership contract view.",
    };
  }

  const { name, symbol, description } = state.data;
  const title = symbol ? `${name} (${symbol})` : name;
  const socialDescription =
    description.trim() || `Join ${name} directly on Backed By Fans.`;
  const pathname = `/chains/${parsedChainId}/tiers/${address}`;

  return {
    title,
    description: socialDescription,
    alternates: { canonical: pathname },
    openGraph: {
      title,
      description: socialDescription,
      siteName: "Backed By Fans",
      type: "website",
      url: new URL(pathname, publicConfig.siteUrl),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: socialDescription,
    },
  };
}

export default async function TierPage({ params }: TierPageProps) {
  const route = await params;
  const chainId = parseSupportedChainId(route.chainId);
  const address = validateTierRouteParam(route.tierAddress);
  const initialState =
    chainId && address ? await readTierPageState(chainId, address) : undefined;

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
          <TierReadPanel
            chainId={chainId}
            initialState={initialState}
            tierAddress={address}
          />
        </ChainRouteBoundary>
      )}
    </section>
  );
}
