import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { zeroAddress } from "viem";
import { BuybackSettings } from "./BuybackSettings";
const mock = vi.hoisted(() => ({
  read: vi.fn(),
  blockNumber: vi.fn(),
  estimate: vi.fn(),
  contract: vi.fn(),
  simulate: vi.fn(),
  write: vi.fn(),
  receipt: vi.fn(),
  safe: vi.fn(),
  sign: vi.fn(),
  verify: vi.fn(),
}));
const safe = "0x1111111111111111111111111111111111111111",
  factory = "0x2222222222222222222222222222222222222222",
  vault = "0x3333333333333333333333333333333333333333",
  owner = "0x4444444444444444444444444444444444444444",
  token = "0x5555555555555555555555555555555555555555";
const hash = `0x${"a".repeat(64)}`;
vi.mock("wagmi", () => ({
  useChainId: () => 31337,
  useConfig: () => ({}),
  useAccount: () => ({
    address: owner,
    chainId: 31337,
    connector: { getProvider: async () => ({}) },
  }),
  usePublicClient: () => ({
    readContract: mock.contract,
    getBlockNumber: mock.blockNumber,
    getBytecode: async () => "0x",
    waitForTransactionReceipt: mock.receipt,
  }),
  useWriteContract: () => ({ writeContractAsync: mock.write }),
}));
vi.mock("@/components/WalletControl", () => ({
  WalletControl: () => <div>Wallet</div>,
}));
vi.mock("@/lib/config", () => ({
  publicConfig: {},
  getDeployment: () => ({ status: "ready" }),
}));
vi.mock("@/lib/buyback-settings/read", () => ({
  readCalculator: mock.read,
  estimateAsset: mock.estimate,
}));
vi.mock("@wagmi/core", () => ({ simulateContract: mock.simulate }));
vi.mock("@/features/protocol/gas-readiness", () => ({
  assertSufficientGas: async () => undefined,
}));
vi.mock("@safe-global/protocol-kit", async (original) => ({
  ...(await original<typeof import("@safe-global/protocol-kit")>()),
  SafeProvider: class {},
  generateEIP712Signature: mock.sign,
}));
vi.mock("./safe-settings", async (original) => ({
  ...(await original<typeof import("./safe-settings")>()),
  readSafeApproval: mock.safe,
  validateSignatureFile: async () => undefined,
  verifySettingsReceipt: mock.verify,
}));
function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <BuybackSettings />
    </QueryClientProvider>,
  );
}
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks();
  mock.blockNumber.mockResolvedValue(200n);
  mock.read.mockResolvedValue({
    status: "valid",
    capturedBlock: 100n,
    fees: new Map([
      [
        zeroAddress,
        { earned: 1000000000000000000n, future: 9000000000000000000n },
      ],
    ]),
    data: {
      timestamp: 1000n,
      factory,
      vault,
      safe,
      protocolToken: token,
      globalMinInterval: 0n,
      owners: [owner],
      assets: [
        {
          status: "valid",
          asset: zeroAddress,
          data: {
            limits: {
              minInput: 1n,
              maxInput: 1000000000000000000n,
              minInterval: 300n,
            },
            metadata: { symbol: "ETH", decimals: 18, uiMultiplier: 10n ** 18n },
            membership: { available: 1000000000000000000n },
            donation: { available: 0n },
            lastBuyAt: 0n,
            eligibility: [
              { status: "valid", data: { status: 0, nextEligibleAt: 0n } },
            ],
          },
        },
      ],
    },
  });
  mock.contract.mockImplementation(
    async ({ functionName }) =>
      ({ nonce: 0n, owner: safe, buybackVault: vault })[
        functionName as "nonce"
      ],
  );
  mock.safe.mockResolvedValue({
    owners: [owner],
    threshold: 1,
    version: "1.5.0",
    hash,
    blockNumber: 100n,
  });
  mock.sign.mockResolvedValue({
    signer: owner,
    data: `0x${"a".repeat(128)}1b`,
  });
  mock.simulate.mockResolvedValue({
    result: true,
    request: { simulated: "exact request" },
  });
  mock.write.mockResolvedValue(hash);
  mock.receipt.mockResolvedValue({ status: "success", transactionHash: hash });
});
it("loads live currencies with earned and future fees, without a policy JSON upload", async () => {
  mount();
  await screen.findByText("ETH · ETH + WETH");
  expect(screen.getByText("Earned, awaiting release")).toBeInTheDocument();
  expect(screen.getByText("9 ETH")).toBeInTheDocument();
  expect(
    screen.queryByLabelText("Policy proposal JSON"),
  ).not.toBeInTheDocument();
});
async function prepare() {
  mount();
  await screen.findByText("ETH · ETH + WETH");
  fireEvent.click(
    screen.getByRole("button", {
      name: "Apply calculated sizes across currencies",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Review 1 currency" }));
  await screen.findByText(/0 of 1 owner signatures/);
  fireEvent.click(screen.getByRole("button", { name: "Sign settings" }));
  await screen.findByText(/1 of 1 owner signatures/);
}
it("offers larger batches after a gas-deferred rehearsal without requiring a separate quote", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        summary: "Previewed 0 buybacks at 1 gwei.",
        capturedBlock: "200",
        simulatedUntil: "201",
        truncated: false,
        totals: { burnedRaw: "0", gasWei: "1000000000000000", batches: 0 },
        rows: [
          {
            asset: zeroAddress,
            inputRaw: "0",
            burnedRaw: "0",
            gasWei: "0",
            status: "gas-deferred",
            note: "This batch is too small for the gas target.",
            estimate: {
              inputRaw: "500000000000000000",
              nativeValueWei: "500000000000000000",
              gasWei: "20000000000000000",
            },
          },
        ],
      }),
    }),
  );
  mount();
  await screen.findByText("ETH · ETH + WETH");
  fireEvent.click(
    screen.getByRole("button", {
      name: "Apply calculated sizes across currencies",
    }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Rehearse selected settings" }),
  );
  const adjustment = await screen.findByRole("button", {
    name: "Use 2 larger ETH purchases",
  });
  expect(screen.getByText(/0.8 ETH minimum/)).toBeInTheDocument();
  expect(screen.queryByText(/gas-deferred:/)).not.toBeInTheDocument();
  fireEvent.click(adjustment);
  expect(screen.getByLabelText("Minimum batch · ETH")).toHaveValue("0.8");
  expect(screen.getByLabelText("Maximum batch · ETH")).toHaveValue("1");
  expect(screen.getByLabelText("Minimum minutes between ETH buys")).toHaveValue(
    720,
  );
  expect(screen.getByLabelText("Update this currency")).toBeChecked();
  expect(mock.write).not.toHaveBeenCalled();
});
it("publishes all reviewed settings using the exact wagmi simulation request", async () => {
  await prepare();
  fireEvent.click(screen.getByRole("button", { name: "Save through Safe" }));
  await screen.findByText(
    "Standing settings saved and verified. Anyone can execute eligible buybacks.",
  );
  expect(mock.write).toHaveBeenCalledWith(
    (await mock.simulate.mock.results[0].value).request,
  );
  expect(mock.verify).toHaveBeenCalledTimes(1);
});
it("does not submit when the Safe simulation reports an inner failure", async () => {
  mock.simulate.mockResolvedValue({ result: false, request: {} });
  await prepare();
  fireEvent.click(screen.getByRole("button", { name: "Save through Safe" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("inner failure"),
  );
  expect(mock.write).not.toHaveBeenCalled();
});

it.each([
  [
    "target percentage",
    () =>
      fireEvent.change(
        screen.getByLabelText("Spend % of currently earned funds"),
        { target: { value: "50" } },
      ),
  ],
  [
    "horizon",
    () =>
      fireEvent.change(screen.getByLabelText("Over hours"), {
        target: { value: "48" },
      }),
  ],
  [
    "purchase count",
    () =>
      fireEvent.change(
        screen.getByLabelText("Preferred purchases per currency"),
        { target: { value: "2" } },
      ),
  ],
  [
    "gas preference",
    () =>
      fireEvent.change(
        screen.getByLabelText("Maximum gas % of purchase value"),
        { target: { value: "5" } },
      ),
  ],
  [
    "global spacing",
    () =>
      fireEvent.change(
        screen.getByLabelText("Minimum minutes between any two buys"),
        { target: { value: "10" } },
      ),
  ],
  [
    "minimum batch",
    () =>
      fireEvent.change(screen.getByLabelText("Minimum batch · ETH"), {
        target: { value: "0.25" },
      }),
  ],
  [
    "maximum batch",
    () =>
      fireEvent.change(screen.getByLabelText("Maximum batch · ETH"), {
        target: { value: "0.75" },
      }),
  ],
  [
    "currency spacing",
    () =>
      fireEvent.change(
        screen.getByLabelText("Minimum minutes between ETH buys"),
        { target: { value: "60" } },
      ),
  ],
  [
    "selection",
    () => fireEvent.click(screen.getByLabelText("Update this currency")),
  ],
  [
    "all recommendations",
    () =>
      fireEvent.click(
        screen.getByRole("button", {
          name: "Apply calculated sizes across currencies",
        }),
      ),
  ],
  [
    "one recommendation",
    () =>
      fireEvent.click(
        screen.getByRole("button", { name: /Use recommendation ·/ }),
      ),
  ],
])(
  "discards rehearsal results and measured gas after changing %s",
  async (_label, edit) => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        summary: "Measured rehearsal",
        capturedBlock: "100",
        simulatedUntil: "200",
        truncated: false,
        totals: { burnedRaw: "100", gasWei: "1000000000000000", batches: 1 },
        rows: [
          {
            asset: zeroAddress,
            inputRaw: "1000000000000000000",
            burnedRaw: "100",
            gasWei: "1000000000000000",
            status: "executed",
            note: "Measured this run",
            estimate: {
              inputRaw: "1000000000000000000",
              nativeValueWei: "1000000000000000000",
              gasWei: "1000000000000000",
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    mock.estimate.mockResolvedValue({
      amount: 2000000000000000000n,
      nativeValueWei: 2000000000000000000n,
      burned: 1000000000000000000n,
      gasWei: undefined,
      gasNote: "Gas not available directly.",
      legs: [],
    });
    mount();
    await screen.findByText("ETH · ETH + WETH");
    fireEvent.click(
      screen.getByRole("button", { name: "Estimate all currencies" }),
    );
    await screen.findByText(/Gas not available directly/);
    fireEvent.click(screen.getByLabelText("Update this currency"));
    fireEvent.click(
      screen.getByRole("button", { name: "Rehearse selected settings" }),
    );
    await screen.findByText("Measured rehearsal");
    expect(
      screen.getByRole("button", { name: /Use recommendation ·/ }),
    ).toBeInTheDocument();
    edit();
    expect(screen.queryByText("Measured rehearsal")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Use starting sizes ·/ }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  },
);

it("refreshes a stale Safe nonce, clears old signatures, and permits signing the current transaction", async () => {
  await prepare();
  mock.safe.mockRejectedValueOnce(
    new Error(
      "The Safe nonce changed. Generate a new proposal before signing.",
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save through Safe" }));
  await screen.findByText(/Safe nonce changed/);
  expect(mock.write).not.toHaveBeenCalled();
  mock.contract.mockImplementation(
    async ({ functionName }) =>
      ({ nonce: 1n, owner: safe, buybackVault: vault })[
        functionName as "nonce"
      ],
  );
  let finishRefresh!: (value: unknown) => void;
  mock.safe.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishRefresh = resolve;
      }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Refresh approval" }));
  await screen.findByText(/0 of 1 owner signatures/);
  expect(screen.queryByText(/Safe nonce changed/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sign settings" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Save through Safe" }),
  ).toBeDisabled();
  await waitFor(() => expect(finishRefresh).toBeTypeOf("function"));
  finishRefresh({
    owners: [owner],
    threshold: 1,
    version: "1.5.0",
    hash,
    blockNumber: 101n,
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Sign settings" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Sign settings" }));
  await screen.findByText(/1 of 1 owner signatures/);
  expect(mock.sign.mock.calls[0][1].data.nonce).toBe(0);
  expect(mock.sign.mock.calls[1][1].data.nonce).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "Save through Safe" }));
  await screen.findByText(
    "Standing settings saved and verified. Anyone can execute eligible buybacks.",
  );
  expect(mock.write).toHaveBeenCalledTimes(1);
});

it("rehearses fresh chain state without discarding the selected draft", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    json: async () => ({ error: "Test response" }),
  });
  vi.stubGlobal("fetch", fetchMock);
  mount();
  await screen.findByText("ETH · ETH + WETH");
  const maximum = screen.getByLabelText("Maximum batch · ETH");
  fireEvent.change(maximum, { target: { value: "0.4" } });
  const selected = screen.getByLabelText("Update this currency");
  fireEvent.click(selected);
  fireEvent.click(
    screen.getByRole("button", { name: "Rehearse selected settings" }),
  );
  await screen.findByText("Test response");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
    capturedBlock: "200",
    assets: [{ asset: zeroAddress, maxInput: "400000000000000000" }],
  });
  expect(maximum).toHaveValue("0.4");
  expect(selected).toBeChecked();
  mock.blockNumber.mockResolvedValue(250n);
  fireEvent.click(
    screen.getByRole("button", { name: "Rehearse selected settings" }),
  );
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).capturedBlock).toBe("250");
  expect(mock.read).toHaveBeenCalledTimes(1);
});
