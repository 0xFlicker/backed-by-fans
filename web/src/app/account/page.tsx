import type { Metadata } from "next";

import { AccountDiscovery } from "@/features/membership/AccountDiscovery";
import { discoverAccountPage } from "@/features/membership/account-discovery";
import { isSupportedChainId } from "@/lib/chains";
import { getDeployment, publicConfig } from "@/lib/config";
import { readAcceptedPaymentTokens } from "@/lib/payment-token-read";
import { getServerPublicClient } from "@/lib/server-rpc";
import { readServerWalletState } from "@/lib/server-wallet-state";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your memberships",
  description:
    "Bounded direct-chain membership and claim discovery for Backed By Fans.",
};

export default async function AccountPage() {
  const walletState = await readServerWalletState();
  const connection = walletState?.current
    ? walletState.connections.get(walletState.current)
    : undefined;
  const wallet = connection?.accounts[0];
  const chainId = connection?.chainId;
  let initialDiscovery;

  if (wallet && chainId !== undefined && isSupportedChainId(chainId)) {
    const deployment = getDeployment(publicConfig, chainId);
    if (deployment.status === "ready") {
      try {
        const client = getServerPublicClient(chainId);
        const [page, paymentTokens] = await Promise.all([
          discoverAccountPage(client, {
            deployment,
            wallet,
            offset: 0n,
          }),
          readAcceptedPaymentTokens(client, {
            chainId,
            factory: deployment.factoryAddress,
            wallet,
          }),
        ]);
        initialDiscovery = { chainId, wallet, page, paymentTokens };
      } catch (error) {
        console.error(
          "Server account discovery failed; the browser will retry.",
          error,
        );
      }
    }
  }

  return (
    <section className="page-shell account-page">
      <AccountDiscovery initialDiscovery={initialDiscovery} />
    </section>
  );
}
