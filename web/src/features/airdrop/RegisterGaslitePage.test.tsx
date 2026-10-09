import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
  nextId: 15n,
  lists: {} as Record<string, Address[]>,
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
let queryClient: QueryClient;
function mount() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RegisterGaslitePage
        chainId={4663}
        collection={m.collection}
        helper={m.helper}
      />
    </QueryClientProvider>,
  );
}
async function prepare(revoke = false) {
  mount();
  await screen.findByText(/Collection owner:/);
  fireEvent.click(screen.getByRole("checkbox"));
  await waitFor(() =>
    expect(
      screen.getByRole("button", {
        name: revoke ? "Revoke GasliteDrop" : "Register GasliteDrop",
      }),
    ).toBeEnabled(),
  );
}
function receipt(hash: Hash, proof = true) {
  const name = m.last?.functionName;
  const logs = [];
  if (name === "createListCopy") {
    const id = m.nextId++;
    m.lists[id.toString()] = [...m.lists[String(m.last!.args[1])]];
    if (proof)
      logs.push({
        address: m.registry,
        topics: encodeEventTopics({
          abi: iAirdropTransferRegistryAbi,
          eventName: "CreatedList",
          args: { id },
        }),
        data: encodeAbiParameters(
          [{ type: "string" }],
          ["Backed By Fans · GasliteDrop"],
        ),
      });
  }
  if (
    name === "addAccountToWhitelist" ||
    name === "removeAccountFromWhitelist"
  ) {
    const id = m.last!.args[0] as bigint;
    m.lists[id.toString()] =
      name === "addAccountToWhitelist"
        ? [...m.lists[id.toString()], m.helper]
        : m.lists[id.toString()].filter((account) => account !== m.helper);
    if (proof)
      logs.push({
        address: m.registry,
        topics: encodeEventTopics({
          abi: iAirdropTransferRegistryAbi,
          eventName:
            name === "addAccountToWhitelist"
              ? "AddedAccountToList"
              : "RemovedAccountFromList",
          args: { kind: 1, id, account: m.helper },
        }),
        data: "0x",
      });
  }
  if (name === "applyListToCollection") {
    m.listId = m.last!.args[1] as bigint;
    if (proof)
      logs.push({
        address: m.registry,
        topics: encodeEventTopics({
          abi: iAirdropTransferRegistryAbi,
          eventName: "AppliedListToCollection",
          args: { collection: m.collection, id: m.listId },
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
  m.nextId = 15n;
  m.lists = { "7": [m.other] };
  m.listChanged = false;
  m.policyChanged = false;
  m.read.mockImplementation(async ({ functionName, args }) => {
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
      return m.lists[m.listId.toString()].includes(m.helper);
    if (functionName === "validateTransfer") return undefined;
    if (functionName === "listOwners") return m.sender;
    if (functionName === "getWhitelistedAccountsByCollection")
      return m.lists[m.listId.toString()];
    if (functionName === "getAuthorizerAccountsByCollection")
      return m.listChanged ? [m.registry] : [m.other];
    if (functionName === "getBlacklistedAccountsByCollection") return [m.other];
    if (functionName === "getWhitelistedAccounts")
      return m.lists[String(args[0])];
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
    expect(
      screen.getByRole("button", { name: "Revoke GasliteDrop" }),
    ).toBeDisabled();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
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
  it("requires the helper addition event before applying the copied list", async () => {
    await prepare();
    m.receipt.mockImplementation(async ({ hash }) =>
      receipt(hash, m.last?.functionName !== "addAccountToWhitelist"),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Register GasliteDrop" }),
    );
    await screen.findByText(
      /receipt does not confirm the GasliteDrop allowlist change/,
    );
    expect(m.write).toHaveBeenCalledTimes(2);
    expect(m.listId).toBe(7n);
  });
  it("keeps the registration box until the third receipt is verified, even if a canonical read sees the applied list", async () => {
    await prepare();
    let finish!: () => void;
    const mined = new Promise<void>((resolve) => {
      finish = resolve;
    });
    m.receipt.mockImplementation(async ({ hash }) => {
      const result = receipt(hash);
      if (m.last?.functionName === "applyListToCollection") await mined;
      return result;
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Register GasliteDrop" }),
    );
    await waitFor(() => expect(m.receipt).toHaveBeenCalledTimes(3));
    await act(() =>
      queryClient.refetchQueries({ queryKey: ["airdrop-collection"] }),
    );
    expect(
      screen.getByRole("region", { name: "Register GasliteDrop" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "Revoke GasliteDrop" }),
    ).not.toBeInTheDocument();
    await act(async () => {
      finish();
      await mined;
    });
    await screen.findByRole("button", { name: "Revoke GasliteDrop" });
    expect(screen.getAllByRole("link", { name: /confirmed/ })).toHaveLength(3);
  });
});

describe("owner registry revocation", () => {
  beforeEach(() => {
    m.lists["7"] = [m.other, m.helper];
  });
  it("copies, removes only Gaslite and applies the receipt-proven list, then returns to registration", async () => {
    await prepare(true);
    fireEvent.click(screen.getByRole("button", { name: "Revoke GasliteDrop" }));
    await screen.findByText(
      "GasliteDrop registration revoked for this collection.",
    );
    expect(m.write.mock.calls.map((c) => c[0].functionName)).toEqual([
      "createListCopy",
      "removeAccountFromWhitelist",
      "applyListToCollection",
    ]);
    expect(m.write.mock.calls[1][0].args).toEqual([15n, m.helper]);
    expect(m.lists["7"]).toEqual([m.other, m.helper]);
    expect(m.lists[m.listId.toString()]).toEqual([m.other]);
    for (let i = 0; i < 3; i++)
      expect(m.write.mock.calls[i][0]).toBe(
        (await m.simulate.mock.results[i].value).request,
      );
    expect(screen.getAllByRole("link", { name: /confirmed/ })).toHaveLength(3);
    expect(
      screen.getByRole("button", { name: "Register GasliteDrop" }),
    ).toBeDisabled();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
  it("does not offer revocation to a non-owner", async () => {
    m.owner = m.other;
    mount();
    await screen.findByText(/Only the collection owner shown/);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(
      screen.getByRole("button", { name: "Revoke GasliteDrop" }),
    ).toBeDisabled();
    expect(m.write).not.toHaveBeenCalled();
  });
  it("leaves the applied registration intact when removal is declined", async () => {
    await prepare(true);
    m.write
      .mockImplementationOnce(async (request) => {
        m.last = request;
        return `0x${"1".padStart(64, "0")}`;
      })
      .mockRejectedValueOnce(new Error("Wallet declined"));
    fireEvent.click(screen.getByRole("button", { name: "Revoke GasliteDrop" }));
    await screen.findByText("Wallet declined");
    expect(m.write).toHaveBeenCalledTimes(2);
    expect(m.listId).toBe(7n);
    expect(m.lists["7"]).toContain(m.helper);
  });
  it("does not apply removal without the helper removal receipt proof", async () => {
    await prepare(true);
    m.receipt.mockImplementation(async ({ hash }) =>
      receipt(hash, m.last?.functionName !== "removeAccountFromWhitelist"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Revoke GasliteDrop" }));
    await screen.findByText(
      /receipt does not confirm the GasliteDrop allowlist change/,
    );
    expect(m.write).toHaveBeenCalledTimes(2);
    expect(m.listId).toBe(7n);
    expect(m.lists["7"]).toContain(m.helper);
  });
  it("does not claim revoked without the applied-list receipt proof", async () => {
    await prepare(true);
    m.receipt.mockImplementation(async ({ hash }) =>
      receipt(hash, m.last?.functionName !== "applyListToCollection"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Revoke GasliteDrop" }));
    await screen.findByText(
      /receipt does not confirm revocation for this collection/,
    );
    expect(
      screen.queryByText(
        "GasliteDrop registration revoked for this collection.",
      ),
    ).not.toBeInTheDocument();
  });
});
