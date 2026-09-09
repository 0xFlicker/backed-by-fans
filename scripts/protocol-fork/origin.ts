import pin from "./origin.json";
import type { Hex } from "../../web/node_modules/viem";

/** The only checked-in origin pin; old acceptance artifacts keep their own history. */
export const originPin = pin;
export function configuredOrigin(env: Record<string, string | undefined>) {
  const blockNumber = env.BBF_FORK_BLOCK_NUMBER ?? pin.blockNumber;
  const blockHash = env.BBF_FORK_BLOCK_HASH ?? pin.blockHash;
  if (!/^[1-9][0-9]*$/.test(blockNumber))
    throw new Error(
      "BBF_FORK_BLOCK_NUMBER must be an explicit positive number",
    );
  if (!/^0x[0-9a-fA-F]{64}$/.test(blockHash))
    throw new Error("BBF_FORK_BLOCK_HASH must pin the origin block");
  if (
    blockNumber !== pin.blockNumber ||
    blockHash.toLowerCase() !== pin.blockHash.toLowerCase()
  )
    throw new Error(
      "Origin overrides differ from origin.json; use refresh-origin.ts to verify a new pin",
    );
  return { blockNumber: BigInt(blockNumber), blockHash: blockHash as Hex };
}
