import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics } from "viem";
import { membershipTierAbi } from "@/contracts";
import { ReleaseTierFees } from "./ReleaseTierFees";

const mock = vi.hoisted(() => ({
  read: vi.fn(),
  simulate: vi.fn(),
  write: vi.fn(),
  receipt: vi.fn(),
  chainId: 31337,
}));
vi.mock("wagmi", () => ({
  useConfig: () => ({}),
  usePublicClient: () => ({
    readContract: mock.read,
    getBlockNumber: async () => 100n,
    waitForTransactionReceipt: mock.receipt,
  }),
  useWriteContract: () => ({
    writeContractAsync: mock.write,
    isPending: false,
  }),
}));
vi.mock("@wagmi/core", () => ({ simulateContract: mock.simulate }));
vi.mock("./gas-readiness", () => ({ assertSufficientGas: vi.fn() }));
vi.mock("@/lib/use-hydrated-account", () => ({
  useHydratedAccount: () => ({
    address: "0x3333333333333333333333333333333333333333",
    isConnected: true,
    chainId: mock.chainId,
  }),
}));
const tier = "0x1111111111111111111111111111111111111111";
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
  vi.clearAllMocks();
  mock.chainId = 31337;
  mock.read.mockImplementation(async ({ functionName, args }) => {
    if (functionName === "totalMinted") return 101n;
    if (functionName === "MAX_SYNC_BATCH_SIZE") return 100n;
    if (functionName === "protocolFeeEarnedHeld") return 50n;
    return {
      uncheckpointedEarned: args[0] === 1n || args[0] === 101n ? 10n : 0n,
    };
  });
  mock.simulate.mockImplementation(async (config, request) => ({ request }));
  mock.write.mockResolvedValue(`0x${"12".repeat(32)}`);
  mock.receipt.mockResolvedValue({
    status: "success",
    transactionHash: `0x${"12".repeat(32)}`,
    logs: [
      {
        address: tier,
        topics: encodeEventTopics({
          abi: membershipTierAbi,
          eventName: "ProtocolFeesAccrued",
          args: { tokenId: 1n, generation: 0n },
        }),
        data: encodeAbiParameters(
          [{ type: "uint256" }, { type: "uint256" }],
          [10n, 10n],
        ),
      },
    ],
  });
});
it("lets a non-owner accrue eligible IDs and confirms the receipt", async () => {
  mount();
  const button = screen.getByRole("button", { name: "Accrue fees" });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.setup().click(button);
  expect(
    await screen.findByText("Fees accrued. Release earned fees next."),
  ).toBeVisible();
  expect(mock.simulate.mock.calls[0][1]).toMatchObject({
    functionName: "accrueProtocolFees",
    args: [[1n]],
  });
  expect(mock.write).toHaveBeenCalledWith(mock.simulate.mock.calls[0][1]);
});
it("releases accrued fees with a matching tier receipt", async () => {
  mock.receipt.mockResolvedValue({
    status: "success",
    transactionHash: `0x${"12".repeat(32)}`,
    logs: [
      {
        address: tier,
        topics: encodeEventTopics({
          abi: membershipTierAbi,
          eventName: "ProtocolFeesReleased",
          args: { vault: tier, asset: tier },
        }),
        data: encodeAbiParameters([{ type: "uint256" }], [50n]),
      },
    ],
  });
  mount();
  const button = screen.getByRole("button", { name: "Release earned fees" });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.setup().click(button);
  expect(
    await screen.findByText(/Fees released. You can now process/),
  ).toBeVisible();
  expect(mock.simulate.mock.calls[0][1].functionName).toBe(
    "releaseProtocolFees",
  );
});
it("does not claim success for a reverted release", async () => {
  mock.receipt.mockResolvedValue({ status: "reverted", logs: [] });
  mount();
  const button = screen.getByRole("button", { name: "Release earned fees" });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.setup().click(button);
  expect(await screen.findByRole("alert")).toHaveTextContent("reverted");
  expect(
    screen.queryByText(/Fees released. You can now process/),
  ).not.toBeInTheDocument();
});
it("exposes subsequent historical membership batches", async () => {
  mount();
  await userEvent
    .setup()
    .click(
      await screen.findByRole("button", { name: "Next membership batch" }),
    );
  await screen.findByText(/Membership IDs 101–101/);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Accrue fees" }));
  await waitFor(() =>
    expect(mock.simulate.mock.calls[0][1]).toMatchObject({ args: [[101n]] }),
  );
});
it("blocks the wrong network and reports failed reads instead of zero fees", async () => {
  mock.chainId = 46630;
  mock.read.mockRejectedValue(new Error("RPC unavailable"));
  mount();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Fee eligibility could not be read",
  );
  expect(
    screen.getByRole("button", { name: "Release earned fees" }),
  ).toBeDisabled();
  expect(screen.getByText("Switch your wallet to this network.")).toBeVisible();
});
