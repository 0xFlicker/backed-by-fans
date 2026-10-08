import type { Metadata } from "next";
import { robinhood } from "viem/chains";
import { ERC721AirdropPage } from "@/features/airdrop/ERC721AirdropPage";
import { gasliteDropAddress } from "@/lib/config";

export const metadata: Metadata = {
  title: "NFT airdrop",
  description: "Send ERC721 NFTs to your recipient list on Robinhood Chain.",
  alternates: { canonical: "/airdrop" },
};

export default function AirdropPage() {
  return (
    <ERC721AirdropPage
      chainId={robinhood.id}
      helper={gasliteDropAddress(robinhood.id)}
    />
  );
}
