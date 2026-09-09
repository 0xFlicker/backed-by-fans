import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChainRouteBoundary } from "@/components/ChainRouteBoundary";
import { ProtocolActivity } from "@/features/protocol/ProtocolActivity";
import { readPublicBuybacks } from "@/features/protocol/protocol-read";
import { parseSupportedChainId } from "@/lib/chains";
import { getDeployment, publicConfig } from "@/lib/config";
import { getServerPublicClient } from "@/lib/server-rpc";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Protocol activity",
  description: "Membership fees, public buybacks and verifiable token burns.",
};
export default async function ProtocolPage({
  params,
}: {
  params: Promise<{ chainId: string }>;
}) {
  const chainId = parseSupportedChainId((await params).chainId);
  if (!chainId) notFound();
  const deployment = getDeployment(publicConfig, chainId);
  let initialState;
  try {
    initialState = await readPublicBuybacks(
      getServerPublicClient(chainId),
      deployment,
    );
  } catch {
    initialState = {
      status: "unavailable" as const,
      reason: "rpc-unavailable" as const,
      label: "Protocol data is unavailable. Refresh to try again.",
    };
  }
  return (
    <section className="page-shell protocol-page">
      <ChainRouteBoundary chainId={chainId}>
        <ProtocolActivity
          key={chainId}
          chainId={chainId}
          initialState={initialState}
        />
      </ChainRouteBoundary>
    </section>
  );
}
