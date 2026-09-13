import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  zeroAddress,
} from "viem";
import { membershipTierAbi } from "@/contracts";
import type { ReadState } from "@/lib/read-state";
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
const paymentWrite = vi.hoisted(() => ({
  simulate: vi.fn(),
  send: vi.fn(),
  receipt: vi.fn(),
}));
vi.mock("@wagmi/core", () => ({ simulateContract: paymentWrite.simulate }));
vi.mock("@/features/protocol/gas-readiness", () => ({
  assertSufficientGas: vi.fn(),
}));
vi.mock("@/lib/config", async (original) => ({
  ...(await original<typeof import("@/lib/config")>()),
  getDeployment: () => ({
    status: "ready",
    chainId: 46630,
    factoryAddress: "0x4444444444444444444444444444444444444444",
    rendererAddress: "0x6666666666666666666666666666666666666666",
    previewHarnessAddress: "0x8888888888888888888888888888888888888888",
  }),
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: wallet, chainId: 46_630, isConnected: true }),
  useChainId: () => 46_630,
  useConfig: () => ({}),
  usePublicClient: () => ({
    readContract,
    waitForTransactionReceipt: paymentWrite.receipt,
  }),
  useWriteContract: () => ({
    isPending: false,
    writeContractAsync: paymentWrite.send,
  }),
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
    minimumPayment: 1n,
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
  protocolFeeBps: 100,
  rewardBps: 500,
  referralBps: 100,
  startingBoostBps: 10000,
  earlySupportGross: 0n,
  grossPaid: 0n,
  minimumPayment: 1n,
  accounting: {
    accountedThrough: 1000n,
    nextBoundary: 0n,
    scheduledMembers: 0n,
    scheduledExpirations: 0n,
    nextKind: 0,
    complete: true,
  },
  supplyCap: 100n,
  occupiedSupply: 3n,
  maxPrepaidPeriods: 12n,
  paused: false,
  capturedTimestamp: 2_000_000_000n,
  wallet,
  walletPaymentTokenBalance: 100_000_000n,
  totalEligibleRewardShares: 100_000_000n,
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

function renderExperience(
  value: TierSupporterSnapshot,
  capturedBlock = 100n,
  onRefresh: () => Promise<
    ReadState<TierSupporterSnapshot> | undefined
  > = async () => undefined,
  previewSteps = 0n,
  unavailableProjection = false,
) {
  const balances = {
    retired: 0n,
    retiredFractionalScaled: 0n,
    creator: value.creatorProceeds ?? 0n,
    member: value.credential?.claimableReward ?? 0n,
    referral: value.claimableReferral ?? 0n,
    protocol: 0n,
    fractionalScaled: [0n, 0n, 0n, 0n] as const,
    status: {
      accountedThrough: value.capturedTimestamp,
      nextBoundary: 0n,
      scheduledMembers: 0n,
      scheduledExpirations: 0n,
      nextKind: 0,
      complete: true,
    },
  };
  const preview = {
    lifecycle: 0,
    asOf: value.capturedTimestamp,
    processedSteps: previewSteps,
    ratesScaled: [0n, 0n, 0n, 0n] as const,
    earnedDeltaScaled: [0n, 0n, 0n, 0n] as const,
    settled: balances,
    current: balances,
  };
  const original = readContract.getMockImplementation();
  readContract.mockImplementation((request) =>
    request.functionName === "previewAccounting"
      ? unavailableProjection
        ? Promise.reject(new Error("Projection RPC unavailable"))
        : Promise.resolve(preview)
      : original?.(request),
  );
  value = {
    ...value,
    vestingError: unavailableProjection
      ? "Projection RPC unavailable"
      : undefined,
    vesting: unavailableProjection
      ? undefined
      : {
          earned: balances,
          preview,
          allocation: undefined,
          reserves: {
            unearnedScaled: [0n, 0n, 0n, 0n],
            cancellationScaled: [0n, 0n, 0n, 0n],
            unassignedMemberScaled: 0n,
            distributionDustScaled: 0n,
            indexCarryScaled: 0n,
            status: balances.status,
          },
        },
  };
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
        onRefresh={onRefresh}
        onSelectPosition={() => {}}
        snapshot={value}
      />
    </QueryClientProvider>,
  );
}

describe("supporter membership experience", () => {
  beforeEach(() => {
    paymentWrite.simulate
      .mockReset()
      .mockImplementation(async (_config, request) => ({ request }));
    paymentWrite.send.mockReset().mockResolvedValue(`0x${"12".repeat(32)}`);
    paymentWrite.receipt.mockReset();
    readContract.mockReset();
    readContract.mockImplementation(
      async ({
        functionName,
        args,
      }: {
        functionName: string;
        args?: bigint[];
      }) => {
        if (functionName === "previewShares")
          return {
            grossBefore: 0n,
            grossAfter: args![0],
            sharesAdded: args![0],
          };
        if (functionName === "tokenURI" || functionName === "previewTokenURI") {
          return canonicalTokenURI;
        }
        throw new Error(`Unexpected read ${functionName}`);
      },
    );
  });

  it("keeps live transfer, maintenance and settled retired claims usable if projections fail", async () => {
    const original = readContract.getMockImplementation();
    readContract.mockImplementation((request) =>
      request.functionName === "claimableRetiredReward"
        ? Promise.resolve([100n, 1n])
        : request.functionName === "getApproved"
          ? Promise.resolve(zeroAddress)
          : original?.(request),
    );
    renderExperience(
      { ...snapshot, paused: true, credential: credential() },
      100n,
      async () => undefined,
      0n,
      true,
    );
    const user = userEvent.setup();
    await user.click(screen.getByText("Rewards & accounting", { exact: true }));
    expect(
      await screen.findByText(/Reward projection unavailable/),
    ).toBeVisible();
    expect(
      await screen.findByRole("button", {
        name: "Claim ended membership rewards",
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole("region", { name: "Membership maintenance" }),
    ).toBeVisible();
    const transfer = screen.getByRole("region", {
      name: "Transfer membership #1",
    });
    await user.type(
      within(transfer).getByLabelText("Transfer recipient wallet"),
      "0x9999999999999999999999999999999999999999",
    );
    await user.click(within(transfer).getByRole("checkbox"));
    expect(
      within(transfer).getByRole("button", { name: "Transfer membership #1" }),
    ).toBeEnabled();
  });

  it("shows the captured-block quote and confirms actual issuance despite a changed curve and shortened access", async () => {
    const user = userEvent.setup();
    const quoted = {
      grossBefore: 0n,
      grossAfter: 10_000_000n,
      sharesAdded: 15_000_000n,
    };
    const held = credential({
      shares: 24_000_000n,
      expiration: snapshot.capturedTimestamp + 60n,
    });
    readContract.mockImplementation(async ({ functionName }) => {
      const results: Record<string, unknown> = {
        previewShares: quoted,
        ownerOf: wallet,
        isActiveToken: held.active,
        isOccupied: held.occupied,
        timeBalances: [
          held.paidSeconds,
          held.grantSeconds,
          held.expiration - held.paidSeconds - held.grantSeconds,
        ],
        referralOf: [1, zeroAddress],
        sharesOf: held.shares,
        claimableReward: held.claimableReward,
        rewardEligible: held.rewardEligible,
        previewRefund: { grossRefund: held.refundableGross },
      };
      if (!(functionName in results))
        throw new Error(`Unexpected read ${functionName}`);
      return results[functionName];
    });
    paymentWrite.receipt.mockResolvedValue({
      status: "success",
      blockNumber: 330n,
      transactionHash: `0x${"12".repeat(32)}`,
      logs: [
        {
          address: snapshot.address,
          topics: encodeEventTopics({
            abi: membershipTierAbi,
            eventName: "PaymentProcessed",
            args: { payer: wallet, recipient: wallet, tokenId: 1n },
          }),
          data: encodeAbiParameters(
            [{ type: "uint256" }, { type: "uint64" }],
            [10_000_000n, 1n],
          ),
        },
        {
          address: snapshot.address,
          topics: encodeEventTopics({
            abi: membershipTierAbi,
            eventName: "SharesIssued",
            args: { tokenId: 1n },
          }),
          data: encodeAbiParameters(
            [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
            [11_000_000n, 21_000_000n, 100_000_000n],
          ),
        },
        {
          address: snapshot.address,
          topics: encodeEventTopics({
            abi: membershipTierAbi,
            eventName: "RewardEligibilityUpdated",
            args: { tokenId: 1n },
          }),
          data: encodeAbiParameters(
            [{ type: "bool" }, { type: "uint256" }, { type: "uint256" }],
            [true, 21_000_000n, 100_000_000n],
          ),
        },
      ],
    });
    const next = {
      ...snapshot,
      walletPaymentTokenBalance: 0n,
      credential: credential({
        shares: 24_000_000n,
        expiration: snapshot.capturedTimestamp + 60n,
      }),
    };
    renderExperience(
      {
        ...snapshot,
        allowance: 100_000_000n,
        credential: credential({ rewardEligible: false }),
      },
      321n,
      async () => ({ status: "valid", data: next, capturedBlock: 330n }),
    );
    await userEvent
      .setup()
      .click(screen.getByText("Reward details", { exact: true }));
    expect(
      await screen.findByText(
        /15 shares \(1.5× average\). This weight stays with the live position/,
      ),
    ).toBeVisible();
    expect(
      screen.queryByText(/Free access adds no reward weight/),
    ).not.toBeInTheDocument();
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "previewShares",
        blockNumber: 321n,
        args: [10_000_000n],
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Renew membership #1" }),
    );
    expect(
      await screen.findByText(/Actual new reward weight: 11 shares/),
    ).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Periods" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Periods" })).toHaveAttribute(
      "aria-invalid",
      "false",
    );
    expect(
      screen.getByRole("button", { name: "Renew membership #1" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /^Wrap / }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Your wallet will first request an exact/),
    ).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Periods" }), "2");
    expect(screen.getByRole("textbox", { name: "Periods" })).toHaveValue("2");

    expect(paymentWrite.send).toHaveBeenCalledWith(
      (await paymentWrite.simulate.mock.results[0].value).request,
    );
  });

  for (const kind of ["member", "referral", "creator"] as const) {
    for (const actual of [1_000_000n, 3_000_000n]) {
      it(`confirms actual ${kind} payout ${actual} with a positive refreshed balance`, async () => {
        const user = userEvent.setup();
        const eventName =
          kind === "member"
            ? "RewardClaimed"
            : kind === "referral"
              ? "ReferralClaimed"
              : "CreatorProceedsWithdrawn";
        paymentWrite.receipt.mockResolvedValue({
          status: "success",
          transactionHash: `0x${"12".repeat(32)}`,
          logs: [
            {
              address: snapshot.address,
              topics: encodeEventTopics({
                abi: membershipTierAbi,
                eventName,
                args:
                  kind === "member"
                    ? { owner: wallet, tokenId: 1n }
                    : kind === "referral"
                      ? { referrer: wallet }
                      : { owner: wallet },
              }),
              data: encodeAbiParameters([{ type: "uint256" }], [actual]),
            },
          ],
        });
        const current = {
          ...snapshot,
          paused: true,
          creator: wallet,
          credential: credential({
            claimableReward: kind === "member" ? 2_000_000n : 0n,
            rewardEligible: false,
            active: false,
          }),
          claimableReferral: kind === "referral" ? 2_000_000n : 0n,
          creatorProceeds: kind === "creator" ? 2_000_000n : 0n,
        };
        const refresh = vi.fn(
          async (): Promise<ReadState<TierSupporterSnapshot>> => ({
            status: "valid",
            capturedBlock: 102n,
            data: {
              ...current,
              credential: {
                ...current.credential,
                claimableReward: 7_000_000n,
              },
              claimableReferral: 7_000_000n,
              creatorProceeds: 7_000_000n,
            },
          }),
        );
        renderExperience(current, 100n, refresh);
        await user.click(
          screen.getByRole("button", {
            name: "Claim rewards",
          }),
        );
        expect(
          await screen.findByText(
            `Paid ${actual / 1_000_000n} USDG to ${wallet}. New earnings may still become available.`,
          ),
        ).toBeVisible();
        expect(refresh).toHaveBeenCalledOnce();
        expect(paymentWrite.send).toHaveBeenCalledOnce();
      });
    }
  }

  it("requires maintenance before claiming member rewards when accounting is behind", async () => {
    renderExperience(
      { ...snapshot, credential: credential() },
      100n,
      async () => undefined,
      26n,
    );
    expect(
      screen.getByRole("link", { name: "Advance to claim" }),
    ).toBeVisible();
    await userEvent.click(screen.getByText("Settled funds", { exact: true }));
    expect(
      screen.queryByRole("button", { name: "Claim settled" }),
    ).not.toBeInTheDocument();
    expect(paymentWrite.send).not.toHaveBeenCalled();
  });

  it("shows failed quote reads as unavailable instead of zero or estimated cash", async () => {
    readContract.mockRejectedValue(new Error("RPC unavailable"));
    renderExperience(snapshot);
    await userEvent
      .setup()
      .click(screen.getByText("Reward details", { exact: true }));
    expect(
      await screen.findByText(/Reward weight preview is unavailable/),
    ).toBeVisible();
    expect(
      screen.queryByText(/Estimated new reward weight: 0 shares/),
    ).toBeNull();
  });

  it("shows eligible reward percentage independent of token display adjustments", () => {
    renderExperience({
      ...snapshot,
      paymentTokenState: {
        ...snapshot.paymentTokenState!,
        decimals: 18,
        uiMultiplier: 2n * 10n ** 18n,
      },
      totalEligibleRewardShares: 8_991_000_000_000_000_000n,
      credential: credential({ shares: 899_100_000_000_000_000n }),
    });
    const status = screen.getByRole("region", {
      name: "Current membership status",
    });
    expect(within(status).getByText("10%")).toBeVisible();
  });

  it.each([true, false])(
    "keeps free access separate from existing reward eligibility (%s)",
    async (rewardEligible) => {
      renderExperience({
        ...snapshot,
        pricePerPeriod: 0n,
        credential: credential({ rewardEligible }),
      });
      const status = screen.getByRole("region", {
        name: "Current membership status",
      });
      expect(within(status).getByText("Active", { exact: true })).toBeVisible();
      expect(
        within(status).getByText(rewardEligible ? "Eligible" : "Not eligible", {
          exact: true,
        }),
      ).toBeVisible();
      expect(
        within(status).getByText(rewardEligible ? "10%" : "0%"),
      ).toBeVisible();
      await userEvent
        .setup()
        .click(screen.getByText("Reward details", { exact: true }));
      await userEvent
        .setup()
        .click(screen.getByText("About your reward share", { exact: true }));
      if (rewardEligible)
        expect(
          screen.getByText(/Free renewal keeps this live position’s weight/),
        ).toBeVisible();
      else
        expect(
          within(status).getByText(/Retirement permanently removes/),
        ).toBeVisible();
      expect(
        await screen.findByText(/Estimated new reward weight: 0 shares/),
      ).toBeVisible();
      expect(
        screen.getByText("Free membership time adds no reward weight."),
      ).toBeVisible();
      expect(
        screen.getByRole("button", { name: "Claim rewards" }),
      ).toBeVisible();
    },
  );

  it("presents join, active renewal, held-expiry, and synchronized history distinctly", () => {
    const view = renderExperience(snapshot);
    expect(screen.getAllByText("New membership").length).toBeGreaterThan(0);

    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MembershipExperience
          capturedBlock={100n}
          expectedChainId={46630}
          fresh
          onSelectPosition={() => {}}
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
      within(activeStatus).queryByText("Renew membership #1"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Membership action" }),
    ).toHaveTextContent("Renew membership #1");

    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MembershipExperience
          capturedBlock={100n}
          expectedChainId={46630}
          fresh
          onSelectPosition={() => {}}
          onRefresh={async () => undefined}
          snapshot={{
            ...snapshot,
            credential: credential({ active: false, expiration: 1n }),
          }}
        />
      </QueryClientProvider>,
    );
    expect(screen.getAllByText("Membership ended").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: "Synchronize this place" }),
    ).not.toBeInTheDocument();

    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MembershipExperience
          capturedBlock={100n}
          expectedChainId={46630}
          fresh
          onSelectPosition={() => {}}
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
    expect(screen.getAllByText("Membership ended").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: "Synchronize this place" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByText("About your reward share", { exact: true }),
    );
    expect(screen.getByText("Retired")).toBeVisible();
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

  it("requires an explicit contribution after clearing a pay-what-you-want input", async () => {
    const user = userEvent.setup();
    renderExperience({ ...snapshot, pricePerPeriod: 0n });
    const input = screen.getByRole("textbox", {
      name: /Optional USDG contribution/,
    });
    await user.clear(input);
    expect(
      screen.getByRole("button", { name: "New membership" }),
    ).toBeDisabled();
    expect(
      within(screen.getByLabelText("Membership payment preview")).getByText(
        "0 days",
      ),
    ).toBeVisible();
    await user.type(input, "0");
    expect(
      screen.getByRole("button", { name: "New membership" }),
    ).toBeEnabled();
  });

  it("keeps the payment preview in place while the periods field is empty", async () => {
    const user = userEvent.setup();
    renderExperience({ ...snapshot, credential: credential() });

    const periods = screen.getByLabelText("Periods");
    const preview = screen.getByLabelText("Membership payment preview");
    await user.clear(periods);

    expect(periods).toHaveAttribute("aria-invalid", "false");
    expect(within(preview).getByText("0 USDG")).toBeVisible();
    expect(within(preview).getByText("0 days")).toBeVisible();
    expect(
      screen.queryByText("Enter 1 or more whole periods."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Renew membership #1" }),
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
    expect(
      readContract.mock.calls.every(
        ([call]) =>
          !["tokenURI", "previewTokenURI"].includes(call.functionName),
      ),
    ).toBe(true);
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
    expect(screen.getByText("Your earnings")).toBeVisible();
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
          onSelectPosition={() => {}}
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
          onSelectPosition={() => {}}
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
