import {
  encodeAbiParameters,
  getAbiItem,
  keccak256,
  toHex,
  zeroAddress,
  type Address,
  type PublicClient,
} from "viem";
import {
  iBuybackModuleAbi,
  ponsBuybackModuleAbi,
  protocolBuybackVaultAbi,
} from "@/contracts";

/** Resolve identity at one block before interpreting any strategy-specific data. */
export async function readPonsModule(
  client: PublicClient,
  vault: Address,
  blockNumber?: bigint,
) {
  blockNumber ??= await client.getBlockNumber();
  const [address, revision, codeHash] = await Promise.all([
    client.readContract({
      address: vault,
      abi: protocolBuybackVaultAbi,
      functionName: "activeModule",
      blockNumber,
    }),
    client.readContract({
      address: vault,
      abi: protocolBuybackVaultAbi,
      functionName: "moduleRevision",
      blockNumber,
    }),
    client.readContract({
      address: vault,
      abi: protocolBuybackVaultAbi,
      functionName: "activeModuleCodeHash",
      blockNumber,
    }),
  ]);
  if (address === zeroAddress)
    throw new Error("Protocol token has not been launched.");
  const [id, version, boundVault, code] = await Promise.all([
    client.readContract({
      address,
      abi: iBuybackModuleAbi,
      functionName: "moduleId",
      blockNumber,
    }),
    client.readContract({
      address,
      abi: iBuybackModuleAbi,
      functionName: "moduleVersion",
      blockNumber,
    }),
    client.readContract({
      address,
      abi: iBuybackModuleAbi,
      functionName: "vault",
      blockNumber,
    }),
    client.getCode({ address, blockNumber }),
  ]);
  if (id !== keccak256(toHex("BBF.PonsBuyback")) || version !== 1n)
    throw new Error(
      "The active buyback module requires a different strategy interface.",
    );
  if (
    boundVault.toLowerCase() !== vault.toLowerCase() ||
    !code ||
    keccak256(code) !== codeHash
  )
    throw new Error(
      "Buyback module identity does not match the vault commitment.",
    );
  return { address, revision, codeHash, id, version };
}

export function ponsExecutionData(
  policyRevision: bigint,
  route: {
    pools: readonly {
      currency0: Address;
      currency1: Address;
      fee: number;
      tickSpacing: number;
      hooks: Address;
    }[];
  } = { pools: [] },
  minimumOutputs: readonly bigint[] = [],
) {
  return encodeAbiParameters(
    getAbiItem({ abi: ponsBuybackModuleAbi, name: "encodeExecutionData" })
      .inputs,
    [policyRevision, route, minimumOutputs],
  );
}
