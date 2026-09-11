import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  getAbiItem,
  zeroAddress,
} from "viem";
import { protocolBurnRouterAbi } from "@/contracts";
import { ReleaseTierFees } from "./ReleaseTierFees";
const mock = vi.hoisted(() => ({
  read: vi.fn(),
  preview: vi.fn(),
  simulate: vi.fn(),
  write: vi.fn(),
  receipt: vi.fn(),
  chainId: 31337,
}));
vi.mock("wagmi", () => ({
  useConfig: () => ({}),
  usePublicClient: () => ({
    readContract: mock.read,
    getBlock: async () => ({ number: 100n, timestamp: 1000n }),
    waitForTransactionReceipt: mock.receipt,
  }),
  useWriteContract: () => ({
    writeContractAsync: mock.write,
    isPending: false,
  }),
}));
vi.mock("./preview-advance", () => ({ previewAdvance: mock.preview }));
vi.mock("@wagmi/core", () => ({ simulateContract: mock.simulate }));
vi.mock("./gas-readiness", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./gas-readiness")>()),
  assertSufficientGas: vi.fn(),
}));
vi.mock("@/lib/use-hydrated-account", () => ({
  useHydratedAccount: () => ({
    address: "0x3333333333333333333333333333333333333333",
    isConnected: true,
    chainId: mock.chainId,
  }),
}));
const tier = "0x1111111111111111111111111111111111111111";
const router = "0x2222222222222222222222222222222222222222";
const caller = "0x3333333333333333333333333333333333333333";
function mount() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ReleaseTierFees chainId={31337} tier={tier} blockNumber={100n} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  mock.preview.mockResolvedValue({
    processedSteps: 25n,
    purchases: 1n,
    ready: true,
    useful: true,
    complete: false,
  });
  mock.chainId = 31337;
  mock.read.mockImplementation(async ({ functionName }) => {
    if (functionName === "accountingStatus")
      return {
        accountedThrough: 950n,
        nextBoundary: 970n,
        scheduledMembers: 10000n,
        complete: false,
      };
    if (functionName === "protocolFeeEarnedHeld") return 50n;
    if (functionName === "factory") return tier;
    if (functionName === "burnRouter") return router;
    if (functionName === "buybackVault") return router;
    if (functionName === "paymentToken") return tier;
    if (functionName === "protocolToken") return zeroAddress;
    throw new Error("Unexpected " + functionName);
  });
  mock.simulate.mockImplementation(async (_config, request) => ({
    request,
    result:
      request.functionName === "advanceAccounting"
        ? 25n
        : request.functionName === "buyback"
          ? [1n, 123n]
          : [25n, 1n, 1n, 123n],
  }));
  mock.write.mockResolvedValue("0x" + "12".repeat(32));
  const event = getAbiItem({
    abi: protocolBurnRouterAbi,
    name: "AdvanceCompleted",
  });
  mock.receipt.mockResolvedValue({
    status: "success",
    transactionHash: "0x" + "12".repeat(32),
    logs: [
      {
        address: router,
        topics: encodeEventTopics({
          abi: protocolBurnRouterAbi,
          eventName: "AdvanceCompleted",
          args: { caller },
        }),
        data: encodeAbiParameters(
          event.inputs.filter((item) => !item.indexed),
          [25n, 1n, 0n, 0n, false],
        ),
      },
    ],
  });
});
it("lets any wallet advance and release with the exact simulated request", async () => {
  mount();
  const button = screen.getByRole("button", { name: "Advance accounting" });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
  expect(await screen.findByText(/25 checkpoints completed/)).toBeVisible();
  expect(mock.simulate.mock.calls[0][1]).toMatchObject({
    functionName: "advanceAccounting",
    address: router,
    args: [[{ tier, maxAccountingSteps: 25n }]],
  });
  expect(mock.write.mock.calls[0][0]).toBe(
    (await mock.simulate.mock.results[0].value).request,
  );
  expect(screen.getByText(/More remains. Advance again/)).toBeVisible();
  expect(
    mock.read.mock.calls.some(([item]) => item.functionName === "totalMinted"),
  ).toBe(false);
});
it("offers buyback-only without accounting or release", async () => {
  mount();
  await userEvent.selectOptions(screen.getByLabelText("Action"), "buyback");
  const button = screen.getByRole("button", { name: "Buyback and burn" });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
  await screen.findByText(/25 checkpoints completed/);
  expect(
    mock.simulate.mock.calls.find(
      ([, request]) => request.functionName === "buyback",
    )![1],
  ).toMatchObject({
    functionName: "buyback",
    args: [[], 1300n],
  });
});
it("includes the canonical payment asset's current buyback revision in the same advance", async () => {
  const original = mock.read.getMockImplementation()!;
  mock.read.mockImplementation(async (request) => {
    if (request.functionName === "protocolToken") return caller;
    if (request.functionName === "canonicalAsset") return zeroAddress;
    if (request.functionName === "revision") return 7n;
    return original(request);
  });
  mount();
  await userEvent.selectOptions(screen.getByLabelText("Action"), "both");
  const button = screen.getByRole("button", { name: "Advance and burn" });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
  await screen.findByText(/25 checkpoints completed/);
  expect(
    mock.simulate.mock.calls.find(
      ([, request]) => request.functionName === "advance",
    )![1].args[1],
  ).toEqual([{ asset: zeroAddress, revision: 7n }]);
});
it("uses a fixed checkpoint budget without numerical input", () => {
  mount();
  expect(
    screen.queryByLabelText("Maximum checkpoints"),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/up to 25 checkpoints/)).toBeVisible();
});
it("does not report success after a reverted transaction", async () => {
  mock.receipt.mockResolvedValue({ status: "reverted", logs: [] });
  mount();
  const button = screen.getByRole("button", { name: "Advance accounting" });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
  expect(await screen.findByRole("alert")).toHaveTextContent("reverted");
  expect(screen.queryByText(/checkpoints completed/)).not.toBeInTheDocument();
});
it("requires the router completion event for this caller", async () => {
  const receipt = await mock.receipt();
  receipt.logs[0].address = tier;
  mock.receipt.mockResolvedValue(receipt);
  mount();
  const button = screen.getByRole("button", { name: "Advance accounting" });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "does not confirm",
  );
});
it("blocks the wrong network and reports failed reads", async () => {
  mock.chainId = 46630;
  mock.read.mockRejectedValue(new Error("RPC unavailable"));
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Accounting could not be read",
  );
  expect(
    screen.getByRole("button", { name: "Advance accounting" }),
  ).toBeDisabled();
});

it("shows up to date and requires explicit settlement for accrual alone", async () => {
  mock.simulate.mockImplementation(async (_config, request) => ({
    request,
    result: 0n,
  }));
  mock.preview.mockResolvedValue({
    processedSteps: 0n,
    purchases: 0n,
    ready: false,
    useful: true,
    complete: true,
  });
  mount();
  expect(await screen.findByText("Accounting is up to date.")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Advance accounting" }),
  ).toBeDisabled();
  expect(mock.write).not.toHaveBeenCalled();
  await userEvent.click(screen.getByText("Accounting details"));
  await userEvent.click(
    screen.getByRole("button", { name: "Settle accrued rewards" }),
  );
  await waitFor(() => expect(mock.write).toHaveBeenCalledOnce());
});
