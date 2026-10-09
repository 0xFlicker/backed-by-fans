import { notFound } from "next/navigation";
import { getAddress, isAddress, zeroAddress } from "viem";
import type { Metadata } from "next";
import { parseSupportedChainId } from "@/lib/chains";
import { gasliteDropAddress } from "@/lib/config";
import { RegisterGaslitePage } from "@/features/airdrop/RegisterGaslitePage";

export const metadata: Metadata = {
  title: "Register GasliteDrop",
  description: "Authorize the airdrop helper for your NFT collection.",
};
export default async function RegisterPage({
  params,
}: {
  params: Promise<{ chainId: string; contractAddress: string }>;
}) {
  const route = await params;
  const chainId = parseSupportedChainId(route.chainId);
  if (
    chainId === undefined ||
    !isAddress(route.contractAddress) ||
    getAddress(route.contractAddress) === zeroAddress
  )
    notFound();
  const helper = gasliteDropAddress(chainId);
  if (!helper) notFound();
  return (
    <RegisterGaslitePage
      chainId={chainId}
      collection={getAddress(route.contractAddress)}
      helper={helper}
    />
  );
}
