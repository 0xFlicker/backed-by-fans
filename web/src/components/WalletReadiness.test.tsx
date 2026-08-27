import { render, screen } from "@testing-library/react";
import { getAddress } from "viem";
import { robinhood, robinhoodTestnet } from "viem/chains";
import { describe, expect, it, vi } from "vitest";

const mainnetFactory = getAddress("0x1111111111111111111111111111111111111111");
const testnetFactory = getAddress("0x2222222222222222222222222222222222222222");
const mainnetUsdg = getAddress("0x3333333333333333333333333333333333333333");
const testnetUsdg = getAddress("0x4444444444444444444444444444444444444444");

vi.mock("wagmi", () => ({
  useAccount: () => ({
    address: "0x5555555555555555555555555555555555555555",
    chainId: robinhood.id,
    isConnected: true,
  }),
  useBalance: vi.fn(),
  useReadContract: vi.fn(),
}));

vi.mock("@/lib/config", () => ({
  getDeployment: (_config: unknown, chainId: number) => ({
    status: "ready",
    chainId,
    factoryAddress: chainId === robinhood.id ? mainnetFactory : testnetFactory,
    usdgAddress: chainId === robinhood.id ? mainnetUsdg : testnetUsdg,
  }),
  publicConfig: {},
}));

vi.mock("@/lib/use-active-network", () => ({
  useActiveNetwork: () => ({
    chainId: robinhood.id,
    chain: robinhood,
    deployment: {
      status: "ready",
      chainId: robinhood.id,
      factoryAddress: mainnetFactory,
      usdgAddress: mainnetUsdg,
    },
  }),
}));

import { WalletReadiness } from "@/components/WalletReadiness";

describe("WalletReadiness", () => {
  it("labels route-chain balances with the route chain during a wallet mismatch", () => {
    render(
      <WalletReadiness
        expectedChainId={robinhoodTestnet.id}
        verifiedBalances={{ eth: 1n, usdg: 2_000_000n }}
      />,
    );

    expect(screen.getAllByText(robinhoodTestnet.name).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText(robinhood.name)).not.toBeInTheDocument();
    expect(screen.getByText(/transfer USDG.*testnet/i)).toBeVisible();
  });
});
