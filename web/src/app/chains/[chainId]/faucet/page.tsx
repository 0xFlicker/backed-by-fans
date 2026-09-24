import { notFound } from "next/navigation";
import { ChainRouteBoundary } from "@/components/ChainRouteBoundary";
import { parseSupportedChainId } from "@/lib/chains";
import { testUSDGAddress } from "@/lib/config";
import { TestUSDGFaucet } from "@/features/faucet/TestUSDGFaucet";

export const metadata = { title: "Get test bUSD" };
export default async function FaucetPage({
  params,
}: {
  params: Promise<{ chainId: string }>;
}) {
  const chainId = parseSupportedChainId((await params).chainId);
  if (!chainId) notFound();
  const address = testUSDGAddress(chainId);
  if (!address) notFound();
  return (
    <section className="page-shell">
      <ChainRouteBoundary chainId={chainId}>
        <TestUSDGFaucet chainId={chainId} address={address} />
      </ChainRouteBoundary>
    </section>
  );
}
