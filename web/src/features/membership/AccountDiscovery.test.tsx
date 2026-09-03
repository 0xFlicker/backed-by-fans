import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { getAddress } from "viem";
import { describe, expect, it, vi } from "vitest";

import type { AccountDiscoveryPage } from "@/features/membership/account-discovery";
import type { ReadyDeployment } from "@/lib/config";
import type { AcceptedPaymentTokenReadState } from "@/lib/payment-token-read";

const wallet = getAddress("0x1111111111111111111111111111111111111111");
const factory = getAddress("0x2222222222222222222222222222222222222222");
const tier = getAddress("0x3333333333333333333333333333333333333333");
const paymentToken = getAddress("0x4444444444444444444444444444444444444444");
const deployment: ReadyDeployment = {
  status: "ready",
  chainId: 46_630,
  factoryAddress: factory,
  rendererAddress: getAddress("0x5555555555555555555555555555555555555555"),
  previewHarnessAddress: getAddress(
    "0x6666666666666666666666666666666666666666",
  ),
};

vi.mock("wagmi", () => ({
  useAccount: () => ({
    address: wallet,
    chainId: 46_630,
    isConnected: true,
  }),
  usePublicClient: () => ({}),
}));

vi.mock("@/lib/use-active-network", () => ({
  useActiveNetwork: () => ({
    chainId: 46_630,
    deployment,
  }),
}));

import { AccountDiscovery } from "@/features/membership/AccountDiscovery";

const page: AccountDiscoveryPage = {
  capturedBlock: 100n,
  total: 1n,
  offset: 0n,
  scannedTo: 1n,
  nextOffset: null,
  scannedTiers: [tier],
  results: [
    {
      tier,
      name: "Genesis Fans",
      creatorOwned: false,
      paymentToken,
      tokenId: 1n,
      active: true,
      claimableReward: 50_000n,
      claimableReferral: 0n,
      creatorProceeds: 0n,
    },
  ],
  skipped: [],
};

const paymentTokens: AcceptedPaymentTokenReadState = {
  status: "valid",
  capturedBlock: 100n,
  data: [
    {
      chainId: 46_630,
      factory,
      address: paymentToken,
      registryIndex: 0,
      listed: true,
      enabled: true,
      name: "Advanced Micro Devices",
      symbol: "AMD",
      decimals: 6,
      scaledUI: false,
      uiMultiplier: 10n ** 18n,
      newUIMultiplier: 10n ** 18n,
      effectiveAt: 0n,
      readBlock: 100n,
    },
  ],
  failures: [],
};

describe("account discovery", () => {
  it("renders a matching server snapshot without a client loading state", () => {
    render(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { staleTime: Infinity } },
          })
        }
      >
        <AccountDiscovery
          initialDiscovery={{
            chainId: 46_630,
            wallet,
            page,
            paymentTokens,
          }}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Genesis Fans")).toBeVisible();
    expect(screen.getByText("Membership active")).toBeVisible();
    expect(screen.getByText("0.05 AMD")).toBeVisible();
    expect(
      screen.getByRole("img", { name: "Genesis Fans collection artwork" }),
    ).toHaveAttribute(
      "src",
      expect.stringContaining(`/api/chains/46630/tiers/${tier}/artwork`),
    );
    expect(
      screen.getByRole("button", { name: "Refresh memberships" }),
    ).toBeVisible();
    expect(screen.queryByText("List settings")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Already have a membership link?"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Looking for memberships connected to this wallet."),
    ).not.toBeInTheDocument();
  });
});
