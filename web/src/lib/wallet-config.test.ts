import { describe, expect, it } from "vitest";
import { robinhoodTestnet } from "viem/chains";

import { buildPublicConfig } from "@/lib/config";
import { createWalletConfig } from "@/lib/wallet-config";

describe("wallet connectors", () => {
  it("always supports injected EIP-1193 wallets", () => {
    const config = createWalletConfig(buildPublicConfig({}));

    expect(config.connectors.map((connector) => connector.type)).toContain(
      "injected",
    );
    expect(config.chains.map((chain) => chain.id)).toContain(
      robinhoodTestnet.id,
    );
  });

  it("adds generic WalletConnect only when its public project ID exists", () => {
    const absent = createWalletConfig(buildPublicConfig({}));
    const configured = createWalletConfig(
      buildPublicConfig({ walletConnectProjectId: "public-project-id" }),
    );

    expect(absent.connectors.map((connector) => connector.type)).not.toContain(
      "walletConnect",
    );
    expect(configured.connectors.map((connector) => connector.type)).toContain(
      "walletConnect",
    );
  });
});
