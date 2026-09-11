const testStream = (raw: bigint) => ({
  raw,
  fractional: 0n,
  rate: 0n,
  asOf: 100n,
  nextBoundary: 0n,
  complete: true,
});
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import {
  encodeEventTopics,
  encodeAbiParameters,
  getAbiItem,
  BaseError,
  ContractFunctionRevertedError,
  encodeErrorResult,
} from "viem";
import {
  membershipTierAbi,
  membershipFactoryAbi,
  protocolBurnRouterAbi,
} from "@/contracts";
import { AccountRewards } from "./AccountRewards";
import type { ReadyDeployment } from "@/lib/config";
const wallet = "0x1111111111111111111111111111111111111111";
const factory = "0x2222222222222222222222222222222222222222";
const tier = "0x3333333333333333333333333333333333333333";
const token = "0x4444444444444444444444444444444444444444";
const m = vi.hoisted(() => ({
  simulate: vi.fn(),
  write: vi.fn(),
  receipt: vi.fn(),
  read: vi.fn(),
  preview: vi.fn(),
}));
vi.mock("./account-rewards-read", () => ({ readAccountRewards: m.preview }));
vi.mock("@wagmi/core", () => ({ simulateContract: m.simulate }));
vi.mock("wagmi", () => ({
  useConfig: () => ({}),
  usePublicClient: () => ({
    readContract: m.read,
    waitForTransactionReceipt: m.receipt,
  }),
  useWriteContract: () => ({ writeContractAsync: m.write }),
}));
vi.mock("@/lib/use-hydrated-account", () => ({
  useHydratedAccount: () => ({
    address: wallet,
    chainId: 31337,
    isConnected: true,
  }),
}));
vi.mock("@/features/protocol/gas-readiness", () => ({
  assertSufficientGas: vi.fn(),
}));
const deployment = {
  chainId: 31337,
  factoryAddress: factory,
  status: "ready",
  rendererAddress: factory,
  previewHarnessAddress: factory,
} satisfies ReadyDeployment;
function mount(count = 1) {
  const tiers = Array.from({ length: count }, (_, index) => ({
    tier:
      index === 0
        ? tier
        : (`0x${(100 + index).toString(16).padStart(40, "0")}` as `0x${string}`),
    name: "WETH Fans",
    paymentToken: (index === 1 ? factory : token) as `0x${string}`,
  }));
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AccountRewards
        deployment={deployment}
        wallet={wallet}
        tiers={tiers}
        complete
        formatAmount={(amount, asset) =>
          `${amount} ${asset === factory ? "USDG" : "WETH"}`
        }
      />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  m.simulate.mockImplementation(async (_config, request) => ({
    request,
    result: [
      {
        processedSteps: 0n,
        streams: [testStream(10n)],
        reward: 2n,
        referral: 3n,
        creator: 5n,
      },
    ],
  }));
  m.preview.mockResolvedValue({
    results: [
      {
        processedSteps: 0n,
        streams: [testStream(10n)],
        reward: 2n,
        referral: 3n,
        creator: 5n,
        complete: true,
        through: 100n,
      },
    ],
    blocked: undefined,
    complete: true,
  });
  m.write.mockResolvedValue(`0x${"ab".repeat(32)}`);
  m.read.mockResolvedValue(factory);
  m.receipt.mockResolvedValue({
    status: "success",
    logs: [
      {
        address: tier,
        topics: encodeEventTopics({
          abi: membershipTierAbi,
          eventName: "CreatorProceedsWithdrawn",
          args: { owner: wallet },
        }),
        data: encodeAbiParameters([{ type: "uint256" }], [12n]),
      },
      {
        address: factory,
        topics: encodeEventTopics({
          abi: membershipFactoryAbi,
          eventName: "EverythingClaimed",
          args: { beneficiary: wallet },
        }),
        data: encodeAbiParameters([{ type: "uint256" }], [1n]),
      },
    ],
  });
});
it("previews all three categories then sends the fresh wagmi request", async () => {
  mount();
  expect(await screen.findByText("10 WETH")).toBeVisible();
  expect(m.write).not.toHaveBeenCalled();
  expect(m.simulate).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Claim everything" }),
  );
  expect(await screen.findByText("Paid 12 WETH.")).toBeVisible();
  expect(m.write.mock.calls[0][0]).toBe(
    (await m.simulate.mock.results[0].value).request,
  );
});
it("does not spend gas on zero claims", async () => {
  m.preview.mockResolvedValue({
    results: [
      {
        processedSteps: 0n,
        streams: [],
        reward: 0n,
        referral: 0n,
        creator: 0n,
      },
    ],
    complete: true,
  });
  mount();
  await waitFor(() => expect(m.preview).toHaveBeenCalled());
  expect(
    screen.queryByRole("region", { name: "Rewards" }),
  ).not.toBeInTheDocument();
  expect(m.write).not.toHaveBeenCalled();
});
it("names a blocked tier and advances only that tier", async () => {
  m.preview.mockResolvedValue({
    results: [
      { streams: [testStream(10n)], reward: 2n, referral: 3n, creator: 5n },
    ],
    blocked: { tier, name: "WETH Fans" },
    complete: true,
  });
  const event = getAbiItem({
    abi: protocolBurnRouterAbi,
    name: "AdvanceCompleted",
  });
  const accounting = getAbiItem({
    abi: protocolBurnRouterAbi,
    name: "AccountingAdvanced",
  });
  m.receipt.mockResolvedValue({
    status: "success",
    logs: [
      {
        address: factory,
        topics: encodeEventTopics({
          abi: protocolBurnRouterAbi,
          eventName: "AdvanceCompleted",
          args: { caller: wallet },
        }),
        data: encodeAbiParameters(
          event.inputs.filter((i) => !i.indexed),
          [25n, 0n, 0n, 0n, false],
        ),
      },
      {
        address: factory,
        topics: encodeEventTopics({
          abi: protocolBurnRouterAbi,
          eventName: "AccountingAdvanced",
          args: { caller: wallet, tier },
        }),
        data: encodeAbiParameters(
          accounting.inputs.filter((i) => !i.indexed),
          [25n, 950n, false, 1n],
        ),
      },
    ],
  });
  mount();
  expect(
    await screen.findByRole("link", { name: "WETH Fans" }),
  ).toHaveAttribute("href", `/chains/${31337}/tiers/${tier}`);
  await userEvent.click(
    screen.getByRole("button", { name: "Advance accounting" }),
  );
  expect(await screen.findByText("Accounting advanced.")).toBeVisible();
  expect(m.write.mock.calls[0][0]).toMatchObject({
    functionName: "advanceAccounting",
    args: [[{ tier, maxAccountingSteps: 25n }]],
  });
});
it("does not silently switch a claim into an advance", async () => {
  mount();
  await screen.findByText("10 WETH");
  m.preview.mockResolvedValue({
    results: [],
    blocked: { tier, name: "WETH Fans" },
    complete: false,
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Claim everything" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Review the next action",
  );
  expect(m.write).not.toHaveBeenCalled();
});
it("keeps batches at eight memberships", async () => {
  mount(9);
  await screen.findByText("10 WETH");
  expect(m.preview.mock.calls[0][2]).toHaveLength(8);
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() => expect(m.preview.mock.calls.at(-1)![2]).toHaveLength(1));
});
it("rejects unconfirmed claims", async () => {
  m.receipt.mockResolvedValue({ status: "success", logs: [] });
  mount();
  await screen.findByText("10 WETH");
  await userEvent.click(
    screen.getByRole("button", { name: "Claim everything" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "does not confirm",
  );
  expect(screen.queryByText("Rewards claimed.")).not.toBeInTheDocument();
});

it("refreshes a submission-time accounting failure into the named advance action", async () => {
  mount();
  await screen.findByText("10 WETH");
  m.simulate.mockImplementationOnce(async () => {
    m.preview.mockResolvedValue({
      results: [
        { reward: 2n, referral: 3n, creator: 5n, streams: [testStream(10n)] },
      ],
      blocked: { tier, name: "WETH Fans" },
      complete: false,
    });
    throw new BaseError("Simulation failed", {
      cause: new ContractFunctionRevertedError({
        abi: membershipFactoryAbi,
        functionName: "claimEverything",
        data: encodeErrorResult({
          abi: membershipFactoryAbi,
          errorName: "ClaimAccountingBehind",
          args: [0n, tier, 100n, 101n],
        }),
      }),
    });
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Claim everything" }),
  );
  expect(
    await screen.findByRole("button", { name: "Advance accounting" }),
  ).toBeEnabled();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "WETH Fans needs an accounting update",
  );
  expect(m.write).not.toHaveBeenCalled();
});
it("keeps routinely refreshed balances outside live regions", async () => {
  mount();
  const amount = await screen.findByText("10 WETH");
  expect(amount.closest("[aria-live], [role=status], [role=alert]")).toBeNull();
});

it("names a failed membership and retains the token's revert reason", async () => {
  mount();
  await screen.findByText("10 WETH");
  const reason = encodeErrorResult({
    abi: [
      {
        type: "error",
        name: "Error",
        inputs: [{ type: "string", name: "message" }],
      },
    ],
    errorName: "Error",
    args: ["Transfers paused"],
  });
  m.simulate.mockRejectedValueOnce(
    new BaseError("Simulation failed", {
      cause: new ContractFunctionRevertedError({
        abi: membershipFactoryAbi,
        functionName: "claimEverything",
        data: encodeErrorResult({
          abi: membershipFactoryAbi,
          errorName: "ClaimFailed",
          args: [0n, tier, reason],
        }),
      }),
    }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Claim everything" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "WETH Fans: Transfers paused. No funds were claimed.",
  );
  expect(m.write).not.toHaveBeenCalled();
});
it("rejects a receipt paying another beneficiary", async () => {
  const receipt = await m.receipt();
  receipt.logs[0].topics = encodeEventTopics({
    abi: membershipTierAbi,
    eventName: "CreatorProceedsWithdrawn",
    args: { owner: factory },
  });
  m.receipt.mockResolvedValue(receipt);
  mount();
  await screen.findByText("10 WETH");
  await userEvent.click(
    screen.getByRole("button", { name: "Claim everything" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "different wallet",
  );
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("groups receipt payouts across categories and currencies, not preview amounts", async () => {
  const secondTier =
    `0x${(101).toString(16).padStart(40, "0")}` as `0x${string}`;
  const preview = await m.preview();
  m.preview.mockResolvedValue({
    ...preview,
    results: [...preview.results, ...preview.results],
  });
  const receipt = await m.receipt();
  receipt.logs[1].data = encodeAbiParameters([{ type: "uint256" }], [2n]);
  receipt.logs.push({
    address: tier,
    topics: encodeEventTopics({
      abi: membershipTierAbi,
      eventName: "RewardClaimed",
      args: { tokenId: 1n, owner: wallet },
    }),
    data: encodeAbiParameters([{ type: "uint256" }], [3n]),
  });
  receipt.logs.push({
    address: secondTier,
    topics: encodeEventTopics({
      abi: membershipTierAbi,
      eventName: "ReferralClaimed",
      args: { referrer: wallet },
    }),
    data: encodeAbiParameters([{ type: "uint256" }], [5n]),
  });
  m.receipt.mockResolvedValue(receipt);
  mount(2);
  await screen.findByText("10 USDG");
  await userEvent.click(
    screen.getByRole("button", { name: "Claim everything" }),
  );
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Paid 15 WETH, 5 USDG.",
  );
});
