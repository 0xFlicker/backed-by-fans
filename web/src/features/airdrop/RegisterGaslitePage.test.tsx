import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  type Address,
  type Hash,
} from "viem";
import { iAirdropTransferRegistryAbi } from "@/contracts";
import { RegisterGaslitePage } from "./RegisterGaslitePage";

const m = vi.hoisted(() => ({
  sender: "0x0000000000000000000000000000000000000001" as Address,
  helper: "0x0000000000000000000000000000000000000002" as Address,
  registry: "0x0000000000000000000000000000000000000003" as Address,
  collection: "0x0000000000000000000000000000000000000004" as Address,
  other: "0x0000000000000000000000000000000000000005" as Address,
  owner: "" as Address,
  chainId: 4663,
  listId: 7n,
  added: false,
  copied: false,
  listChanged: false,
  policyChanged: false,
  read: vi.fn(),
  simulate: vi.fn(),
  write: vi.fn(),
  receipt: vi.fn(),
  last: undefined as
    { functionName: string; args: readonly unknown[] } | undefined,
}));
vi.mock("@wagmi/core", () => ({
  getAccount: () => ({
    isConnected: true,
    address: m.sender,
    chainId: m.chainId,
  }),
  simulateContract: m.simulate,
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
  useSwitchChain: () => ({ switchChain: vi.fn() }),
  useWriteContract: () => ({ writeContractAsync: m.write }),
  usePublicClient: () => ({
    getCode: async () => "0x1234",
    readContract: m.read,
    waitForTransactionReceipt: m.receipt,
  }),
}));
function mount() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false, gcTime: 0 } },
        })
      }
    >
      <RegisterGaslitePage
        chainId={4663}
        collection={m.collection}
        helper={m.helper}
      />
    </QueryClientProvider>,
  );
}
async function prepare() {
  mount();
  await screen.findByText(/Collection owner:/);
  fireEvent.click(screen.getByRole("checkbox"));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Register GasliteDrop" }),
    ).toBeEnabled(),
  );
}
function receipt(hash: Hash, proof = true) {
  const name = m.last?.functionName;
  const logs = [];
  if (name === "createListCopy") {
    m.copied = true;
    if (proof)
      logs.push({
        address: m.registry,
        topics: encodeEventTopics({
          abi: iAirdropTransferRegistryAbi,
          eventName: "CreatedList",
          args: { id: 15n },
        }),
        data: encodeAbiParameters(
          [{ type: "string" }],
          ["Backed By Fans · GasliteDrop"],
        ),
      });
  }
  if (name === "addAccountToWhitelist") m.added = true;
  if (name === "applyListToCollection") {
    m.listId = 15n;
    if (proof)
      logs.push({
        address: m.registry,
        topics: encodeEventTopics({
          abi: iAirdropTransferRegistryAbi,
          eventName: "AppliedListToCollection",
          args: { collection: m.collection, id: 15n },
        }),
        data: "0x",
      });
  }
  return { status: "success", transactionHash: hash, logs };
}
beforeEach(() => {
  m.owner = m.sender;
  m.chainId = 4663;
  m.listId = 7n;
  m.added = false;
  m.copied = false;
  m.listChanged = false;
  m.policyChanged = false;
  m.read.mockImplementation(async ({ functionName }) => {
    if (functionName === "supportsInterface") return true;
    if (functionName === "name") return "Test collection";
    if (functionName === "owner") return m.owner;
    if (functionName === "getTransferValidator") return m.registry;
    if (functionName === "getTransferValidationFunction")
      return ["0xcaee23ea", false];
    if (functionName === "getCollectionSecurityPolicy")
      return {
        transferSecurityLevel: m.policyChanged ? 4 : 3,
        operatorWhitelistId: m.listId,
        permittedContractReceiversId: 0n,
      };
    if (functionName === "isAccountWhitelistedByCollection")
      return m.listId === 15n && m.added;
    if (functionName === "validateTransfer") return undefined;
    if (functionName === "listOwners") return m.sender;
    if (functionName === "getWhitelistedAccountsByCollection")
      return m.listId === 15n && m.added ? [m.other, m.helper] : [m.other];
    if (functionName === "getAuthorizerAccountsByCollection")
      return m.listChanged ? [m.registry] : [m.other];
    if (functionName === "getBlacklistedAccountsByCollection") return [m.other];
    if (functionName === "getWhitelistedAccounts")
      return m.added ? [m.other, m.helper] : [m.other];
    if (
      functionName === "getBlacklistedAccounts" ||
      functionName === "getAuthorizerAccounts"
    )
      return [m.other];
    throw new Error(`Unexpected read ${functionName}`);
  });
  m.simulate.mockImplementation(async (_config, params) => ({
    result: 14n,
    request: { ...params, gas: 123n },
  }));
  m.write.mockImplementation(async (request) => {
    m.last = request;
    return `0x${m.write.mock.calls.length.toString(16).padStart(64, "0")}`;
  });
  m.receipt.mockImplementation(async ({ hash }) => receipt(hash));
});
describe("owner registry registration", () => {
  it("copies the existing list, adds Gaslite and applies the receipt-proven ID through exact simulation requests", async () => {
    await prepare();
    fireEvent.click(
      screen.getByRole("button", { name: "Register GasliteDrop" }),
    );
    await screen.findByText(
      "GasliteDrop registered. The NFT holder can now prepare the airdrop.",
    );
    expect(m.write.mock.calls.map((c) => c[0].functionName)).toEqual([
      "createListCopy",
      "addAccountToWhitelist",
      "applyListToCollection",
    ]);
    expect(m.write.mock.calls[1][0].args).toEqual([15n, m.helper]);
    expect(m.write.mock.calls[2][0].args).toEqual([m.collection, 15n]);
    for (let i = 0; i < 3; i++)
      expect(m.write.mock.calls[i][0]).toBe(
        (await m.simulate.mock.results[i].value).request,
      );
    expect(m.listId).toBe(15n);
  });
  it("does not offer registration to a non-owner", async () => {
    m.owner = m.other;
    mount();
    await screen.findByText(/Only the collection owner shown/);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(
      screen.getByRole("button", { name: "Register GasliteDrop" }),
    ).toBeDisabled();
    expect(m.write).not.toHaveBeenCalled();
  });
  it("fails before a signature if ownership changes after review", async () => {
    await prepare();
    m.owner = m.other;
    fireEvent.click(
      screen.getByRole("button", { name: "Register GasliteDrop" }),
    );
    await screen.findByText(
      "Only the current collection owner can register GasliteDrop.",
    );
    expect(m.write).not.toHaveBeenCalled();
  });
  it.each(["list", "policy"])(
    "does not apply a copy when the source %s changes",
    async (kind) => {
      await prepare();
      m.receipt.mockImplementationOnce(async ({ hash }) => {
        const result = receipt(hash);
        if (kind === "list") m.listChanged = true;
        else m.policyChanged = true;
        return result;
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Register GasliteDrop" }),
      );
      await screen.findByText(
        kind === "list"
          ? "The collection's registry list changed. Reload and review again."
          : "The collection owner, validator or policy changed. Reload and review again.",
      );
      expect(m.write).toHaveBeenCalledTimes(1);
      expect(m.listId).toBe(7n);
    },
  );
  it("rejects a successful cancellation receipt without a created-list event", async () => {
    await prepare();
    m.receipt.mockImplementationOnce(async ({ hash }) => receipt(hash, false));
    fireEvent.click(
      screen.getByRole("button", { name: "Register GasliteDrop" }),
    );
    await screen.findByText(/receipt does not confirm the new registry list/);
    expect(m.write).toHaveBeenCalledTimes(1);
    expect(m.listId).toBe(7n);
  });
  it("leaves the collection on the original list when the second signature is rejected", async () => {
    await prepare();
    m.write
      .mockImplementationOnce(async (request) => {
        m.last = request;
        return `0x${"a".repeat(64)}`;
      })
      .mockRejectedValueOnce(new Error("Wallet declined"));
    fireEvent.click(
      screen.getByRole("button", { name: "Register GasliteDrop" }),
    );
    await screen.findByText("Wallet declined");
    expect(m.listId).toBe(7n);
  });
  it("refuses a mismatched cloned list before adding the helper", async () => {
    const read = m.read.getMockImplementation()!;
    m.read.mockImplementation(async (params) =>
      params.functionName === "getBlacklistedAccounts" ? [] : read(params),
    );
    await prepare();
    fireEvent.click(
      screen.getByRole("button", { name: "Register GasliteDrop" }),
    );
    await screen.findByText(/copied registry list does not match/);
    expect(m.write).toHaveBeenCalledTimes(1);
  });
  it("does not claim success without the applied-list receipt proof", async () => {
    await prepare();
    m.receipt.mockImplementation(async ({ hash }) =>
      receipt(hash, m.last?.functionName !== "applyListToCollection"),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Register GasliteDrop" }),
    );
    await screen.findByText(
      /receipt does not confirm registration for this collection/,
    );
    expect(
      screen.queryByText(/GasliteDrop registered\. The/),
    ).not.toBeInTheDocument();
  });
});
