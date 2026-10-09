import { notFound } from "next/navigation";
import { ERC721AirdropPage } from "@/features/airdrop/ERC721AirdropPage";
import { parseSupportedChainId } from "@/lib/chains";
import { gasliteDropAddress } from "@/lib/config";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NFT airdrop",
  description: "Send ERC721 NFTs to your recipient list on Robinhood Chain.",
};

export default async function ChainAirdropPage({
  params,
}: {
  params: Promise<{ chainId: string }>;
}) {
  const chainId = parseSupportedChainId((await params).chainId);
  if (chainId === undefined) notFound();
  const helper = gasliteDropAddress(chainId);
  if (!helper) notFound();
  return <ERC721AirdropPage chainId={chainId} helper={helper} />;
}
