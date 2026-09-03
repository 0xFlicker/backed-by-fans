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
const artworkRevision = `0x${"77".repeat(32)}` as const;
const secondTier = getAddress("0x7777777777777777777777777777777777777777");

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
          description: "Membership for Genesis fans.",
          externalURI: "https://example.com/genesis",
          paymentToken: token,
          pricePerPeriod: 500_000_000_000_000_000n,
          periodDuration: 2_592_000n,
          paused: false,
          renderer,
          art: {
            engine: 0,
            collectionSeed: 1n,
            palette: 0,
            intensity: 50,
            density: 50,
            symmetry: 50,
            typographyScale: 50,
            typographyStyle: 0,
            textVisibility: 1,
            imageFit: 0,
            focalX: 50,
            focalY: 50,
            grain: 50,
            mediaMix: 50,
            primary: 50,
            secondary: 50,
            tertiary: 50,
          },
          media: {
            mime: 0,
            store: "0x0000000000000000000000000000000000000000",
            length: 0,
            digest: `0x${"00".repeat(32)}`,
            runtimeCodehash: `0x${"00".repeat(32)}`,
          },
          artworkRevision,
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
    expect(screen.getByText("Membership for Genesis fans.")).toBeVisible();
    expect(screen.getByText("0.5 AMD")).toBeVisible();
    expect(screen.queryByText("Reading onchain")).not.toBeInTheDocument();
    expect(screen.getByText("Block 123")).toBeVisible();
  });

  it("renders collection artwork with a revisioned image route", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CatalogExplorer initialState={initialState} />
      </QueryClientProvider>,
    );

    const artwork = screen.getByRole("img", {
      name: "Genesis Fans collection artwork",
    });
    expect(artwork).toHaveAttribute(
      "src",
      expect.stringContaining(
        `/api/chains/46630/tiers/${tier}/artwork?v=${artworkRevision}`,
      ),
    );
    expect(artwork).toHaveAttribute("loading", "eager");
    expect(artwork).toHaveAttribute("fetchpriority", "high");
    expect(screen.getByRole("link", { name: /Genesis Fans/i })).toBeVisible();
  });

  it("lazy-loads artwork after the first membership", () => {
    const firstSummary =
      initialState.status === "ready" &&
      initialState.data.summaries.status === "valid"
        ? initialState.data.summaries.data[0]
        : undefined;
    if (!firstSummary || initialState.status !== "ready") {
      throw new Error("Expected a ready catalog fixture.");
    }
    const twoMemberships: CatalogInitialState = {
      ...initialState,
      data: {
        ...initialState.data,
        page: {
          ...initialState.data.page,
          total: 2n,
          addresses: [tier, secondTier],
        },
        summaries: {
          status: "valid",
          capturedBlock: 123n,
          data: [
            firstSummary,
            {
              ...firstSummary,
              address: secondTier,
              name: "Second Membership",
              symbol: "SECOND",
            },
          ],
        },
      },
    };

    render(
      <QueryClientProvider client={new QueryClient()}>
        <CatalogExplorer initialState={twoMemberships} />
      </QueryClientProvider>,
    );

    const artwork = screen.getAllByRole("img");
    expect(artwork[0]).toHaveAttribute("loading", "eager");
    expect(artwork[1]).toHaveAttribute("loading", "lazy");
    expect(artwork[1]).toHaveAttribute("fetchpriority", "auto");
  });

  it("shows paused state and pagination availability from the snapshot", () => {
    if (
      initialState.status !== "ready" ||
      initialState.data.summaries.status !== "valid"
    ) {
      throw new Error("Expected a ready catalog fixture.");
    }
    const lastPage: CatalogInitialState = {
      ...initialState,
      data: {
        ...initialState.data,
        page: {
          ...initialState.data.page,
          offset: 24n,
          total: 25n,
          nextOffset: null,
        },
        summaries: {
          ...initialState.data.summaries,
          data: [
            {
              ...initialState.data.summaries.data[0],
              paused: true,
            },
          ],
        },
      },
    };

    render(
      <QueryClientProvider client={new QueryClient()}>
        <CatalogExplorer initialState={lastPage} />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Membership paused")).toBeVisible();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });
});
