import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getAddress, zeroAddress } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { artworkRetryDelayMs } from "@/components/ResilientArtworkImage";
import type {
  ProtocolDependencySnapshot,
  TierArtConfig,
  TierMediaConfig,
  TierSupporterSnapshot,
} from "@/contracts/types";
import { tierArtworkRevision } from "@/lib/tier-artwork-revision";

const wallet = getAddress("0x1111111111111111111111111111111111111111");
const readContract = vi.hoisted(() => vi.fn());

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: wallet, chainId: 46_630, isConnected: true }),
  useChainId: () => 46_630,
  useConfig: () => ({}),
  usePublicClient: () => ({ readContract }),
  useWriteContract: () => ({ isPending: false, writeContractAsync: vi.fn() }),
}));
vi.mock("@/components/WalletControl", () => ({
  WalletControl: () => <button type="button">Connect wallet</button>,
}));
vi.mock("@/components/WalletReadiness", () => ({
  WalletReadiness: () => <p>Wallet readiness preview</p>,
}));

import { MembershipExperience } from "@/features/membership/MembershipExperience";

const factory = getAddress("0x4444444444444444444444444444444444444444");
const paymentToken = getAddress("0x5555555555555555555555555555555555555555");
const renderer = getAddress("0x6666666666666666666666666666666666666666");
const protocolDependencies: ProtocolDependencySnapshot = {
  chainId: 46630,
  factory,
  paymentTokens: [paymentToken],
  rendererSchema: `0x${"03".repeat(32)}`,
  renderer,
  rendererName: "Founding Six",
  rendererEngineCount: 1,
  rendererEngineNames: ["Afterimage"],
  previewHarness: getAddress("0x8888888888888888888888888888888888888888"),
  mediaStoreFactory: getAddress("0x7777777777777777777777777777777777777777"),
  mediaStoreFactoryRuntimeCodehash: `0x${"02".repeat(32)}`,
};
const art: TierArtConfig = {
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
};
const media: TierMediaConfig = {
  mime: 0,
  store: zeroAddress,
  length: 0,
  digest: `0x${"00".repeat(32)}`,
  runtimeCodehash: `0x${"00".repeat(32)}`,
};
const tierIdentity = `0x${"ab".repeat(32)}` as const;

afterEach(() => vi.useRealTimers());

const snapshot: TierSupporterSnapshot = {
  address: getAddress("0x2222222222222222222222222222222222222222"),
  creator: getAddress("0x3333333333333333333333333333333333333333"),
  factory,
  paymentToken,
  paymentTokenState: {
    chainId: 46_630,
    factory,
    address: paymentToken,
    registryIndex: 0,
    listed: true,
    enabled: true,
    name: "Global Dollar",
    symbol: "USDG",
    decimals: 6,
    scaledUI: false,
    uiMultiplier: 10n ** 18n,
    newUIMultiplier: 10n ** 18n,
    effectiveAt: 0n,
    readBlock: 100n,
  },
  renderer,
  protocolDependencies,
  tierIdentity,
  art,
  media,
  name: "The listening room",
  symbol: "ROOM",
  description: "Closer support, held directly.",
  externalURI: "",
  pricePerPeriod: 10_000_000n,
  periodDuration: 30n * 86_400n,
  rewardBps: 500,
  referralBps: 100,
  supplyCap: 100n,
  occupiedSupply: 3n,
  maxPrepaidPeriods: 12n,
  paused: false,
  capturedTimestamp: 2_000_000_000n,
  wallet,
  walletPaymentTokenBalance: 100_000_000n,
  walletEthBalance: 1n,
  allowance: 0n,
  claimableReferral: 0n,
};

const canonicalSVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200"><title>The listening room</title><rect width="1200" height="1200" fill="#11131a"/></svg>';
const canonicalTokenURI = `data:application/json;base64,${btoa(
  JSON.stringify({
    name: "The listening room #1",
    description: "Closer support, held directly.",
    image: `data:image/svg+xml;base64,${btoa(canonicalSVG)}`,
    external_url: "",
    attributes: [],
  }),
)}`;
function credential(
  overrides: Partial<NonNullable<TierSupporterSnapshot["credential"]>> = {},
) {
  return {
    tokenId: 1n,
    owner: wallet,
    minted: true,
    active: true,
    occupied: true,
    expiration: snapshot.capturedTimestamp + snapshot.periodDuration,
    paidSeconds: snapshot.periodDuration,
    grantSeconds: 0n,
    shares: 10_000_000n,
    rewardEligible: true,
    claimableReward: 2_000_000n,
    refundableGross: 10_000_000n,
    referralStatus: "locked-none" as const,
    referrer: zeroAddress,
    ...overrides,
  };
}

function renderExperience(value: TierSupporterSnapshot, capturedBlock = 100n) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MembershipExperience
        capturedBlock={capturedBlock}
        expectedChainId={46630}
        fresh
        onRefresh={async () => undefined}
        snapshot={value}
      />
    </QueryClientProvider>,
  );
}

describe("supporter membership experience", () => {
  beforeEach(() => {
    readContract.mockReset();
    readContract.mockImplementation(
      async ({ functionName }: { functionName: string }) => {
        if (functionName === "tokenURI" || functionName === "previewTokenURI") {
          return canonicalTokenURI;
        }
        throw new Error(`Unexpected read ${functionName}`);
      },
    );
  });

  it("presents join, active renewal, held-expiry, and synchronized history distinctly", () => {
    const view = renderExperience(snapshot);
    expect(screen.getAllByText("Join this membership").length).toBeGreaterThan(
      0,
    );

    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MembershipExperience
          capturedBlock={100n}
          expectedChainId={46630}
          fresh
          onRefresh={async () => undefined}
          snapshot={{ ...snapshot, credential: credential() }}
        />
      </QueryClientProvider>,
    );
    const activeStatus = screen.getByRole("region", {
      name: "Current membership status",
    });
    expect(
      within(activeStatus).getByRole("heading", {
        name: "Membership active",
      }),
    ).toBeVisible();
    expect(
      within(activeStatus).queryByText("Renew active membership"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Membership action" }),
    ).toHaveTextContent("Renew active membership");

    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MembershipExperience
          capturedBlock={100n}
          expectedChainId={46630}
          fresh
          onRefresh={async () => undefined}
          snapshot={{
            ...snapshot,
            credential: credential({ active: false, expiration: 1n }),
          }}
        />
      </QueryClientProvider>,
    );
    expect(screen.getAllByText("Renew your membership").length).toBeGreaterThan(
      0,
    );
    expect(
      screen.queryByRole("button", { name: "Synchronize this place" }),
    ).not.toBeInTheDocument();

    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MembershipExperience
          capturedBlock={100n}
          expectedChainId={46630}
          fresh
          onRefresh={async () => undefined}
          snapshot={{
            ...snapshot,
            credential: credential({
              active: false,
              occupied: false,
              minted: false,
              rewardEligible: false,
              expiration: 1n,
            }),
          }}
        />
      </QueryClientProvider>,
    );
    expect(
      screen.getAllByText("Rejoin this membership").length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: "Synchronize this place" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Burned after creator sync")).toBeVisible();
  });

  it("separates a zero contribution from positive economics and omits gifting", () => {
    renderExperience({ ...snapshot, pricePerPeriod: 0n });

    expect(screen.getByLabelText(/Optional USDG contribution/)).toHaveValue(
      "0",
    );
    expect(
      screen.getByText(/enter 0 to join without a payment/i),
    ).toBeVisible();
    expect(
      screen.getAllByText("0 USDG", { exact: true }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: /gift this membership/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps the payment preview in place while the periods field is empty", async () => {
    const user = userEvent.setup();
    renderExperience({ ...snapshot, credential: credential() });

    const periods = screen.getByLabelText("Periods");
    const preview = screen.getByLabelText("Membership payment preview");
    await user.clear(periods);

    expect(periods).toHaveAttribute("aria-invalid", "true");
    expect(within(preview).getByText("0 USDG")).toBeVisible();
    expect(within(preview).getByText("0 days")).toBeVisible();
    expect(screen.getByText("Enter 1 or more whole periods.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Renew active membership" }),
    ).toBeDisabled();
  });

  it("displays a scaled token and its scheduled change without changing raw terms", () => {
    const scaled = {
      ...snapshot,
      pricePerPeriod: 25_000_000_000_000_000n,
      walletPaymentTokenBalance: 100_000_000_000_000_000n,
      paymentTokenState: {
        ...snapshot.paymentTokenState!,
        name: "AMD Stock Token",
        symbol: "AMD",
        decimals: 18,
        scaledUI: true,
        uiMultiplier: 2n * 10n ** 18n,
        newUIMultiplier: 4n * 10n ** 18n,
        effectiveAt: snapshot.capturedTimestamp + 3_600n,
      },
    };

    renderExperience(scaled);

    expect(
      screen.getAllByText("0.05 AMD", { exact: true }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(/one period will display as 0.1 AMD/i),
    ).toBeVisible();
    expect(
      screen.getByText(/raw contract price does not change/i),
    ).toBeVisible();
  });

  it("uses the revisioned token zero collection artwork for every viewer", () => {
    renderExperience({ ...snapshot, credential: credential() }, 321n);

    expect(
      screen.getByRole("img", {
        name: "The listening room collection artwork",
      }),
    ).toHaveAttribute(
      "src",
      expect.stringContaining(
        `/api/chains/46630/tiers/${snapshot.address}/artwork?v=${tierArtworkRevision(snapshot)}`,
      ),
    );
    expect(readContract).not.toHaveBeenCalled();
    expect(
      screen.getByRole("region", { name: "Current membership status" }),
    ).toHaveTextContent("Membership active");
    expect(screen.queryByRole("button", { name: /interactive/i })).toBeNull();
    expect(screen.queryByTitle(/interactive membership art/i)).toBeNull();
  });

  it("keeps gifting full width when the member also has claims", () => {
    renderExperience({ ...snapshot, credential: credential() });

    const gift = screen.getByText("Gift this membership").closest("details");

    expect(gift).toHaveClass("gift-action");
    expect(gift?.parentElement).toHaveClass("supporter-columns");
    expect(screen.getByText("Funds for this wallet")).toBeVisible();
  });

  it("shows the onchain description and a valid creator link", () => {
    renderExperience({
      ...snapshot,
      description: "First is first",
      externalURI: "https://creator.example/membership",
    });

    expect(screen.getByText("First is first")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Visit creator link" }),
    ).toHaveAttribute("href", "https://creator.example/membership");
  });

  it("keeps the renderer address available when artwork rendering fails", async () => {
    vi.useFakeTimers();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);

    const view = renderExperience(snapshot);
    fireEvent.error(
      screen.getByRole("img", {
        name: "The listening room collection artwork",
      }),
    );
    act(() => vi.advanceTimersByTime(artworkRetryDelayMs));
    fireEvent.error(
      screen.getByRole("img", {
        name: "The listening room collection artwork",
      }),
    );
    vi.useRealTimers();

    expect(
      screen.getByText("Collection artwork is temporarily unavailable."),
    ).toBeVisible();

    const user = userEvent.setup();
    await user.click(screen.getByText("Contract Addresses"));

    expect(screen.getByText(renderer)).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Copy renderer address" }),
    );

    expect(writeText).toHaveBeenCalledWith(renderer);

    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MembershipExperience
          capturedBlock={101n}
          expectedChainId={46630}
          fresh
          onRefresh={async () => undefined}
          snapshot={{ ...snapshot, art: { ...snapshot.art, palette: 1 } }}
        />
      </QueryClientProvider>,
    );

    expect(
      screen.getByRole("img", {
        name: "The listening room collection artwork",
      }),
    ).toBeVisible();
  });

  it("keeps referrals implicit and hides claims that are not available", () => {
    renderExperience(snapshot);

    expect(
      screen.queryByText(/first positive self-payment referral choice/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/referral proceeds/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/creator proceeds/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/permanent shares/i)).not.toBeInTheDocument();
    expect(screen.getByText("Contract Addresses")).toBeVisible();
  });

  it("shows management only to the connected tier creator", () => {
    const view = renderExperience({ ...snapshot, creator: wallet });

    expect(
      screen.getByRole("link", { name: "Manage membership" }),
    ).toHaveAttribute("href", `/chains/46630/tiers/${snapshot.address}/manage`);

    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MembershipExperience
          capturedBlock={100n}
          expectedChainId={46630}
          fresh
          onRefresh={async () => undefined}
          snapshot={snapshot}
        />
      </QueryClientProvider>,
    );
    expect(
      screen.queryByRole("link", { name: "Manage membership" }),
    ).not.toBeInTheDocument();
  });
});
