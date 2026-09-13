import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { encodeEventTopics, encodeAbiParameters, getAbiItem } from "viem";
import { membershipTierAbi, membershipFactoryAbi } from "@/contracts";
import { AccountRewards } from "./AccountRewards";
import type { ReadyDeployment } from "@/lib/config";

const wallet = "0x1111111111111111111111111111111111111111";
const factory = "0x2222222222222222222222222222222222222222";
const tier = "0x3333333333333333333333333333333333333333";
const scale = 1n << 128n;
const m = vi.hoisted(() => ({
  discoverAll: vi.fn(),
  gas: vi.fn(),
  block: vi.fn(),
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
vi.mock("./account-rewards-read", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./account-rewards-read")>()),
  readAccountRewards: m.preview,
}));
vi.mock("./claim-all", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./claim-all")>()),
  discoverClaimAll: m.discoverAll,
}));
vi.mock("@wagmi/core", () => ({
  simulateContract: m.simulate,
  getAccount: () => m.account,
}));
vi.mock("wagmi", () => ({
  useConfig: () => ({}),
  usePublicClient: () => ({
    readContract: m.read,
    getBlockNumber: async () => 42n,
    estimateContractGas: m.gas,
    getBlock: m.block,
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
function mount() {
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
        onRefresh={onRefresh}
      />
    </QueryClientProvider>,
  );
  return { onRefresh };
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
  m.read.mockImplementation(async (request) =>
    request.functionName === "ownerOf" ? wallet : [0n, 0n],
  );
  m.gas.mockResolvedValue(1n);
  m.block.mockResolvedValue({ gasLimit: 100n });
  m.receipt.mockResolvedValue(claimReceipt());
});

it("claims all discovered positions beyond the old cap without manual selections", async () => {
  const ids = Array.from({ length: 33 }, (_, i) => BigInt(i + 1));
  m.discoverAll.mockResolvedValue({
    wallet,
    chainId: 31337,
    factory,
    queue: [{ tier, name: "WETH Fans", tokenIds: ids }],
    completed: 0,
    removedPositions: 0,
  });
  mount();
  await userEvent.click(screen.getByRole("button", { name: "Claim all" }));
  await screen.findByText("All rewards claimed. 1 transactions confirmed.");
  expect(m.write).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      functionName: "claimEverything",
      args: [[{ tier, tokenIds: ids }], 25n],
    }),
  );
  expect(m.discoverAll).toHaveBeenCalledTimes(1);
});

it("splits by estimated gas and resumes after rejection without replaying a confirmed batch", async () => {
  m.discoverAll.mockResolvedValue({
    wallet,
    chainId: 31337,
    factory,
    queue: [{ tier, name: "WETH Fans", tokenIds: [1n, 2n, 3n, 4n, 5n] }],
    completed: 0,
    removedPositions: 0,
  });
  m.gas.mockImplementation(
    async (request) => BigInt(request.args[0][0].tokenIds.length) * 30n,
  );
  m.write
    .mockResolvedValueOnce(`0x${"ab".repeat(32)}`)
    .mockRejectedValueOnce(new Error("User rejected the request."));
  mount();
  await userEvent.click(screen.getByRole("button", { name: "Claim all" }));
  await screen.findByRole("alert");
  expect(m.write.mock.calls[0][0].args[0][0].tokenIds).toEqual([1n, 2n]);
  await userEvent.click(
    screen.getByRole("button", { name: "Resume claim all" }),
  );
  await screen.findByText("All rewards claimed. 3 transactions confirmed.");
  expect(m.discoverAll).toHaveBeenCalledTimes(1);
  for (const [request] of m.write.mock.calls.slice(1))
    expect(request.args[0][0].tokenIds.every((id: bigint) => id > 2n)).toBe(
      true,
    );
});

it("Claim all advances pending accounting before claiming the captured scope", async () => {
  m.discoverAll.mockResolvedValue({
    wallet,
    chainId: 31337,
    factory,
    queue: [{ tier, name: "WETH Fans", tokenIds: [1n] }],
    completed: 0,
    removedPositions: 0,
  });
  m.preview.mockResolvedValueOnce({
    results: [],
    blocked: { tier, name: "WETH Fans", tokenIds: [1n] },
    complete: false,
  });
  const event = getAbiItem({
    abi: membershipTierAbi,
    name: "AccountingProgress",
  });
  m.receipt
    .mockResolvedValueOnce({
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
    })
    .mockResolvedValue(claimReceipt());
  mount();
  await userEvent.click(screen.getByRole("button", { name: "Claim all" }));
  await screen.findByText("All rewards claimed. 2 transactions confirmed.");
  expect(m.write.mock.calls.map(([request]) => request.functionName)).toEqual([
    "processAccounting",
    "claimEverything",
  ]);
  expect(m.discoverAll).toHaveBeenCalledTimes(1);
});

it("Claim all pays a retired-only scope without selecting or owning an NFT", async () => {
  m.discoverAll.mockResolvedValue({
    wallet,
    chainId: 31337,
    factory,
    queue: [{ tier, name: "WETH Fans", tokenIds: [] }],
    completed: 0,
    removedPositions: 0,
  });
  m.preview.mockResolvedValue({
    results: [
      {
        ...previewResult([]),
        reward: 0n,
        retired: 4n,
        referral: 0n,
        creator: 0n,
      },
    ],
    complete: true,
  });
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
  mount();
  await userEvent.click(screen.getByRole("button", { name: "Claim all" }));
  await screen.findByText("All rewards claimed. 1 transactions confirmed.");
  expect(m.write).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      functionName: "claimEverything",
      args: [[{ tier, tokenIds: [] }], 25n],
    }),
  );
});

it("explains positions removed from Claim all after ownership changes", async () => {
  m.discoverAll.mockResolvedValue({
    wallet,
    chainId: 31337,
    factory,
    queue: [{ tier, name: "WETH Fans", tokenIds: [1n] }],
    completed: 0,
    removedPositions: 0,
  });
  m.read.mockImplementation(async ({ functionName }) =>
    functionName === "ownerOf" ? factory : [0n, 0n],
  );
  mount();
  await userEvent.click(screen.getByRole("button", { name: "Claim all" }));
  await screen.findByText(/1 captured membership ended or changed owner/);
  expect(m.write.mock.calls[0][0].args[0][0].tokenIds).toEqual([]);
});

it("shows only Claim all and does not read reward categories before a claim", () => {
  mount();
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Claim all" })).toBeEnabled();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(
    screen.queryByText("Ended membership rewards"),
  ).not.toBeInTheDocument();
  expect(m.preview).not.toHaveBeenCalled();
  expect(m.discoverAll).not.toHaveBeenCalled();
});

it.each(["wallet", "chain"])(
  "blocks Claim all after a %s mismatch",
  (mismatch) => {
    if (mismatch === "wallet") m.account.address = factory;
    else m.account.chainId = 46630;
    mount();
    expect(screen.getByRole("button", { name: "Claim all" })).toBeDisabled();
    expect(m.write).not.toHaveBeenCalled();
  },
);

it("reports an empty claim without asking for a transaction", async () => {
  m.discoverAll.mockResolvedValue({
    wallet,
    chainId: 31337,
    factory,
    queue: [],
    completed: 0,
    removedPositions: 0,
  });
  mount();
  await userEvent.click(screen.getByRole("button", { name: "Claim all" }));
  expect(
    await screen.findByText(/No whole rewards are available/),
  ).toBeVisible();
  expect(m.write).not.toHaveBeenCalled();
});
