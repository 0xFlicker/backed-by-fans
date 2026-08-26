import { createConfig, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";

import { supportedChains } from "@/lib/chains";
import { publicConfig, type PublicConfig } from "@/lib/config";

export function createWalletConfig(config: PublicConfig = publicConfig) {
  return createConfig({
    chains: supportedChains,
    connectors: config.walletConnectProjectId
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
      : [injected({ shimDisconnect: true })],
    ssr: true,
    transports: {
      [supportedChains[0].id]: http(config.testnetRpcUrl),
      [supportedChains[1].id]: http(config.mainnetRpcUrl),
    },
  });
}

export const walletConfig = createWalletConfig();
