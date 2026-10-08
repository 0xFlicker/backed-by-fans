import { notFound } from "next/navigation";
import { ERC721AirdropPage } from "@/features/airdrop/ERC721AirdropPage";
import { parseSupportedChainId } from "@/lib/chains";
import { gasliteDropAddress } from "@/lib/config";

export default async function ChainAirdropPage({
  params,
}: {
  params: Promise<{ chainId: string }>;
}) {
  const chainId = parseSupportedChainId((await params).chainId);
  if (chainId === undefined) notFound();
  return (
    <ERC721AirdropPage chainId={chainId} helper={gasliteDropAddress(chainId)} />
  );
}
