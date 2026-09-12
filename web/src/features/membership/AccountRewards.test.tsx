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
  type Address,
} from "viem";
import { membershipTierAbi, membershipFactoryAbi } from "@/contracts";
import { AccountRewards } from "./AccountRewards";
import type { ReadyDeployment } from "@/lib/config";
import type { CachedAccountTier } from "./account-cache";

const wallet = "0x1111111111111111111111111111111111111111";
const factory = "0x2222222222222222222222222222222222222222";
const tier = "0x3333333333333333333333333333333333333333";
const token = "0x4444444444444444444444444444444444444444";
const secondTier = "0x0000000000000000000000000000000000000065";
const scale = 1n << 128n;
const m = vi.hoisted(() => ({
  simulate: vi.fn(),
  write: vi.fn(),
  receipt: vi.fn(),
  read: vi.fn(),
  preview: vi.fn(),
  account: {
    address: "0x1111111111111111111111111111111111111111",
    chainId: 31337,
    isConnected: true,
  },
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
  useHydratedAccount: () => m.account,
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
function mount({
  count = 1,
  positions = 1,
  complete = true,
}: { count?: number; positions?: number; complete?: boolean } = {}) {
  const tiers: CachedAccountTier[] = Array.from(
    { length: count },
    (_, index) => ({
      tier:
        index === 0
          ? tier
          : (`0x${(100 + index).toString(16).padStart(40, "0")}` as Address),
      name: index === 0 ? "WETH Fans" : `Tier ${index + 1}`,
      paymentToken: index === 1 ? factory : token,
      creatorOwned: true,
      positions: Array.from({ length: positions }, (_, position) => ({
        tokenId: String(position + 1),
        active: true,
        expiration: "200",
        claimableReward: "2",
      })),
      ownerBalance: String(positions),
      nextOwnerOffset: String(positions),
      ownerComplete: true,
      claimableReferral: "3",
      creatorProceeds: "5",
      retiredReward: "0",
      retiredFractionalScaled: "0",
      capturedBlock: "42",
    }),
  );
  const onRefresh = vi.fn();
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
        complete={complete}
        onRefresh={onRefresh}
        formatAmount={(amount, asset) =>
          `${amount} ${asset === factory ? "USDG" : "WETH"}`
        }
      />
    </QueryClientProvider>,
  );
  return { tiers, onRefresh };
}
function previewResult(ids: readonly bigint[] = [1n]) {
  return {
    processedSteps: 0n,
    reward: BigInt(ids.length) * 2n,
    retired: 0n,
    referral: 3n,
    creator: 5n,
    positions: ids.map((tokenId) => ({
      tokenId,
      lifecycle: 0,
      creditScaled: 2n * scale,
    })),
    retiredCreditScaled: 0n,
    settledRetired: [0n, 0n],
    complete: true,
    through: 100n,
  };
}
function claimReceipt(tierCount = 1n) {
  return {
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
        data: encodeAbiParameters([{ type: "uint256" }], [tierCount]),
      },
    ],
  };
}
async function selectFirst() {
  await userEvent.click(
    screen.getByRole("checkbox", { name: "WETH Fans membership #1" }),
  );
  await screen.findByText("Selected rewards: 10 WETH");
}
beforeEach(() => {
  vi.resetAllMocks();
  m.account.address = wallet;
  m.account.chainId = 31337;
  m.account.isConnected = true;
  m.simulate.mockImplementation(async (_config, request) => ({ request }));
  m.preview.mockImplementation(
    async (_client, _wallet, selected: { tokenIds: readonly bigint[] }[]) => ({
      results: selected.map((item) => previewResult(item.tokenIds)),
      blocked: undefined,
      complete: true,
      blockNumber: 42n,
    }),
  );
  m.write.mockResolvedValue(`0x${"ab".repeat(32)}`);
  m.read.mockResolvedValue([0n, 0n]);
  m.receipt.mockResolvedValue(claimReceipt());
});

it("starts without implicit selections then submits exactly the selected IDs using the fresh wagmi request", async () => {
  const { onRefresh } = mount();
  expect(screen.getByText("No rewards selected.")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Claim selected rewards" }),
  ).toBeDisabled();
  expect(m.preview).not.toHaveBeenCalled();
  await selectFirst();
  expect(m.write).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Claim selected rewards" }),
  );
  expect(
    await screen.findByText(/Selected rewards claimed.*Paid 12 WETH/),
  ).toBeVisible();
  expect(m.write.mock.calls[0][0]).toBe(
    (await m.simulate.mock.results[0].value).request,
  );
  expect(m.write.mock.calls[0][0]).toMatchObject({
    functionName: "claimEverything",
    args: [[{ tier, tokenIds: [1n] }]],
  });
  expect(
    screen.getByRole("checkbox", { name: "WETH Fans membership #1" }),
  ).not.toBeChecked();
  expect(onRefresh).toHaveBeenCalledOnce();
});
it("supports a tier-only selection with no implicit NFT", async () => {
  mount();
  await userEvent.click(
    screen.getByRole("checkbox", { name: "Include WETH Fans tier rewards" }),
  );
  await screen.findByText("Selected rewards: 8 WETH");
  await userEvent.click(
    screen.getByRole("button", { name: "Claim selected rewards" }),
  );
  await waitFor(() => expect(m.write).toHaveBeenCalled());
  expect(m.write.mock.calls[0][0]).toMatchObject({
    args: [[{ tier, tokenIds: [] }]],
  });
});
it("keeps zero and fractional-only claims visible without spending gas", async () => {
  m.preview.mockResolvedValue({
    results: [
      {
        ...previewResult(),
        reward: 0n,
        retired: 0n,
        referral: 0n,
        creator: 0n,
        retiredCreditScaled: 1n,
      },
    ],
    complete: true,
  });
  mount();
  await userEvent.click(
    screen.getByRole("checkbox", { name: "WETH Fans membership #1" }),
  );
  expect(
    await screen.findByText(/No whole rewards for this selection/),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Claim selected rewards" }),
  ).toBeDisabled();
  expect(m.write).not.toHaveBeenCalled();
});
it("names an incomplete tier and advances only that tier with an explicit maintenance action", async () => {
  m.preview.mockResolvedValue({
    results: [{ ...previewResult(), complete: false, processedSteps: 25n }],
    blocked: { tier, name: "WETH Fans", tokenIds: [1n] },
    complete: false,
  });
  const event = getAbiItem({
    abi: membershipTierAbi,
    name: "AccountingProgress",
  });
  m.receipt.mockResolvedValue({
    status: "success",
    logs: [
      {
        address: tier,
        topics: encodeEventTopics({
          abi: membershipTierAbi,
          eventName: "AccountingProgress",
        }),
        data: encodeAbiParameters(
          event.inputs.filter((input) => !input.indexed),
          [950n, 25n, false, 1n, 12n],
        ),
      },
    ],
  });
  mount();
  await userEvent.click(
    screen.getByRole("checkbox", { name: "WETH Fans membership #1" }),
  );
  expect(
    await screen.findByText("Partial selected rewards: 10 WETH"),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Claim selected rewards" }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole("button", { name: "Advance accounting for WETH Fans" }),
  );
  expect(
    await screen.findByText(
      /Accounting saved 25 steps.*More maintenance remains/,
    ),
  ).toBeVisible();
  expect(m.write.mock.calls[0][0]).toMatchObject({
    address: tier,
    functionName: "processAccounting",
    args: [25n],
  });
});
it("never silently turns a claim into maintenance when its fresh preview becomes incomplete", async () => {
  mount();
  await selectFirst();
  m.preview.mockResolvedValue({
    results: [],
    blocked: { tier, name: "WETH Fans", tokenIds: [1n] },
    complete: false,
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Claim selected rewards" }),
  );
  expect(
    await screen.findByText(
      "Update accounting before claiming this selection.",
    ),
  ).toBeVisible();
  expect(m.write).not.toHaveBeenCalled();
});
it("bounds selection at 32 positions while leaving all positions discoverable", async () => {
  mount({ positions: 33 });
  for (let id = 1; id <= 32; id++)
    await userEvent.click(
      screen.getByRole("checkbox", { name: `WETH Fans membership #${id}` }),
    );
  expect(
    screen.getByText("32 memberships across 1 tiers selected."),
  ).toBeVisible();
  expect(
    screen.getByRole("checkbox", { name: "WETH Fans membership #33" }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole("checkbox", { name: "WETH Fans membership #1" }),
  );
  expect(
    screen.getByRole("checkbox", { name: "WETH Fans membership #33" }),
  ).toBeEnabled();
});
it("bounds selections at eight tiers and preserves them across tier pages", async () => {
  mount({ count: 9 });
  for (const checkbox of screen.getAllByRole("checkbox", { name: /^Include/ }))
    await userEvent.click(checkbox);
  await userEvent.click(
    screen.getByRole("button", { name: "More reward tiers" }),
  );
  expect(
    screen.getByRole("checkbox", { name: "Include Tier 9 tier rewards" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("checkbox", { name: "Tier 9 membership #1" }),
  ).toBeDisabled();
  await userEvent.click(
    screen.getByRole("button", { name: "Previous reward tiers" }),
  );
  expect(
    screen.getByRole("checkbox", { name: "Include WETH Fans tier rewards" }),
  ).toBeChecked();
  expect(m.preview.mock.calls.at(-1)![2]).toHaveLength(8);
});
it("rejects a receipt without the factory's selected-claim confirmation", async () => {
  m.receipt.mockResolvedValue({ status: "success", logs: [] });
  mount();
  await selectFirst();
  await userEvent.click(
    screen.getByRole("button", { name: "Claim selected rewards" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "did not confirm this selected claim",
  );
  expect(
    screen.getByRole("checkbox", { name: "WETH Fans membership #1" }),
  ).toBeChecked();
});
it("refreshes a submission-time accounting error into a named maintenance action", async () => {
  mount();
  await selectFirst();
  m.simulate.mockImplementationOnce(async () => {
    m.preview.mockResolvedValue({
      results: [{ ...previewResult(), complete: false }],
      blocked: { tier, name: "WETH Fans", tokenIds: [1n] },
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
    screen.getByRole("button", { name: "Claim selected rewards" }),
  );
  expect(
    await screen.findByRole("button", {
      name: "Advance accounting for WETH Fans",
    }),
  ).toBeEnabled();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "accounting needs to catch up",
  );
  expect(m.write).not.toHaveBeenCalled();
});
it("keeps routinely refreshed amounts outside live regions and labels incomplete discovery totals", async () => {
  mount({ complete: false });
  await selectFirst();
  expect(
    screen
      .getByText("Selected rewards: 10 WETH")
      .closest("[aria-live], [role=status], [role=alert]"),
  ).toBeNull();
  expect(
    screen.getByText(/Discovery is incomplete.*only the selected positions/),
  ).toBeVisible();
});
it("names the failed tier and retains its token revert reason", async () => {
  mount();
  await selectFirst();
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
    screen.getByRole("button", { name: "Claim selected rewards" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "WETH Fans: Transfers paused. No funds were claimed.",
  );
  expect(m.write).not.toHaveBeenCalled();
});
it("rejects a receipt paying another beneficiary", async () => {
  const receipt = claimReceipt();
  receipt.logs[0].topics = encodeEventTopics({
    abi: membershipTierAbi,
    eventName: "CreatorProceedsWithdrawn",
    args: { owner: factory },
  });
  m.receipt.mockResolvedValue(receipt);
  mount();
  await selectFirst();
  await userEvent.click(
    screen.getByRole("button", { name: "Claim selected rewards" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "unexpected reward beneficiary or position",
  );
});
it("rejects a receipt claiming an unselected token", async () => {
  const receipt = claimReceipt();
  receipt.logs.push({
    address: tier,
    topics: encodeEventTopics({
      abi: membershipTierAbi,
      eventName: "RewardClaimed",
      args: { tokenId: 2n, owner: wallet },
    }),
    data: encodeAbiParameters([{ type: "uint256" }], [3n]),
  });
  m.receipt.mockResolvedValue(receipt);
  mount({ positions: 2 });
  await selectFirst();
  await userEvent.click(
    screen.getByRole("button", { name: "Claim selected rewards" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "unexpected reward beneficiary or position",
  );
});
it("groups actual receipt payouts across live, retired, referral and creator categories and currencies", async () => {
  const receipt = claimReceipt(2n);
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
    address: tier,
    topics: encodeEventTopics({
      abi: membershipTierAbi,
      eventName: "RetiredRewardClaimed",
      args: { owner: wallet },
    }),
    data: encodeAbiParameters([{ type: "uint256" }], [4n]),
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
  mount({ count: 2 });
  await selectFirst();
  await userEvent.click(
    screen.getByRole("checkbox", { name: "Tier 2 membership #1" }),
  );
  await screen.findByText("Selected rewards: 10 USDG");
  await userEvent.click(
    screen.getByRole("button", { name: "Claim selected rewards" }),
  );
  expect(
    await screen.findByText(
      /Selected rewards claimed.*Paid 19 WETH.*Paid 5 USDG/,
    ),
  ).toBeVisible();
});
it("allows a direct settled retired claim even when a selected-position read fails", async () => {
  m.read.mockResolvedValue([4n, 1n]);
  m.preview.mockRejectedValue(new Error("TokenOwnerOnly"));
  m.receipt.mockResolvedValue({
    status: "success",
    logs: [
      {
        address: tier,
        topics: encodeEventTopics({
          abi: membershipTierAbi,
          eventName: "RetiredRewardClaimed",
          args: { owner: wallet },
        }),
        data: encodeAbiParameters([{ type: "uint256" }], [4n]),
      },
    ],
  });
  mount();
  await userEvent.click(
    screen.getByRole("checkbox", { name: "WETH Fans membership #1" }),
  );
  await screen.findByText(/Unable to refresh selected rewards/);
  await userEvent.click(
    screen.getByRole("button", { name: "Claim ended membership rewards" }),
  );
  expect(
    await screen.findByText(/Ended membership rewards claimed.*Paid 4 WETH/),
  ).toBeVisible();
  expect(m.write.mock.calls[0][0]).toMatchObject({
    address: tier,
    functionName: "claimRetiredRewards",
  });
});
it.each([
  { label: "different wallet", address: factory, chainId: 31337 },
  { label: "different chain", address: wallet, chainId: 1 },
])("prevents submission from a $label", async ({ address, chainId }) => {
  m.account.address = address;
  m.account.chainId = chainId;
  mount();
  await selectFirst();
  expect(
    screen.getByRole("button", { name: "Claim selected rewards" }),
  ).toBeDisabled();
  expect(m.simulate).not.toHaveBeenCalled();
});
it("rejects a cancelled replacement even if its receipt status is successful", async () => {
  m.receipt.mockImplementation(async ({ onReplaced }) => {
    onReplaced({ reason: "cancelled" });
    return claimReceipt();
  });
  mount();
  await selectFirst();
  await userEvent.click(
    screen.getByRole("button", { name: "Claim selected rewards" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "wallet cancelled",
  );
});
it("keeps selections after a reverted transaction", async () => {
  m.receipt.mockResolvedValue({ status: "reverted", logs: [] });
  mount();
  await selectFirst();
  await userEvent.click(
    screen.getByRole("button", { name: "Claim selected rewards" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "transaction reverted",
  );
  expect(
    screen.getByRole("checkbox", { name: "WETH Fans membership #1" }),
  ).toBeChecked();
});

it("lets the owner clear an invalid selection without silently dropping its positions", async () => {
  m.preview.mockRejectedValue(
    new Error("The selected NFT is no longer owned by this wallet."),
  );
  mount({ positions: 2 });
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("checkbox", { name: "WETH Fans membership #1" }),
  );
  await screen.findByRole("alert");
  expect(
    screen.getByRole("checkbox", { name: "WETH Fans membership #1" }),
  ).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Clear selection" }));
  expect(screen.getByText("No rewards selected.")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Your rewards" })).toHaveFocus();
  expect(m.write).not.toHaveBeenCalled();
});
