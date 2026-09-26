import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAddress } from "viem";
import { PublicWalletDiscovery } from "@/features/membership/AccountDiscovery";
import { isNonZeroAddress } from "@/lib/address";
import { parseSupportedChainId } from "@/lib/chains";

export const dynamic = "force-dynamic";

type WalletPageProps = {
  params: Promise<{ chainId: string; walletAddress: string }>;
};

export async function generateMetadata({
  params,
}: WalletPageProps): Promise<Metadata> {
  const { chainId, walletAddress } = await params;
  const network = parseSupportedChainId(chainId);
  if (!network || !isNonZeroAddress(walletAddress))
    return {
      title: "Invalid wallet link",
      robots: { index: false, follow: false },
    };
  const address = getAddress(walletAddress);
  return {
    title: `Wallet rewards · ${address.slice(0, 6)}…${address.slice(-4)}`,
    description:
      "Public memberships and rewards on Backed By Fans. No wallet connection needed.",
    alternates: { canonical: `/chains/${network}/wallets/${address}` },
  };
}

export default async function WalletPage({ params }: WalletPageProps) {
  const route = await params;
  const chainId = parseSupportedChainId(route.chainId);
  if (!chainId || !isNonZeroAddress(route.walletAddress)) notFound();
  const wallet = getAddress(route.walletAddress);
  return (
    <section className="page-shell account-page">
      <PublicWalletDiscovery chainId={chainId} wallet={wallet} />
    </section>
  );
}
