import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
} from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import {
  ContractFunctionRevertedError,
  encodeErrorResult,
  encodeAbiParameters,
  encodeEventTopics,
  getAbiItem,
} from "viem";
import { protocolBurnRouterAbi } from "@/contracts";
import { Burn } from "./Burn";

const m = vi.hoisted(() => ({
  account: {
    address: "0x3333333333333333333333333333333333333333",
    isConnected: true,
    chainId: 31337,
  },
  prepare: vi.fn(),
  simulate: vi.fn(),
  write: vi.fn(),
  receipt: vi.fn(),
  gas: vi.fn(),
  reset: vi.fn(),
}));
vi.mock("wagmi", () => ({
  useConfig: () => ({}),
  usePublicClient: () => ({ waitForTransactionReceipt: m.receipt }),
  useWriteContract: () => ({ writeContractAsync: m.write, reset: m.reset }),
}));
vi.mock("@wagmi/core", () => ({ simulateContract: m.simulate }));
vi.mock("@/lib/use-hydrated-account", () => ({
  useHydratedAccount: () => m.account,
}));
vi.mock("./prepare-burn", () => ({ prepareBurn: m.prepare }));
vi.mock("./gas-readiness", () => ({ assertSufficientGas: m.gas }));
const router = "0x2222222222222222222222222222222222222222";
const factory = "0x1111111111111111111111111111111111111111";
function mount(
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  render(
    <QueryClientProvider client={client}>
      <Burn chainId={31337} factory={factory} />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  m.account.isConnected = true;
  m.prepare.mockResolvedValue({
    router,
    collections: [],
    purchases: [],
    deadline: 1000n,
    moreCollections: false,
    unavailableCollections: 0,
  });
  m.simulate.mockResolvedValue({
    request: { address: router, functionName: "burn" },
  });
  m.write.mockResolvedValue(`0x${"1".repeat(64)}`);
  m.gas.mockResolvedValue(undefined);
  const event = getAbiItem({
    abi: protocolBurnRouterAbi,
    name: "BurnCompleted",
  });
  m.receipt.mockResolvedValue({
    status: "success",
    transactionHash: `0x${"1".repeat(64)}`,
    logs: [
      {
        address: router,
        topics: encodeEventTopics({
          abi: protocolBurnRouterAbi,
          eventName: "BurnCompleted",
          args: { caller: m.account.address as `0x${string}` },
        }),
        data: encodeAbiParameters(
          event.inputs.filter((i) => !i.indexed),
          [3n, 2n, 123n * 10n ** 18n],
        ),
      },
    ],
  });
});
it("builds on click and sends exactly the simulated request once", async () => {
  mount();
  expect(m.prepare).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Burn" }));
  expect(await screen.findByText(/123 protocol tokens burned/)).toBeVisible();
  expect(m.write).toHaveBeenCalledTimes(1);
  expect(m.write.mock.calls[0][0]).toBe(
    (await m.simulate.mock.results[0].value).request,
  );
});
it("does not request a wallet transaction when nothing is ready", async () => {
  m.simulate.mockRejectedValue(
    new ContractFunctionRevertedError({
      abi: protocolBurnRouterAbi,
      functionName: "burn",
      data: encodeErrorResult({
        abi: protocolBurnRouterAbi,
        errorName: "NothingToDo",
      }),
    }),
  );
  mount();
  await userEvent.click(screen.getByRole("button", { name: "Burn" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Nothing is ready",
  );
  expect(m.write).not.toHaveBeenCalled();
});
it("does not call collection-only progress a burn", async () => {
  const r = await m.receipt();
  const event = getAbiItem({
    abi: protocolBurnRouterAbi,
    name: "BurnCompleted",
  });
  r.logs[0].data = encodeAbiParameters(
    event.inputs.filter((i) => !i.indexed),
    [1n, 0n, 0n],
  );
  m.receipt.mockResolvedValue(r);
  mount();
  await userEvent.click(screen.getByRole("button", { name: "Burn" }));
  expect(await screen.findByText(/Earned fees collected/)).toBeVisible();
  expect(screen.queryByText(/tokens burned/)).not.toBeInTheDocument();
});
it("requires a matching completion event before claiming success", async () => {
  m.receipt.mockResolvedValue({ status: "success", logs: [] });
  mount();
  await userEvent.click(screen.getByRole("button", { name: "Burn" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "does not confirm",
  );
});

it.each(["router", "caller"])(
  "rejects an unrelated completion %s",
  async (identity) => {
    const receipt = await m.receipt();
    if (identity === "router") receipt.logs[0].address = factory;
    else
      receipt.logs[0].topics = encodeEventTopics({
        abi: protocolBurnRouterAbi,
        eventName: "BurnCompleted",
        args: { caller: factory },
      });
    m.receipt.mockResolvedValue(receipt);
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Burn" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "does not confirm",
    );
  },
);

it("shows a wallet cancellation instead of claiming a burn", async () => {
  m.receipt.mockImplementationOnce(async ({ onReplaced }) => {
    onReplaced({ reason: "cancelled" });
    return { status: "success", logs: [] };
  });
  mount();
  await userEvent.click(screen.getByRole("button", { name: "Burn" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("cancelled");
});

it("reports a reverted transaction and prepares anew on the next click", async () => {
  m.receipt.mockResolvedValueOnce({ status: "reverted", logs: [] });
  mount();
  await userEvent.click(screen.getByRole("button", { name: "Burn" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("reverted");
  await userEvent.click(screen.getByRole("button", { name: "Burn" }));
  expect(await screen.findByText(/protocol tokens burned/)).toBeVisible();
  expect(m.prepare).toHaveBeenCalledTimes(2);
});

it("refreshes protocol queries and keeps the burn confirmed when refetch fails", async () => {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const read = vi
    .fn()
    .mockResolvedValueOnce("before")
    .mockRejectedValue(new Error("RPC unavailable"));
  const observer = new QueryObserver(cache, {
    queryKey: ["protocol", 31337, "snapshot"],
    queryFn: read,
  });
  const unsubscribe = observer.subscribe(() => undefined);
  try {
    await waitFor(() =>
      expect(observer.getCurrentResult().status).toBe("success"),
    );
    mount(cache);
    await userEvent.click(screen.getByRole("button", { name: "Burn" }));
    expect(await screen.findByText(/123 protocol tokens burned/)).toBeVisible();
    expect(
      await screen.findByText("Refresh activity to load the updated balances."),
    ).toBeVisible();
    expect(read).toHaveBeenCalledTimes(2);
  } finally {
    unsubscribe();
  }
});

it.each(["prepare", "write", "receipt"] as const)(
  "surfaces %s failures without automatically repeating writes",
  async (stage) => {
    m[stage].mockRejectedValueOnce(new Error("Connection unavailable"));
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Burn" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Connection unavailable",
    );
    expect(m.write.mock.calls.length).toBeLessThanOrEqual(1);
  },
);

it("disables repeated clicks while fresh planning is unresolved", async () => {
  const plan = await m.prepare();
  let finish!: (value: unknown) => void;
  m.prepare.mockClear();
  m.prepare.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  mount();
  await userEvent.dblClick(screen.getByRole("button", { name: "Burn" }));
  expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
  expect(m.prepare).toHaveBeenCalledTimes(1);
  finish(plan);
  expect(await screen.findByText(/protocol tokens burned/)).toBeVisible();
  expect(m.write).toHaveBeenCalledTimes(1);
});
