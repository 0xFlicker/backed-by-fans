import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { ReactNode } from "react";
import { useChainId, type State } from "wagmi";
vi.mock("@rainbow-me/rainbowkit", () => ({
  lightTheme: () => ({}),
  RainbowKitProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/lib/wallet-config", async () => {
  const { createConfig, http } = await import("wagmi");
  const { mainnet, optimism } = await import("viem/chains");
  const createWalletConfig = () =>
    createConfig({
      chains: [mainnet, optimism],
      transports: { [mainnet.id]: http(), [optimism.id]: http() },
      ssr: true,
    });
  return { createWalletConfig };
});
import { AppProviders } from "./AppProviders";
function Chain() {
  return <span>{useChainId()}</span>;
}
describe("wallet server rendering", () => {
  it("does not retain one visitor's hydrated network for the next visitor", () => {
    const state: State = {
      chainId: 10,
      connections: new Map(),
      current: null,
      status: "disconnected",
    };
    expect(
      renderToString(
        <AppProviders initialState={state}>
          <Chain />
        </AppProviders>,
      ),
    ).toContain("<span>10</span>");
    expect(
      renderToString(
        <AppProviders>
          <Chain />
        </AppProviders>,
      ),
    ).toContain("<span>1</span>");
  });
});
