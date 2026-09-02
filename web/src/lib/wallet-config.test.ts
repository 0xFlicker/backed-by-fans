import { describe, expect, it } from "vitest";
import { robinhood, robinhoodTestnet } from "viem/chains";

import { localAnvil } from "@/lib/chains";
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
    expect(config.chains.map((chain) => chain.id)).toContain(robinhood.id);
    expect(config.chains.map((chain) => chain.id)).not.toContain(localAnvil.id);
    const getClient = config.getClient as unknown as (input: {
      chainId: number;
    }) => { transport: { url?: string } };
    expect(getClient({ chainId: robinhoodTestnet.id }).transport.url).toBe(
      robinhoodTestnet.rpcUrls.default.http[0],
    );
    expect(getClient({ chainId: robinhood.id }).transport.url).toBe(
      robinhood.rpcUrls.default.http[0],
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

  it("adds Anvil only for a complete local test configuration", () => {
    const config = createWalletConfig(
      buildPublicConfig(
        {
          anvilRpcUrl: "http://127.0.0.1:8545",
          anvilFactoryAddress: "0x1111111111111111111111111111111111111111",
        },
        {},
      ),
    );

    expect(config.chains.map((chain) => chain.id)).toContain(localAnvil.id);
  });

  it("keeps new sessions on the canonical testnet even if a mainnet factory is supplied", () => {
    const config = createWalletConfig(
      buildPublicConfig(
        {},
        { [robinhood.id]: "0x1111111111111111111111111111111111111111" },
      ),
    );

    expect(config.chains[0].id).toBe(robinhoodTestnet.id);
    expect(config.chains.map((chain) => chain.id)).toContain(
      robinhoodTestnet.id,
    );
  });
});
