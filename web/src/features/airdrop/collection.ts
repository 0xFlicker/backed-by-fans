import {
  BaseError,
  ContractFunctionRevertedError,
  ContractFunctionZeroDataError,
  zeroAddress,
  type Address,
  type PublicClient,
} from "viem";
import {
  ierc721Abi,
  ierc721MetadataAbi,
  iAirdropCreatorCollectionAbi,
  iAirdropTransferRegistryAbi,
} from "@/contracts";

export function airdropPath(chainId: number) {
  return `/chains/${chainId}/airdrop` as const;
}
export function registrationPath(chainId: number, collection: Address) {
  return `/chains/${chainId}/airdrop/register/${collection}` as const;
}

/** A missing optional contract method is distinct from an RPC failure. */
async function optionalRead<T>(read: () => Promise<T>): Promise<T | undefined> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof BaseError) {
      const cause = error.walk(
        (e) =>
          e instanceof ContractFunctionRevertedError ||
          e instanceof ContractFunctionZeroDataError,
      );
      if (
        cause instanceof ContractFunctionRevertedError ||
        cause instanceof ContractFunctionZeroDataError
      )
        return undefined;
    }
    throw error;
  }
}

export async function inspectCollection(
  client: PublicClient,
  collection: Address,
  helper: Address,
) {
  const [code, supports, name, owner, validator, validationFunction] =
    await Promise.all([
      client.getCode({ address: collection }),
      client.readContract({
        address: collection,
        abi: ierc721Abi,
        functionName: "supportsInterface",
        args: ["0x80ac58cd"],
      }),
      optionalRead(() =>
        client.readContract({
          address: collection,
          abi: ierc721MetadataAbi,
          functionName: "name",
        }),
      ),
      optionalRead(() =>
        client.readContract({
          address: collection,
          abi: iAirdropCreatorCollectionAbi,
          functionName: "owner",
        }),
      ),
      optionalRead(() =>
        client.readContract({
          address: collection,
          abi: iAirdropCreatorCollectionAbi,
          functionName: "getTransferValidator",
        }),
      ),
      optionalRead(() =>
        client.readContract({
          address: collection,
          abi: iAirdropCreatorCollectionAbi,
          functionName: "getTransferValidationFunction",
        }),
      ),
    ]);
  if (!code || code === "0x" || !supports)
    throw new Error("Enter an ERC721 contract deployed on this network.");
  const base = {
    name: name || "ERC721 collection",
    owner: owner === zeroAddress ? undefined : owner,
  };
  if (!validator || validator === zeroAddress)
    return { ...base, registry: undefined };
  const policy = await optionalRead(() =>
    client.readContract({
      address: validator,
      abi: iAirdropTransferRegistryAbi,
      functionName: "getCollectionSecurityPolicy",
      args: [collection],
    }),
  );
  const whitelisted = await optionalRead(() =>
    client.readContract({
      address: validator,
      abi: iAirdropTransferRegistryAbi,
      functionName: "isAccountWhitelistedByCollection",
      args: [collection, helper],
    }),
  );
  if (!policy || whitelisted === undefined)
    return {
      ...base,
      registry: {
        address: validator,
        status: "unsupported" as const,
        policy: undefined,
      },
    };
  let status: "allowed" | "blocked" | "unknown" = "unknown";
  const signature = validationFunction?.[0];
  // Probe the declared validator with eth_call as the collection would call it.
  // No NFT moves and no approval is needed. Actual batch simulation still checks recipients.
  if (
    owner &&
    ["0xcaee23ea", "0x7c1e14b4", "0x285fb8c8"].includes(signature!)
  ) {
    const args = [
      helper,
      owner,
      "0x0000000000000000000000000000000000000001",
    ] as const;
    try {
      if (signature === "0xcaee23ea")
        await client.readContract({
          address: validator,
          account: collection,
          abi: iAirdropTransferRegistryAbi,
          functionName: "validateTransfer",
          args: [...args, 0n],
        });
      else if (signature === "0x7c1e14b4")
        await client.readContract({
          address: validator,
          account: collection,
          abi: iAirdropTransferRegistryAbi,
          functionName: "validateTransfer",
          args,
        });
      else
        await client.readContract({
          address: validator,
          account: collection,
          abi: iAirdropTransferRegistryAbi,
          functionName: "applyCollectionTransferPolicy",
          args,
        });
      status = "allowed";
    } catch (error) {
      const cause =
        error instanceof BaseError
          ? error.walk((e) => e instanceof ContractFunctionRevertedError)
          : undefined;
      if (!(cause instanceof ContractFunctionRevertedError)) throw error;
      const name = cause.data?.errorName;
      if (
        name ===
          "StrictAuthorizedTransferSecurityRegistry__UnauthorizedTransfer" ||
        name ===
          "StrictAuthorizedTransferSecurityRegistry__CallerMustBeWhitelistedOperator"
      )
        status = "blocked";
      // Other recipient/token policies are not cured by registering an operator.
    }
  }
  return {
    ...base,
    registry: { address: validator, status, policy, whitelisted },
  };
}

export function sameAccounts(
  left: readonly Address[],
  right: readonly Address[],
) {
  return (
    left.length === right.length &&
    [...left]
      .map((v) => v.toLowerCase())
      .sort()
      .join() ===
      [...right]
        .map((v) => v.toLowerCase())
        .sort()
        .join()
  );
}
