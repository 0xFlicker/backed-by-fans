import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, getAbiItem } from "viem";
import { protocolBuybackVaultAbi } from "@/contracts";
import { ProcessBuyback } from "./ProcessBuyback";

const mocked = vi.hoisted(() => ({
  account: {
    address: "0x3333333333333333333333333333333333333333",
    isConnected: true,
    chainId: 31337,
  },
  read: vi.fn(),
  block: vi.fn(),
  simulate: vi.fn(),
  write: vi.fn(),
  receipt: vi.fn(),
}));
vi.mock("wagmi", () => ({
  useConfig: () => ({}),
  usePublicClient: () => ({
    readContract: mocked.read,
    getBlock: mocked.block,
    waitForTransactionReceipt: mocked.receipt,
  }),
  useWriteContract: () => ({
    writeContractAsync: mocked.write,
    isPending: false,
  }),
}));
vi.mock("@wagmi/core", () => ({ simulateContract: mocked.simulate }));
vi.mock("@/lib/use-hydrated-account", () => ({
  useHydratedAccount: () => mocked.account,
}));
const vault = "0x1111111111111111111111111111111111111111",
  asset = "0x2222222222222222222222222222222222222222";
const refresh = vi.fn();
function mount(status = 0) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { mutations: { retry: false } } })
      }
    >
      <ProcessBuyback
        chainId={31337}
        vault={vault}
        asset={asset}
        protocolTokenSymbol="BBFFORK"
        bucket={0}
        status={status}
        amount={100n}
        fresh
        onProcessed={refresh}
      />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  mocked.account.chainId = 31337;
  mocked.account.isConnected = true;
  mocked.read.mockImplementation(async ({ functionName }) =>
    functionName === "processingStatus"
      ? { status: 0, maxInput: 100n, revision: 2n }
      : { available: 40n },
  );
  mocked.block.mockResolvedValue({ timestamp: 1000n });
  mocked.simulate.mockResolvedValue({
    request: { verified: "exact-library-request" },
  });
  mocked.write.mockResolvedValue(`0x${"3".repeat(64)}`);
  const event = getAbiItem({
    abi: protocolBuybackVaultAbi,
    name: "BuybackBurned",
  });
  mocked.receipt.mockResolvedValue({
    status: "success",
    blockNumber: 10n,
    transactionHash: `0x${"3".repeat(64)}`,
    logs: [
      {
        address: vault,
        topics: encodeEventTopics({
          abi: protocolBuybackVaultAbi,
          eventName: "BuybackBurned",
          args: { sequence: 1n, bucket: 0, input: asset },
        }),
        data: encodeAbiParameters(
          event.inputs.filter((input) => !input.indexed),
          [60n, 2342737926990313551770n, 0, 2n],
        ),
      },
    ],
  });
});
it("uses the exact simulated wagmi write, viem receipt and canonical burn postcondition", async () => {
  mount();
  await userEvent.click(
    screen.getByRole("button", { name: "Process membership fees" }),
  );
  expect(await screen.findByText(/Burn complete/)).toHaveTextContent(
    "Burn complete. 2,342.738 BBFFORK permanently removed from supply.",
  );
  expect(screen.getByTitle("2342.73792699031355177 BBFFORK")).toBeVisible();
  expect(mocked.write).toHaveBeenCalledWith(
    (await mocked.simulate.mock.results[0].value).request,
  );
  expect(mocked.receipt).toHaveBeenCalledWith(
    expect.objectContaining({ hash: `0x${"3".repeat(64)}` }),
  );
  expect(mocked.read).toHaveBeenCalledWith(
    expect.objectContaining({ functionName: "inventory", blockNumber: 10n }),
  );
  expect(refresh).toHaveBeenCalled();
});
it("requires the selected wallet network", () => {
  mocked.account.chainId = 4663;
  mount();
  expect(
    screen.getByRole("button", { name: "Process membership fees" }),
  ).toBeDisabled();
  expect(mocked.simulate).not.toHaveBeenCalled();
});
it("preserves a confirmed burn when the receipt-block inventory read fails", async () => {
  mocked.read.mockImplementation(async ({ functionName }) => {
    if (functionName === "processingStatus")
      return { status: 0, maxInput: 100n, revision: 2n };
    throw new Error("RPC unavailable");
  });
  mount();
  await userEvent.click(
    screen.getByRole("button", { name: "Process membership fees" }),
  );
  expect(await screen.findByText(/Burn complete/)).toHaveTextContent(
    "updated inventory is unavailable",
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(mocked.write).toHaveBeenCalledOnce();
});
it("shows wallet rejection without assuming a broadcast or retrying", async () => {
  mocked.write.mockRejectedValueOnce(new Error("User rejected the request"));
  mount();
  await userEvent.click(
    screen.getByRole("button", { name: "Process membership fees" }),
  );
  await screen.findByRole("alert");
  expect(mocked.write).toHaveBeenCalledOnce();
  expect(mocked.receipt).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
});
it("does not show burn success for a cancelled replacement", async () => {
  mocked.receipt.mockImplementationOnce(async ({ onReplaced }) => {
    onReplaced({ reason: "cancelled" });
    return { status: "success", logs: [] };
  });
  mount();
  await userEvent.click(
    screen.getByRole("button", { name: "Process membership fees" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("cancelled"),
  );
  expect(refresh).not.toHaveBeenCalled();
});

it("keeps operator market execution out of public wallet actions", () => {
  mount(10);
  expect(
    screen.queryByRole("button", { name: "Process membership fees" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(
      "Market purchases are executed by the authorized operator",
    ),
  ).toBeInTheDocument();
});
