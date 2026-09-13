import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChainRouteBoundary } from "@/components/ChainRouteBoundary";
import { parseSupportedChainId } from "@/lib/chains";
import { BuybackSettings } from "@/features/policy-review/BuybackSettings";
export const metadata: Metadata = {
  title: "Configure buybacks",
  description:
    "Calculate and save standing buyback settings across your protocol.",
};
export default async function BuybacksPage({
  params,
}: {
  params: Promise<{ chainId: string }>;
}) {
  const chainId = parseSupportedChainId((await params).chainId);
  if (!chainId) notFound();
  return (
    <section className="page-shell protocol-page">
      <ChainRouteBoundary chainId={chainId}>
        <BuybackSettings chainId={chainId} />
      </ChainRouteBoundary>
    </section>
  );
}
