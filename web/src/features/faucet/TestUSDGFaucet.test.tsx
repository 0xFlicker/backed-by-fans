import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics } from "viem";
import { testUsdgAbi } from "@/contracts";
import { TestUSDGFaucet } from "./TestUSDGFaucet";

const mocks = vi.hoisted(() => ({
  account: {
    address: "0x3333333333333333333333333333333333333333",
    chainId: 31337,
  },
  next: 0n,
  gas: 1n,
  timestamp: 100n,
  simulate: vi.fn(),
  write: vi.fn(),
  receipt: vi.fn(),
}));
vi.mock("@rainbow-me/rainbowkit", () => ({
  ConnectButton: () => <button>Connect wallet</button>,
}));
vi.mock("@/lib/use-hydrated-account", () => ({
  useHydratedAccount: () => mocks.account,
}));
vi.mock("@wagmi/core", () => ({ simulateContract: mocks.simulate }));
vi.mock("wagmi", () => ({
  useConfig: () => ({}),
  useWriteContract: () => ({ writeContractAsync: mocks.write }),
  usePublicClient: () => ({
    getBlock: async () => ({ number: 1n, timestamp: mocks.timestamp }),
    getBalance: async () => mocks.gas,
    readContract: async ({ functionName }: { functionName: string }) =>
      functionName === "nextClaimAt" ? mocks.next : 100_000_000n,
    waitForTransactionReceipt: mocks.receipt,
  }),
}));
function mount() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <TestUSDGFaucet
        chainId={31337}
        address="0x1111111111111111111111111111111111111111"
      />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.next = 0n;
  mocks.gas = 1n;
  mocks.timestamp = 100n;
  mocks.account.chainId = 31337;
});
it("blocks claims during the on-chain cooldown", async () => {
  mocks.next = 101n;
  mount();
  await screen.findByText(/Next claim:/);
  expect(screen.getByRole("button", { name: "Claim 100 bUSD" })).toBeDisabled();
});
it("allows a claim at the exact cooldown boundary", async () => {
  mocks.next = 100n;
  mount();
  await screen.findByText("Your balance: 100 bUSD");
  expect(screen.getByRole("button", { name: "Claim 100 bUSD" })).toBeEnabled();
});
it("requires gas and offers the ETH faucet", async () => {
  mocks.gas = 0n;
  mount();
  await screen.findByText("Your balance: 100 bUSD");
  expect(screen.getByRole("button", { name: "Claim 100 bUSD" })).toBeDisabled();
  expect(screen.getByRole("link", { name: /Get test ETH/ })).toHaveAttribute(
    "target",
    "_blank",
  );
});
it("uses the simulation request and rejects an unconfirmed claim", async () => {
  const request = {
    address: "0x1111111111111111111111111111111111111111",
    functionName: "claim",
  };
  mocks.simulate.mockResolvedValue({ request });
  mocks.write.mockResolvedValue("0x123");
  mocks.receipt.mockResolvedValue({ status: "success", logs: [] });
  mount();
  await screen.findByText("Your balance: 100 bUSD");
  await userEvent.click(screen.getByRole("button", { name: "Claim 100 bUSD" }));
  await screen.findByRole("alert");
  expect(mocks.write).toHaveBeenCalledWith(request);
  expect(screen.queryByText("100 bUSD received.")).not.toBeInTheDocument();
});

it("confirms a matching mint receipt and refreshes the cooldown", async () => {
  mocks.simulate.mockResolvedValue({ request: { functionName: "claim" } });
  mocks.write.mockResolvedValue("0x123");
  mocks.receipt.mockImplementation(async () => {
    mocks.next = 86_500n;
    return {
      status: "success",
      logs: [
        {
          address: "0x1111111111111111111111111111111111111111",
          topics: encodeEventTopics({
            abi: testUsdgAbi,
            eventName: "Claimed",
            args: { account: mocks.account.address as `0x${string}` },
          }),
          data: encodeAbiParameters(
            [{ type: "uint256" }, { type: "uint256" }],
            [100_000_000n, mocks.next],
          ),
        },
      ],
    };
  });
  mount();
  await screen.findByText("Your balance: 100 bUSD");
  await userEvent.click(screen.getByRole("button", { name: "Claim 100 bUSD" }));
  await screen.findByText("100 bUSD received.");
  await screen.findByText(/Next claim:/);
  expect(screen.getByRole("button", { name: "Claim 100 bUSD" })).toBeDisabled();
});
