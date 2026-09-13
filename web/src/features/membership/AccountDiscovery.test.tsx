import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
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

const rewardMock = vi.hoisted(() => ({
  preview: vi.fn(),
  creator: 0n,
  referral: 0n,
  retired: 0n,
}));
vi.mock("./account-rewards-read", async (original) => ({
  ...(await original<typeof import("./account-rewards-read")>()),
  readAccountRewards: rewardMock.preview,
}));
vi.mock("./AccountRewards", () => ({
  AccountRewards: ({ children }: { children: import("react").ReactNode }) => (
    <section aria-label="Rewards">{children}</section>
  ),
}));

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
  rewardMock.creator = 0n;
  rewardMock.referral = 0n;
  rewardMock.retired = 0n;
  rewardMock.preview
    .mockReset()
    .mockImplementation(async (_client, _wallet, tiers) => ({
      complete: true,
      results: tiers.map((tier: { tokenIds: bigint[] }) => ({
        reward: BigInt(tier.tokenIds.length) * 80_000n,
        creator: rewardMock.creator,
        referral: rewardMock.referral,
        retired: rewardMock.retired,
        positions: tier.tokenIds.map((tokenId) => ({
          tokenId,
          creditScaled: 80_000n * (1n << 128n),
        })),
        complete: true,
      })),
    }));
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
  it("shows token identity and expiration immediately, then current claim amounts", async () => {
    renderSnapshot();
    expect(screen.getByText("Genesis Fans")).toBeVisible();
    expect(screen.getByRole("link", { name: "Membership #1" })).toHaveAttribute(
      "href",
      `/chains/46630/tiers/${tier}?tokenId=1`,
    );
    expect(screen.getByText(/^Expires /)).toBeVisible();
    expect(await screen.findAllByText("0.08 AMD")).toHaveLength(2);
    expect(
      screen.queryByText(/Settled position rewards|Snapshot block/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("0.05 AMD")).not.toBeInTheDocument();
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

  it("shows current creator earnings instead of the smaller settled balance", async () => {
    rewardMock.creator = 30_000n;
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
    expect(await screen.findAllByText("0.03 AMD")).toHaveLength(2);
    expect(screen.getByText("Creator earnings")).toBeVisible();
    expect(screen.queryByText("0.0226 AMD")).not.toBeInTheDocument();
    expect(screen.getByText("You are the creator")).toBeVisible();
    expect(
      screen.queryByText(/No owned membership NFTs/),
    ).not.toBeInTheDocument();
  });

  it("shows zero when the current creator preview is zero", async () => {
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
    expect(await screen.findByText("0 AMD")).toBeVisible();
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
      screen.getByText("More memberships are available below."),
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
    expect(screen.getByText(/^Ended /)).toBeVisible();
    expect(
      screen.queryByRole("button", {
        name: "More memberships in Genesis Fans",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/More memberships are available below/),
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
      screen.queryByText(/More memberships are available below/),
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
    expect(
      await screen.findByText(/No balance or membership value was assumed/),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Membership #1" })).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Membership #2" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "More memberships in Genesis Fans" }),
    ).toBeEnabled();
    expect(
      screen.getByText(/More memberships are available below/),
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
    expect(
      await screen.findByText(/No balance or membership value was assumed/),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Membership #1" })).toBeVisible();
    expect(
      screen.getByText(/Refresh to update your memberships/),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Retry discovery" }),
    ).toBeVisible();
  });

  it("retains a tier with fractional credit without exposing accounting jargon", () => {
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
    expect(screen.getByText("Genesis Fans")).toBeVisible();
    expect(
      screen.queryByText(/Fractional credit|Settled|Snapshot block/),
    ).not.toBeInTheDocument();
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

it("adds current position, retired, referral and creator rewards once per tier", async () => {
  rewardMock.creator = 10_000n;
  rewardMock.referral = 20_000n;
  rewardMock.retired = 30_000n;
  renderSnapshot({
    ...page,
    results: [
      {
        ...page.results[0],
        creatorOwned: true,
        positions: [
          ...page.results[0].positions,
          { ...page.results[0].positions[0], tokenId: 2n },
        ],
        ownerBalance: 2n,
        nextOwnerOffset: 2n,
      },
    ],
  });
  const summary = within(screen.getByRole("region", { name: "Rewards" }));
  expect(await summary.findByText("0.22 AMD")).toBeVisible();
  expect(screen.getAllByText("0.08 AMD")).toHaveLength(2);
  expect(screen.getByText("0.03 AMD")).toBeVisible();
});
it("shows unavailable instead of zero or settled amounts when the preview fails", async () => {
  rewardMock.preview.mockRejectedValue(new Error("RPC unavailable"));
  renderSnapshot();
  expect(
    await screen.findByText("Rewards unavailable. Refresh to try again."),
  ).toBeVisible();
  expect(screen.queryByText("0.05 AMD")).not.toBeInTheDocument();
  expect(screen.queryByText("0 AMD")).not.toBeInTheDocument();
});

it("refreshes the summary and card together without showing stored balances", async () => {
  const { queryClient } = renderSnapshot();
  expect(await screen.findAllByText("0.08 AMD")).toHaveLength(2);
  rewardMock.preview.mockResolvedValue({
    complete: true,
    results: [
      {
        reward: 90_000n,
        retired: 0n,
        referral: 0n,
        creator: 0n,
        complete: true,
        positions: [{ tokenId: 1n, creditScaled: 90_000n * (1n << 128n) }],
      },
    ],
  });
  await act(async () => {
    await queryClient.refetchQueries({ queryKey: ["account-rewards"] });
  });
  expect(await screen.findAllByText("0.09 AMD")).toHaveLength(2);
  expect(screen.queryByText("0.08 AMD")).not.toBeInTheDocument();
});
it("labels incomplete reward previews without implying the total is final", async () => {
  rewardMock.preview.mockResolvedValue({
    complete: false,
    results: [
      {
        reward: 20_000n,
        retired: 0n,
        referral: 0n,
        creator: 0n,
        complete: false,
        positions: [{ tokenId: 1n, creditScaled: 20_000n * (1n << 128n) }],
      },
    ],
  });
  renderSnapshot();
  expect(await screen.findAllByText("0.02 AMD")).toHaveLength(2);
  expect(
    screen.getByText(/Some rewards are still being checked/),
  ).toBeVisible();
});
