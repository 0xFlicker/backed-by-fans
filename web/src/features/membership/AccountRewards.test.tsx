import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import {
  ContractFunctionRevertedError,
  encodeErrorResult,
  encodeEventTopics,
  encodeAbiParameters,
  getAbiItem,
} from "viem";
import { membershipFactoryAbi, protocolBurnRouterAbi } from "@/contracts";
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
}));
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
    paymentToken: token as typeof token,
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
        formatAmount={(amount) => `${amount} WETH`}
      />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  m.simulate.mockImplementation(async (_config, request) => ({
    request,
    result: [{ processedSteps: 0n, reward: 2n, referral: 3n, creator: 5n }],
  }));
  m.write.mockResolvedValue(`0x${"ab".repeat(32)}`);
  m.read.mockResolvedValue(factory);
  m.receipt.mockResolvedValue({
    status: "success",
    logs: [
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
  await userEvent.click(
    screen.getByRole("button", { name: "Claim everything" }),
  );
  expect(await screen.findByText("Rewards claimed.")).toBeVisible();
  expect(m.write.mock.calls[0][0]).toBe(
    (await m.simulate.mock.results[1].value).request,
  );
});
it("does not spend gas on zero claims", async () => {
  m.simulate.mockResolvedValue({
    result: [{ processedSteps: 0n, reward: 0n, referral: 0n, creator: 0n }],
  });
  mount();
  expect(await screen.findByText("All claimed.")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Claim everything" }),
  ).toBeDisabled();
  expect(m.write).not.toHaveBeenCalled();
});
function behind() {
  return new ContractFunctionRevertedError({
    abi: membershipFactoryAbi,
    functionName: "claimEverything",
    data: encodeErrorResult({
      abi: membershipFactoryAbi,
      errorName: "ClaimAccountingBehind",
      args: [0n, tier, 900n, 950n],
    }),
  });
}
it("names a blocked tier and advances only that tier", async () => {
  m.simulate.mockImplementation(async (_config, request) => {
    if (request.functionName === "claimEverything") throw behind();
    return { request, result: 25n };
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
  m.simulate.mockRejectedValue(behind());
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
  expect(m.simulate.mock.calls[0][1].args[0]).toHaveLength(8);
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() =>
    expect(m.simulate.mock.calls.at(-1)![1].args[0]).toHaveLength(1),
  );
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
