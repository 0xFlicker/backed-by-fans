import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeEventTopics, type Address, type Hash } from "viem";
import { ierc721Abi } from "@/contracts";
import { ERC721AirdropPage } from "./ERC721AirdropPage";

const m = vi.hoisted(() => ({
  sender: "0x0000000000000000000000000000000000000001" as Address,
  helper: "0x0000000000000000000000000000000000000002" as Address,
  recipient: "0x0000000000000000000000000000000000000003" as Address,
  approved: false,
  allowed: true,
  chainId: 4663,
  owned: new Set<bigint>(),
  simulate: vi.fn(),
  write: vi.fn(),
  receipt: vi.fn(),
  read: vi.fn(),
  multicall: vi.fn(),
  lastRequest: undefined as
    | {
        functionName: "airdropERC721";
        args: readonly [Address, readonly Address[], readonly bigint[]];
      }
    | { functionName: "setApprovalForAll"; args: readonly [Address, boolean] }
    | undefined,
}));

vi.mock("@wagmi/core", () => ({
  getAccount: () => ({
    isConnected: true,
    address: m.sender,
    chainId: m.chainId,
  }),
  simulateContract: m.simulate,
  readContracts: (_config: unknown, params: unknown) => m.multicall(params),
}));
vi.mock("@/lib/use-hydrated-account", () => ({
  useHydratedAccount: () => ({
    isConnected: true,
    address: m.sender,
    chainId: m.chainId,
  }),
}));
vi.mock("wagmi", () => ({
  useConfig: () => ({}),
  useSwitchChain: () => ({ switchChain: vi.fn(), isPending: false }),
  useWriteContract: () => ({ writeContractAsync: m.write }),
  useReadContract: () => ({
    data: m.approved,
    refetch: async () => ({ data: m.approved }),
  }),
  usePublicClient: () => ({
    getCode: async () => "0x1234",
    readContract: m.read,
    multicall: m.multicall,
    getBalance: async () => 10n ** 18n,
    getGasPrice: async () => 100_000_000n,
    estimateContractGas: async () => 100_000n,
    waitForTransactionReceipt: m.receipt,
  }),
}));

function receipt(hash: Hash, proof = true) {
  const request = m.lastRequest;
  if (!request) throw new Error("No submitted request");
  if (request.functionName === "setApprovalForAll") {
    m.approved = request.args[1];
    return { status: "success", transactionHash: hash, logs: [] };
  }
  const [collection, recipients, ids] = request.args;
  if (proof) ids.forEach((id: bigint) => m.owned.delete(id));
  return {
    status: "success",
    from: m.sender,
    to: m.helper,
    transactionHash: hash,
    logs: proof
      ? ids.map((tokenId, i) => ({
          address: collection,
          topics: encodeEventTopics({
            abi: ierc721Abi,
            eventName: "Transfer",
            args: { from: m.sender, to: recipients[i], tokenId },
          }),
          data: "0x",
          blockNumber: 1n,
          blockHash: hash,
          transactionHash: hash,
          transactionIndex: 0,
          logIndex: i,
          removed: false,
        }))
      : [],
  };
}

function mount(helper: Address | undefined = m.helper) {
  const cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={cache}>
      <ERC721AirdropPage chainId={4663} helper={helper} />
    </QueryClientProvider>,
  );
}

async function prepare(count = 2) {
  mount();
  fireEvent.change(screen.getByLabelText("Recipient list"), {
    target: {
      value: Array.from(
        { length: count },
        (_, i) => `${m.recipient},${i + 1}`,
      ).join("\n"),
    },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Start airdrop" })).toBeEnabled(),
  );
}

beforeEach(() => {
  m.approved = false;
  m.allowed = true;
  m.chainId = 4663;
  m.owned = new Set(Array.from({ length: 201 }, (_, i) => BigInt(i + 1)));
  m.lastRequest = undefined;
  m.read.mockImplementation(async ({ functionName }) => {
    if (functionName === "supportsInterface") return true;
    if (functionName === "isApprovedForAll") return m.approved;
    if (functionName === "name") return "Gentlemen Prefer Blondes";
    if (functionName === "getTransferValidator") return m.helper;
    if (functionName === "isAccountWhitelistedByCollection") return m.allowed;
    throw new Error(`Unexpected read ${functionName}`);
  });
  m.multicall.mockImplementation(async ({ contracts }) =>
    contracts.map(({ args }: { args: readonly [bigint] }) => ({
      status: "success",
      result: m.owned.has(args[0]) ? m.sender : m.recipient,
    })),
  );
  m.simulate.mockImplementation(async (_config, params) => ({
    request: { ...params, gas: 777n },
  }));
  m.write.mockImplementation(async (request) => {
    m.lastRequest = request;
    return `0x${m.write.mock.calls.length.toString(16).padStart(64, "0")}`;
  });
  m.receipt.mockImplementation(async ({ hash }) => receipt(hash));
});

describe("airdrop wallet integration", () => {
  it("approves, passes each simulation request unchanged, and requires the exact batch event", async () => {
    await prepare();
    fireEvent.click(screen.getByRole("button", { name: "Start airdrop" }));
    await screen.findByText(
      "Airdrop complete. Every batch has a confirmed receipt.",
    );
    expect(m.write).toHaveBeenCalledTimes(2);
    for (let i = 0; i < m.write.mock.calls.length; ++i)
      expect(m.write.mock.calls[i][0]).toBe(
        (await m.simulate.mock.results[i].value).request,
      );
    expect(
      screen.getByRole("link", { name: /Batch 1 · 2 NFTs · confirmed/ }),
    ).toBeVisible();
    expect(screen.queryByText(/does not own/)).not.toBeInTheDocument();
  });
  it("does not request approval when the transfer validator blocks the helper", async () => {
    m.allowed = false;
    mount();
    fireEvent.change(screen.getByLabelText("Recipient list"), {
      target: { value: `${m.recipient},1` },
    });
    await screen.findByText(/creator must authorize this helper/);
    expect(
      screen.getByRole("button", { name: "Start airdrop" }),
    ).toBeDisabled();
    expect(m.write).not.toHaveBeenCalled();
  });

  it("keeps approval removal available when the registry blocks sending", async () => {
    m.allowed = false;
    m.approved = true;
    mount();
    fireEvent.change(screen.getByLabelText("Recipient list"), {
      target: { value: `${m.recipient},1` },
    });
    await screen.findByText(/creator must authorize this helper/);
    fireEvent.click(screen.getByRole("button", { name: "Remove approval" }));
    await screen.findByText("Collection approval removed.");
    expect(m.approved).toBe(false);
  });
  it("blocks wrong ownership before requesting approval", async () => {
    m.owned.clear();
    mount();
    fireEvent.change(screen.getByLabelText("Recipient list"), {
      target: { value: `${m.recipient},1` },
    });
    await screen.findByText("Your wallet does not own NFT #1.");
    expect(m.write).not.toHaveBeenCalled();
  });
  it("surfaces simulation failure and never submits it", async () => {
    m.approved = true;
    await prepare();
    m.simulate.mockRejectedValueOnce(new Error("Receiver refuses NFTs"));
    fireEvent.click(screen.getByRole("button", { name: "Start airdrop" }));
    await screen.findByText("Receiver refuses NFTs");
    expect(m.write).not.toHaveBeenCalled();
  });
  it("does not declare a cancellation/replacement receipt successful without its batch proof", async () => {
    m.approved = true;
    await prepare();
    m.receipt.mockImplementationOnce(async ({ hash }) => receipt(hash, false));
    fireEvent.click(screen.getByRole("button", { name: "Start airdrop" }));
    await screen.findByText(/receipt does not confirm this batch/);
    expect(
      screen.queryByRole("link", { name: /NFTs · confirmed/ }),
    ).not.toBeInTheDocument();
  });
  it.each([
    "wrong collection",
    "wrong sender",
    "wrong recipient",
    "wrong token",
    "missing transfer",
    "extra transfer",
  ])("rejects a receipt with %s", async (kind) => {
    m.approved = true;
    await prepare();
    m.receipt.mockImplementationOnce(async ({ hash }) => {
      const result = receipt(hash);
      if (kind === "missing transfer")
        return { ...result, logs: result.logs.slice(1) };
      if (kind === "extra transfer")
        return { ...result, logs: [...result.logs, result.logs[0]] };
      const logs = [...result.logs];
      if (kind === "wrong collection")
        logs[0] = { ...logs[0], address: m.helper };
      else
        logs[0] = {
          ...logs[0],
          topics: encodeEventTopics({
            abi: ierc721Abi,
            eventName: "Transfer",
            args: {
              from: kind === "wrong sender" ? m.recipient : m.sender,
              to: kind === "wrong recipient" ? m.sender : m.recipient,
              tokenId: kind === "wrong token" ? 999n : 1n,
            },
          }),
        };
      return { ...result, logs };
    });
    fireEvent.click(screen.getByRole("button", { name: "Start airdrop" }));
    await screen.findByText(/receipt does not confirm this batch/);
    expect(
      screen.queryByRole("link", { name: /NFTs · confirmed/ }),
    ).not.toBeInTheDocument();
  });
  it("confirms exact NFT transfers from a routed wallet receipt", async () => {
    m.approved = true;
    await prepare();
    m.receipt.mockImplementationOnce(async ({ hash }) => ({
      ...receipt(hash),
      from: m.recipient,
      to: m.sender,
    }));
    fireEvent.click(screen.getByRole("button", { name: "Start airdrop" }));
    await screen.findByText(
      "Airdrop complete. Every batch has a confirmed receipt.",
    );
  });
  it("keeps the first confirmed batch when a later batch fails, then resumes only the remaining rows", async () => {
    m.approved = true;
    await prepare(201);
    m.write
      .mockImplementationOnce(async (request) => {
        m.lastRequest = request;
        return `0x${"a".repeat(64)}`;
      })
      .mockRejectedValueOnce(new Error("Wallet rejected second batch"));
    fireEvent.click(screen.getByRole("button", { name: "Start airdrop" }));
    await screen.findByText("Wallet rejected second batch");
    expect(
      screen.getByRole("link", { name: /Batch 1 · 200 NFTs · confirmed/ }),
    ).toBeVisible();
    const retry = screen.getByRole("button", { name: "Continue airdrop" });
    await waitFor(() => expect(retry).toBeEnabled());
    fireEvent.click(retry);
    await screen.findByText(
      "Airdrop complete. Every batch has a confirmed receipt.",
    );
    expect(m.lastRequest?.args[2]).toEqual([201n]);
  });
  it("removes approval through wagmi and verifies the resulting state", async () => {
    m.approved = true;
    await prepare();
    fireEvent.click(screen.getByRole("button", { name: "Remove approval" }));
    await screen.findByText("Collection approval removed.");
    expect(m.lastRequest?.functionName).toBe("setApprovalForAll");
    expect(m.lastRequest?.args).toEqual([m.helper, false]);
  });
  it("requires the selected network and clears review when inputs change", async () => {
    await prepare();
    fireEvent.change(screen.getByLabelText("Recipient list"), {
      target: { value: `${m.recipient},3` },
    });
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "Start airdrop" }),
    ).toBeDisabled();
  });
});
