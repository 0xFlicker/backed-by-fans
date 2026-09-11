import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
} from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, getAbiItem } from "viem";
import { protocolBurnRouterAbi } from "@/contracts";
import { Burn } from "./Burn";

const m = vi.hoisted(() => ({
  account: {
    address: "0x3333333333333333333333333333333333333333",
    isConnected: true,
    chainId: 31337,
  },
  prepare: vi.fn(),
  preview: vi.fn(),
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
vi.mock("./preview-advance", () => ({ previewAdvance: m.preview }));
vi.mock("./prepare-burn", () => ({ prepareAdvance: m.prepare }));
vi.mock("./gas-readiness", () => ({ assertSufficientGas: m.gas }));
const router = "0x2222222222222222222222222222222222222222";
const factory = "0x1111111111111111111111111111111111111111";
async function clickReady() {
  const button = screen.getByRole("button", { name: "Advance and burn" });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
}
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
  vi.resetAllMocks();
  m.account.isConnected = true;
  m.prepare.mockResolvedValue({
    router,
    tiers: [],
    purchases: [],
    deadline: 1000n,
    accountingCoverageIncomplete: false,
    unavailableTiers: 0,
  });
  m.preview.mockResolvedValue({
    processedSteps: 10n,
    purchases: 2n,
    ready: true,
    useful: true,
    funds: [],
    complete: true,
  });
  m.simulate.mockResolvedValue({
    request: { address: router, functionName: "advance" },
    result: [10n, 3n, 2n, 123n * 10n ** 18n],
  });
  m.write.mockResolvedValue(`0x${"1".repeat(64)}`);
  m.gas.mockResolvedValue(undefined);
  const event = getAbiItem({
    abi: protocolBurnRouterAbi,
    name: "AdvanceCompleted",
  });
  m.receipt.mockResolvedValue({
    status: "success",
    transactionHash: `0x${"1".repeat(64)}`,
    logs: [
      {
        address: router,
        topics: encodeEventTopics({
          abi: protocolBurnRouterAbi,
          eventName: "AdvanceCompleted",
          args: { caller: m.account.address as `0x${string}` },
        }),
        data: encodeAbiParameters(
          event.inputs.filter((i) => !i.indexed),
          [10n, 3n, 2n, 123n * 10n ** 18n, true],
        ),
      },
    ],
  });
});
it("previews before signing and submits a fresh simulation request", async () => {
  mount();
  await waitFor(() => expect(m.prepare).toHaveBeenCalled());
  expect(m.simulate).not.toHaveBeenCalled();
  await clickReady();
  expect(await screen.findByText(/123 protocol tokens burned/)).toBeVisible();
  expect(m.write).toHaveBeenCalledTimes(1);
  expect(m.write.mock.calls[0][0]).toBe(
    (await m.simulate.mock.results[0].value).request,
  );
});
it("does not request a wallet transaction when nothing is ready", async () => {
  m.preview.mockResolvedValue({
    processedSteps: 0n,
    purchases: 0n,
    ready: false,
    useful: false,
    funds: [],
    complete: true,
  });
  mount();
  expect(
    await screen.findByText("Nothing needs advancing in this batch."),
  ).not.toBeVisible();
  expect(
    screen.getByRole("button", { name: "Advance and burn" }),
  ).toBeDisabled();
  expect(m.write).not.toHaveBeenCalled();
});
it("does not call collection-only progress a burn", async () => {
  const r = await m.receipt();
  const event = getAbiItem({
    abi: protocolBurnRouterAbi,
    name: "AdvanceCompleted",
  });
  r.logs[0].data = encodeAbiParameters(
    event.inputs.filter((i) => !i.indexed),
    [0n, 1n, 0n, 0n, false],
  );
  m.receipt.mockResolvedValue(r);
  mount();
  await clickReady();
  expect(await screen.findByText(/Earned fees released/)).toBeVisible();
  expect(screen.queryByText(/tokens burned/)).not.toBeInTheDocument();
});
it("requires a matching completion event before claiming success", async () => {
  m.receipt.mockResolvedValue({ status: "success", logs: [] });
  mount();
  await clickReady();
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
        eventName: "AdvanceCompleted",
        args: { caller: factory },
      });
    m.receipt.mockResolvedValue(receipt);
    mount();
    await clickReady();
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
  await clickReady();
  expect(await screen.findByRole("alert")).toHaveTextContent("cancelled");
});

it("reports a reverted transaction and prepares anew on the next click", async () => {
  m.receipt.mockResolvedValueOnce({ status: "reverted", logs: [] });
  mount();
  await clickReady();
  expect(await screen.findByRole("alert")).toHaveTextContent("reverted");
  await clickReady();
  expect(await screen.findByText(/protocol tokens burned/)).toBeVisible();
  expect(m.prepare.mock.calls.length).toBeGreaterThanOrEqual(3);
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
    await clickReady();
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
    if (stage !== "prepare") await clickReady();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Connection unavailable",
    );
    expect(m.write.mock.calls.length).toBeLessThanOrEqual(1);
  },
);

it("does not enable submission while the preview is unresolved", async () => {
  let finish!: (value: unknown) => void;
  const plan = await m.prepare();
  m.prepare.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  mount();
  const button = screen.getByRole("button", { name: "Advance and burn" });
  expect(button).toBeDisabled();
  expect(m.write).not.toHaveBeenCalled();
  finish(plan);
  await waitFor(() => expect(button).toBeEnabled());
});

it.each([true, false])(
  "reports remaining checkpoints from the receipt (complete=%s)",
  async (complete) => {
    const receipt = await m.receipt();
    const event = getAbiItem({
      abi: protocolBurnRouterAbi,
      name: "AccountingAdvanced",
    });
    receipt.logs.push({
      address: router,
      topics: encodeEventTopics({
        abi: protocolBurnRouterAbi,
        eventName: "AccountingAdvanced",
        args: { caller: m.account.address as `0x${string}`, tier: factory },
      }),
      data: encodeAbiParameters(
        event.inputs.filter((input) => !input.indexed),
        [25n, 1000n, complete, 1n],
      ),
    });
    m.receipt.mockResolvedValue(receipt);
    mount();
    await clickReady();
    await screen.findByText(/123 protocol tokens burned/);
    expect(Boolean(screen.queryByText(/More checkpoints remain/))).toBe(
      !complete,
    );
  },
);

it("keeps continuous accrual out of the main action but allows explicit settlement", async () => {
  m.simulate.mockResolvedValue({
    request: { address: router, functionName: "advance" },
    result: [0n, 1n, 0n, 0n],
  });
  m.preview.mockResolvedValue({
    processedSteps: 0n,
    purchases: 0n,
    ready: false,
    useful: true,
    funds: [],
    complete: true,
  });
  mount();
  expect(
    await screen.findByText("Accounting is up to date."),
  ).not.toBeVisible();
  expect(
    screen.getByRole("button", { name: "Advance and burn" }),
  ).toBeDisabled();
  expect(m.write).not.toHaveBeenCalled();
  await userEvent.click(screen.getByText("Accounting details"));
  m.simulate.mockResolvedValue({
    request: { address: router, functionName: "advanceAccounting" },
    result: 0n,
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Settle accrued rewards" }),
  );
  await waitFor(() => expect(m.write).toHaveBeenCalledOnce());
  expect(m.simulate.mock.calls[0][1].functionName).toBe("advanceAccounting");
});
it("does not submit if ready work disappears after the preview", async () => {
  mount();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Advance and burn" }),
    ).toBeEnabled(),
  );
  m.preview.mockResolvedValue({
    processedSteps: 0n,
    purchases: 0n,
    ready: false,
    useful: false,
    funds: [],
    complete: true,
  });
  await clickReady();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Nothing needs advancing right now.",
  );
  expect(m.write).not.toHaveBeenCalled();
});
