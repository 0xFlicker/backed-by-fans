import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getAddress } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("./account-discovery", () => ({
  discoverAccountPage: vi.fn(),
  readAccountOwnerPage: vi.fn(),
}));

vi.mock("./AccountRewards", () => ({ AccountRewards: () => null }));

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
import {
  discoverAccountPage,
  readAccountOwnerPage,
} from "@/features/membership/account-discovery";

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
      positions: [
        {
          tokenId: 1n,
          active: true,
          expiration: 200n,
          claimableReward: 50_000n,
        },
      ],
      ownerBalance: 1n,
      nextOwnerOffset: 1n,
      ownerComplete: true,
      retiredReward: 0n,
      retiredFractionalScaled: 0n,
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
      minimumPayment: 1n,
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

function renderSnapshot(snapshot: AccountDiscoveryPage = page) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <AccountDiscovery
        initialDiscovery={{
          chainId: 46_630,
          wallet,
          page: snapshot,
          paymentTokens,
        }}
      />
    </QueryClientProvider>,
  );
  return { queryClient, user: userEvent.setup() };
}

function partialOwnerPage(): AccountDiscoveryPage {
  return {
    ...page,
    results: [
      {
        ...page.results[0],
        ownerBalance: 2n,
        nextOwnerOffset: 1n,
        ownerComplete: false,
      },
    ],
  };
}

beforeEach(() => {
  vi.mocked(discoverAccountPage).mockReset().mockResolvedValue(page);
  vi.mocked(readAccountOwnerPage)
    .mockReset()
    .mockResolvedValue({
      ...page.results[0],
      ownerBalance: 2n,
      nextOwnerOffset: 2n,
      ownerComplete: true,
      positions: [
        { tokenId: 2n, active: false, expiration: 90n, claimableReward: 7n },
      ],
    });
});

describe("account discovery", () => {
  it("renders every position from a matching server snapshot without client loading", () => {
    renderSnapshot();
    expect(screen.getByText("Genesis Fans")).toBeVisible();
    expect(screen.getByRole("link", { name: "Membership #1" })).toHaveAttribute(
      "href",
      `/chains/46630/tiers/${tier}?tokenId=1`,
    );
    expect(screen.getByText("Membership active")).toBeVisible();
    expect(
      screen.getByText("Settled position rewards: 0.05 AMD"),
    ).toBeVisible();
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
    expect(discoverAccountPage).not.toHaveBeenCalled();
  });

  it("shows creator rewards from the settled snapshot without a wallet-wide streaming query", () => {
    renderSnapshot({
      ...page,
      results: [
        {
          ...page.results[0],
          creatorOwned: true,
          positions: [],
          ownerBalance: 0n,
          nextOwnerOffset: 0n,
          creatorProceeds: 22_600n,
        },
      ],
    });
    expect(
      screen.getByText("Settled creator rewards: 0.0226 AMD"),
    ).toBeVisible();
    expect(screen.getByText("You are the creator")).toBeVisible();
    expect(
      screen.getByText("No owned membership NFTs in this snapshot."),
    ).toBeVisible();
  });

  it("labels a zero settled creator balance as zero", () => {
    renderSnapshot({
      ...page,
      results: [
        {
          ...page.results[0],
          creatorOwned: true,
          positions: [],
          ownerBalance: 0n,
          nextOwnerOffset: 0n,
          creatorProceeds: 0n,
        },
      ],
    });
    expect(screen.getByText("Settled creator rewards: 0 AMD")).toBeVisible();
    expect(screen.queryByText(/0\.0226 AMD/)).not.toBeInTheDocument();
  });

  it("offers a separate owner-page action and explains partial totals", () => {
    renderSnapshot(partialOwnerPage());
    expect(
      screen.getByRole("button", { name: "More memberships in Genesis Fans" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Find more memberships" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Discovery is incomplete. Loaded position and balance totals cover only the pages shown.",
      ),
    ).toBeVisible();
  });

  it("loads the next ownership page at the original block and preserves both identities", async () => {
    const { user } = renderSnapshot(partialOwnerPage());
    await user.click(
      screen.getByRole("button", { name: "More memberships in Genesis Fans" }),
    );
    expect(readAccountOwnerPage).toHaveBeenCalledWith(expect.anything(), {
      deployment,
      wallet,
      tier,
      offset: 1n,
      blockNumber: 100n,
    });
    expect(
      await screen.findByRole("link", { name: "Membership #2" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Membership #1" })).toBeVisible();
    expect(screen.getByText("Expired — awaiting retirement")).toBeVisible();
    expect(
      screen.queryByRole("button", {
        name: "More memberships in Genesis Fans",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Loaded position and balance totals cover only/),
    ).not.toBeInTheDocument();
  });

  it("pins catalog continuation and preserves memberships from previous tiers", async () => {
    const nextTier = getAddress("0x7777777777777777777777777777777777777777");
    vi.mocked(discoverAccountPage).mockResolvedValue({
      ...page,
      total: 2n,
      offset: 1n,
      scannedTo: 2n,
      scannedTiers: [nextTier],
      results: [
        {
          ...page.results[0],
          tier: nextTier,
          name: "Second room",
          positions: [],
        },
      ],
    });
    const { user } = renderSnapshot({ ...page, total: 2n, nextOffset: 1n });
    await user.click(
      screen.getByRole("button", { name: "Find more memberships" }),
    );
    expect(discoverAccountPage).toHaveBeenCalledWith(expect.anything(), {
      deployment,
      wallet,
      offset: 1n,
      blockNumber: 100n,
    });
    expect(await screen.findByText("Second room")).toBeVisible();
    expect(screen.getByRole("link", { name: "Membership #1" })).toBeVisible();
  });

  it("distinguishes incomplete empty pages from a completed empty wallet", () => {
    renderSnapshot({ ...page, total: 2n, nextOffset: 1n, results: [] });
    expect(
      screen.getByRole("heading", {
        name: "No memberships found in these pages yet.",
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", {
        name: "No memberships are connected to this wallet.",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Find more memberships" }),
    ).toBeVisible();
  });

  it("shows completed empty discovery only after all tier pages succeed", () => {
    renderSnapshot({ ...page, results: [] });
    expect(
      screen.getByRole("heading", {
        name: "No memberships are connected to this wallet.",
      }),
    ).toBeVisible();
    expect(
      screen.queryByText(/Discovery is incomplete/),
    ).not.toBeInTheDocument();
  });

  it("retains a failed ownership page as incomplete with retry and no fabricated positions", async () => {
    vi.mocked(readAccountOwnerPage).mockRejectedValueOnce(
      new Error("ownership mismatch"),
    );
    const { user } = renderSnapshot(partialOwnerPage());
    await user.click(
      screen.getByRole("button", { name: "More memberships in Genesis Fans" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No balance or membership value was assumed",
    );
    expect(screen.getByRole("link", { name: "Membership #1" })).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Membership #2" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "More memberships in Genesis Fans" }),
    ).toBeEnabled();
    expect(
      screen.getByText(/Loaded position and balance totals cover only/),
    ).toBeVisible();
  });

  it("retains visible snapshot positions and labels them stale when refresh fails", async () => {
    const { queryClient } = renderSnapshot();
    vi.mocked(discoverAccountPage).mockRejectedValue(
      new Error("RPC unavailable"),
    );
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["account-discovery"] });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No balance or membership value was assumed",
    );
    expect(screen.getByRole("link", { name: "Membership #1" })).toBeVisible();
    expect(
      screen.getByText(/Saved memberships are outdated until refreshed/),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Retry discovery" }),
    ).toBeVisible();
  });

  it("keeps fractional retired balances visible when no NFTs remain", () => {
    renderSnapshot({
      ...page,
      results: [
        {
          ...page.results[0],
          positions: [],
          ownerBalance: 0n,
          nextOwnerOffset: 0n,
          retiredReward: 0n,
          retiredFractionalScaled: 1n,
        },
      ],
    });
    expect(
      screen.getByText(/Rewards from ended memberships: 0 AMD/),
    ).toBeVisible();
    expect(screen.getByText(/Fractional credit is preserved/)).toBeVisible();
    expect(
      screen.queryByRole("heading", {
        name: "No memberships are connected to this wallet.",
      }),
    ).not.toBeInTheDocument();
  });

  it("restarts ownership pages when a fresh query replaces the snapshot", async () => {
    const { queryClient, user } = renderSnapshot(partialOwnerPage());
    await user.click(
      screen.getByRole("button", { name: "More memberships in Genesis Fans" }),
    );
    expect(
      await screen.findByRole("link", { name: "Membership #2" }),
    ).toBeVisible();
    vi.mocked(discoverAccountPage).mockResolvedValue({
      ...page,
      capturedBlock: 101n,
      results: [
        {
          ...page.results[0],
          positions: [
            {
              tokenId: 3n,
              active: true,
              expiration: 300n,
              claimableReward: 9n,
            },
          ],
        },
      ],
    });
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ["account-discovery"] });
    });
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Membership #3" })).toBeVisible(),
    );
    expect(
      screen.queryByRole("link", { name: "Membership #1" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Membership #2" }),
    ).not.toBeInTheDocument();
  });
});
