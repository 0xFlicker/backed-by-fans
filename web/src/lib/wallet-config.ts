import { http } from "viem";
import { createConfig } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";

import { getSupportedChain, publicChains } from "@/lib/chains";
import { publicConfig, type PublicConfig } from "@/lib/config";

export function createWalletConfig(config: PublicConfig = publicConfig) {
  const orderedPublicChains =
    config.defaultChainId === publicChains[1].id
      ? ([publicChains[1], publicChains[0]] as const)
      : publicChains;
  const connectors = config.walletConnectProjectId
    ? [
        injected({ shimDisconnect: true }),
        walletConnect({
          projectId: config.walletConnectProjectId,
          metadata: {
            name: "Backed By Fans",
            description:
              "Creator-owned memberships, directly on Robinhood Chain.",
            url: config.siteUrl,
            icons: [`${config.siteUrl}/brand/backing-stack-mark.svg`],
          },
          showQrModal: true,
        }),
      ]
    : [injected({ shimDisconnect: true })];

  if (config.anvilRpcUrl) {
    return createConfig({
      chains: [...orderedPublicChains, getSupportedChain(31_337)],
      connectors,
      ssr: true,
      transports: {
        [publicChains[0].id]: http(config.testnetRpcUrl),
        [publicChains[1].id]: http(config.mainnetRpcUrl),
        [31_337]: http(config.anvilRpcUrl),
      },
    });
  }

  return createConfig({
    chains: orderedPublicChains,
    connectors,
    ssr: true,
    transports: {
      [publicChains[0].id]: http(config.testnetRpcUrl),
      [publicChains[1].id]: http(config.mainnetRpcUrl),
    },
  });
}

export const walletConfig = createWalletConfig();
