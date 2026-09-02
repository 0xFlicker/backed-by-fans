import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { getAddress } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CatalogExplorer } from "@/components/CatalogExplorer";
import type { CatalogInitialState } from "@/lib/catalog-read";
import { useActiveNetwork } from "@/lib/use-active-network";

vi.mock("@/lib/use-active-network", () => ({
  useActiveNetwork: vi.fn(),
}));

const factory = getAddress("0x1111111111111111111111111111111111111111");
const renderer = getAddress("0x2222222222222222222222222222222222222222");
const harness = getAddress("0x3333333333333333333333333333333333333333");
const tier = getAddress("0x4444444444444444444444444444444444444444");
const creator = getAddress("0x5555555555555555555555555555555555555555");
const token = getAddress("0x6666666666666666666666666666666666666666");

const initialState: CatalogInitialState = {
  status: "ready",
  chainId: 46_630,
  data: {
    page: {
      capturedBlock: 123n,
      total: 1n,
      offset: 0n,
      limit: 24,
      addresses: [tier],
      nextOffset: null,
    },
    summaries: {
      status: "valid",
      capturedBlock: 123n,
      data: [
        {
          address: tier,
          name: "Genesis Fans",
          symbol: "GENESIS",
          creator,
          paymentToken: token,
          pricePerPeriod: 500_000_000_000_000_000n,
          periodDuration: 2_592_000n,
          paused: false,
        },
      ],
    },
    paymentTokens: {
      status: "valid",
      capturedBlock: 123n,
      failures: [],
      data: [
        {
          chainId: 46_630,
          factory,
          address: token,
          registryIndex: 0,
          listed: true,
          enabled: true,
          name: "AMD Stock Token",
          symbol: "AMD",
          decimals: 18,
          scaledUI: false,
          uiMultiplier: 10n ** 18n,
          newUIMultiplier: 10n ** 18n,
          effectiveAt: 0n,
          readBlock: 123n,
        },
      ],
    },
  },
};

describe("CatalogExplorer", () => {
  beforeEach(() => {
    vi.mocked(useActiveNetwork).mockReturnValue({
      chainId: 46_630,
      clientChainId: 46_630,
      chain: undefined,
      client: undefined,
      deployment: {
        status: "ready",
        chainId: 46_630,
        factoryAddress: factory,
        rendererAddress: renderer,
        previewHarnessAddress: harness,
      },
    });
  });

  it("renders a matching server snapshot without the client loading state", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CatalogExplorer initialState={initialState} />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("link", { name: /Genesis Fans/i })).toBeVisible();
    expect(screen.getByText("0.5 AMD")).toBeVisible();
    expect(screen.queryByText("Reading onchain")).not.toBeInTheDocument();
    expect(screen.getByText("Block 123")).toBeVisible();
  });
});
