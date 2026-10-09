import { describe, expect, it, vi } from "vitest";
import {
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  encodeErrorResult,
  type PublicClient,
  type Address,
} from "viem";
import { iAirdropTransferRegistryAbi } from "@/contracts";
import { inspectCollection } from "./collection";

const collection = "0x0000000000000000000000000000000000000004" as Address;
const helper = "0x0000000000000000000000000000000000000002" as Address;
const owner = "0x0000000000000000000000000000000000000001" as Address;
const registry = "0x0000000000000000000000000000000000000003" as Address;
function fixture() {
  const readContract = vi.fn(
    async ({ functionName }: { functionName: string }): Promise<unknown> => {
      if (functionName === "supportsInterface") return true;
      if (functionName === "name") return "Any ERC721";
      if (functionName === "owner") return owner;
      if (functionName === "getTransferValidator") return registry;
      if (functionName === "getTransferValidationFunction")
        return ["0xcaee23ea", false];
      if (functionName === "getCollectionSecurityPolicy")
        return {
          transferSecurityLevel: 3,
          operatorWhitelistId: 7n,
          permittedContractReceiversId: 0n,
        };
      if (functionName === "isAccountWhitelistedByCollection") return false;
      if (functionName === "validateTransfer")
        throw new ContractFunctionRevertedError({
          abi: iAirdropTransferRegistryAbi,
          functionName,
          data: encodeErrorResult({
            abi: iAirdropTransferRegistryAbi,
            errorName:
              "StrictAuthorizedTransferSecurityRegistry__UnauthorizedTransfer",
          }),
        });
      throw new Error(`Unexpected ${functionName}`);
    },
  );
  const getCode = vi.fn(async () => "0x1234");
  return {
    readContract,
    getCode,
    client: { readContract, getCode } as unknown as PublicClient,
  };
}
describe("collection registry detection", () => {
  it("identifies an operator restriction for any collection using a read-only call", async () => {
    const f = fixture();
    const result = await inspectCollection(f.client, collection, helper);
    expect(result.registry?.status).toBe("blocked");
    expect(result.owner).toBe(owner);
    expect(f.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        account: collection,
        functionName: "validateTransfer",
        args: [helper, owner, owner, 0n],
      }),
    );
  });
  it("does not treat a missing optional validator method as a failed collection", async () => {
    const f = fixture();
    const original = f.readContract.getMockImplementation()!;
    f.readContract.mockImplementation(async (params) => {
      if (params.functionName === "getTransferValidator")
        throw new ContractFunctionZeroDataError({
          functionName: params.functionName,
        });
      return original(params);
    });
    expect(
      (await inspectCollection(f.client, collection, helper)).registry,
    ).toBeUndefined();
  });
  it("surfaces RPC failures instead of treating a collection as unrestricted", async () => {
    const f = fixture();
    const original = f.readContract.getMockImplementation()!;
    f.readContract.mockImplementation(async (params) => {
      if (params.functionName === "getTransferValidator")
        throw new Error("RPC unavailable");
      return original(params);
    });
    await expect(
      inspectCollection(f.client, collection, helper),
    ).rejects.toThrow("RPC unavailable");
  });
  it("does not prompt registration merely because an operator is absent from a list", async () => {
    const f = fixture();
    const original = f.readContract.getMockImplementation()!;
    f.readContract.mockImplementation(async (params) =>
      params.functionName === "validateTransfer" ? undefined : original(params),
    );
    expect(
      (await inspectCollection(f.client, collection, helper)).registry?.status,
    ).toBe("allowed");
  });
});
