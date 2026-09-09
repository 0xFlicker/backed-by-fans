import {
  EthSafeSignature,
  EthSafeTransaction,
  calculateSafeTransactionHash,
} from "@safe-global/protocol-kit";
import {
  decodeFunctionData,
  encodeFunctionData,
  isAddress,
  parseEventLogs,
  recoverAddress,
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import { iSafeAbi, protocolBuybackVaultAbi } from "@/contracts";

/** Exact, reviewed settings envelope. No transaction lifecycle lives here. */
export type SettingsSafePayload = {
  chainId: number;
  safe: Address;
  safeNonce: string;
  to: Address;
  data: Hex;
  value: string;
  operation: number;
  safeTxGas: string;
  baseGas: string;
  gasPrice: string;
  gasToken: Address;
  refundReceiver: Address;
};

export type SignatureFile = {
  format: "bbf-settings-signatures-v1";
  proposalDigest: Hex;
  safeTransactionHash: Hex;
  signatures: { signer: Address; data: Hex }[];
};

export function settingsSafeTransaction(payload: SettingsSafePayload) {
  const nonce = Number(payload.safeNonce);
  if (!Number.isSafeInteger(nonce) || nonce < 0 || payload.operation !== 0)
    throw new Error(
      "Unsupported Safe nonce or operation. Regenerate the proposal.",
    );
  return new EthSafeTransaction({
    to: payload.to,
    data: payload.data,
    value: payload.value,
    operation: 0,
    nonce,
    safeTxGas: payload.safeTxGas,
    baseGas: payload.baseGas,
    gasPrice: payload.gasPrice,
    gasToken: payload.gasToken,
    refundReceiver: payload.refundReceiver,
  });
}

export function safeExecutionArgs(transaction: EthSafeTransaction) {
  const t = transaction.data;
  return [
    t.to as Address,
    BigInt(t.value),
    t.data as Hex,
    t.operation,
    BigInt(t.safeTxGas),
    BigInt(t.baseGas),
    BigInt(t.gasPrice),
    t.gasToken as Address,
    t.refundReceiver as Address,
    transaction.encodedSignatures() as Hex,
  ] as const;
}

export async function readSafeApproval(
  client: PublicClient,
  payload: SettingsSafePayload,
) {
  const blockNumber = await client.getBlockNumber();
  const [owners, threshold, version, nonce] = await Promise.all([
    client.readContract({
      address: payload.safe,
      abi: iSafeAbi,
      functionName: "getOwners",
      blockNumber,
    }),
    client.readContract({
      address: payload.safe,
      abi: iSafeAbi,
      functionName: "getThreshold",
      blockNumber,
    }),
    client.readContract({
      address: payload.safe,
      abi: iSafeAbi,
      functionName: "VERSION",
      blockNumber,
    }),
    client.readContract({
      address: payload.safe,
      abi: iSafeAbi,
      functionName: "nonce",
      blockNumber,
    }),
  ]);
  if (nonce.toString() !== payload.safeNonce)
    throw new Error(
      "The Safe nonce changed. Generate a new proposal before signing.",
    );
  if (threshold < 1n || threshold > BigInt(owners.length))
    throw new Error("The Safe owner threshold is invalid.");
  const transaction = settingsSafeTransaction(payload);
  const args = safeExecutionArgs(transaction);
  const onchainHash = await client.readContract({
    address: payload.safe,
    abi: iSafeAbi,
    functionName: "getTransactionHash",
    args: [...args.slice(0, 9), nonce] as [
      Address,
      bigint,
      Hex,
      number,
      bigint,
      bigint,
      bigint,
      Address,
      Address,
      bigint,
    ],
    blockNumber,
  });
  const sdkHash = calculateSafeTransactionHash(
    payload.safe,
    transaction.data,
    version,
    BigInt(payload.chainId),
  );
  if (sdkHash.toLowerCase() !== onchainHash.toLowerCase())
    throw new Error("Safe SDK and onchain transaction hashes do not agree.");
  return {
    owners,
    threshold: Number(threshold),
    version,
    hash: onchainHash,
    blockNumber,
  };
}

export async function validateSignatureFile(
  input: unknown,
  digest: Hex,
  safeTransactionHash: Hex,
  owners: readonly Address[],
): Promise<SignatureFile> {
  if (!input || typeof input !== "object")
    throw new Error("Invalid signature file.");
  const file = input as Partial<SignatureFile>;
  if (
    file.format !== "bbf-settings-signatures-v1" ||
    file.proposalDigest !== digest ||
    file.safeTransactionHash !== safeTransactionHash ||
    !Array.isArray(file.signatures)
  )
    throw new Error(
      "These signatures belong to another proposal or Safe transaction.",
    );
  const seen = new Set<string>();
  for (const entry of file.signatures) {
    if (
      !entry ||
      !isAddress(entry.signer) ||
      typeof entry.data !== "string" ||
      !/^0x[0-9a-fA-F]{128}(1b|1c)$/.test(entry.data)
    )
      throw new Error("Only EOA typed-data signatures are supported.");
    const signer = entry.signer.toLowerCase();
    if (seen.has(signer)) throw new Error("Duplicate owner signature.");
    seen.add(signer);
    if (!owners.some((owner) => owner.toLowerCase() === signer))
      throw new Error("A signature is not from a current Safe owner.");
    if (
      (
        await recoverAddress({
          hash: safeTransactionHash,
          signature: entry.data,
        })
      ).toLowerCase() !== signer
    )
      throw new Error(
        "An owner signature does not match this Safe transaction.",
      );
  }
  return file as SignatureFile;
}

export function addOwnerSignatures(
  transaction: EthSafeTransaction,
  signatures: SignatureFile["signatures"],
) {
  for (const signature of signatures)
    transaction.addSignature(
      new EthSafeSignature(signature.signer, signature.data),
    );
  return transaction;
}

export async function verifySettingsReceipt(
  client: PublicClient,
  receipt: TransactionReceipt,
  payload: SettingsSafePayload,
  safeTransactionHash: Hex,
) {
  if (receipt.status !== "success")
    throw new Error("The Safe transaction reverted.");
  const events = parseEventLogs({ abi: iSafeAbi, logs: receipt.logs }).filter(
    (event) =>
      event.address.toLowerCase() === payload.safe.toLowerCase() &&
      (event.eventName === "ExecutionSuccess" ||
        event.eventName === "ExecutionFailure") &&
      event.args.txHash.toLowerCase() === safeTransactionHash.toLowerCase(),
  );
  if (
    !events.some((event) => event.eventName === "ExecutionSuccess") ||
    events.some((event) => event.eventName === "ExecutionFailure")
  )
    throw new Error(
      "The receipt does not confirm Safe inner execution success. The settings have not been verified.",
    );
  const decoded = decodeFunctionData({
    abi: protocolBuybackVaultAbi,
    data: payload.data,
  });
  if (decoded.functionName !== "setExecutionLimits")
    throw new Error("Expected a combined settings transaction.");
  const [globalInterval, assets] = decoded.args;
  const [actualGlobal, actualLimits, nonce] = await Promise.all([
    client.readContract({
      address: payload.to,
      abi: protocolBuybackVaultAbi,
      functionName: "globalMinInterval",
      blockNumber: receipt.blockNumber,
    }),
    Promise.all(
      assets.map((asset) =>
        client.readContract({
          address: payload.to,
          abi: protocolBuybackVaultAbi,
          functionName: "limits",
          args: [asset],
          blockNumber: receipt.blockNumber,
        }),
      ),
    ),
    client.readContract({
      address: payload.safe,
      abi: iSafeAbi,
      functionName: "nonce",
      blockNumber: receipt.blockNumber,
    }),
  ]);
  if (
    actualGlobal !== globalInterval ||
    nonce !== BigInt(payload.safeNonce) + 1n ||
    encodeFunctionData({
      abi: protocolBuybackVaultAbi,
      functionName: "setExecutionLimits",
      args: [actualGlobal, assets, actualLimits],
    }).toLowerCase() !== payload.data.toLowerCase()
  )
    throw new Error(
      "The receipt succeeded but the saved settings differ from your review.",
    );
}
