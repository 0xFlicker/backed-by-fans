import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { getAddress, zeroAddress } from "viem";
import { describe, expect, it, vi } from "vitest";

import type { TierSupporterSnapshot } from "@/contracts/types";

const wallet = getAddress("0x1111111111111111111111111111111111111111");

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: wallet, chainId: 46_630, isConnected: true }),
  useChainId: () => 46_630,
  useConfig: () => ({}),
  usePublicClient: () => ({}),
  useWriteContract: () => ({ isPending: false, writeContractAsync: vi.fn() }),
}));
vi.mock("@/components/WalletControl", () => ({
  WalletControl: () => <button type="button">Connect wallet</button>,
}));
vi.mock("@/components/WalletReadiness", () => ({
  WalletReadiness: () => <p>Wallet readiness preview</p>,
}));

import { MembershipExperience } from "@/features/membership/MembershipExperience";

const snapshot: TierSupporterSnapshot = {
  address: getAddress("0x2222222222222222222222222222222222222222"),
  creator: getAddress("0x3333333333333333333333333333333333333333"),
  factory: getAddress("0x4444444444444444444444444444444444444444"),
  paymentToken: getAddress("0x5555555555555555555555555555555555555555"),
  name: "The listening room",
  symbol: "ROOM",
  description: "Closer support, held directly.",
  imageURI: "",
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
  walletUsdgBalance: 100_000_000n,
  walletEthBalance: 1n,
  allowance: 0n,
  claimableReferral: 0n,
};

function credential(
  overrides: Partial<NonNullable<TierSupporterSnapshot["credential"]>> = {},
) {
  return {
    tokenId: 1n,
    owner: wallet,
    active: true,
    occupied: true,
    expiration: snapshot.capturedTimestamp + snapshot.periodDuration,
    paidSeconds: snapshot.periodDuration,
    grantSeconds: 0n,
    shares: 10_000_000n,
    claimableReward: 2_000_000n,
    refundableGross: 10_000_000n,
    referralStatus: "locked-none" as const,
    referrer: zeroAddress,
    ...overrides,
  };
}

function renderExperience(value: TierSupporterSnapshot) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MembershipExperience
        capturedBlock={100n}
        expectedChainId={46630}
        fresh
        onRefresh={async () => undefined}
        snapshot={value}
      />
    </QueryClientProvider>,
  );
}

describe("supporter membership experience", () => {
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
    expect(
      screen.getAllByText("Renew active membership").length,
    ).toBeGreaterThan(0);

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
      screen.getByRole("button", { name: "Synchronize this place" }),
    ).toBeVisible();

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
});
