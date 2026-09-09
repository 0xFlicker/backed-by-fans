import { beforeEach, expect, it, vi } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  zeroAddress,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { iSafeAbi, protocolBuybackVaultAbi } from "@/contracts";
import {
  addOwnerSignatures,
  settingsSafeTransaction,
  validateSignatureFile,
  verifySettingsReceipt,
  type SettingsSafePayload,
  type SignatureFile,
} from "./safe-settings";

const hash = `0x${"11".repeat(32)}` as Hex;
const digest = `0x${"22".repeat(32)}` as Hex;
const owner1 = privateKeyToAccount(`0x${"0".repeat(63)}1`);
const owner2 = privateKeyToAccount(`0x${"0".repeat(63)}2`);
const asset = "0x1111111111111111111111111111111111111111";
const terms = { minInput: 1n, maxInput: 10n, minInterval: 60n };
const payload: SettingsSafePayload = {
  chainId: 31337,
  safe: "0x2222222222222222222222222222222222222222",
  safeNonce: "3",
  to: "0x3333333333333333333333333333333333333333",
  data: encodeFunctionData({
    abi: protocolBuybackVaultAbi,
    functionName: "setExecutionLimits",
    args: [30n, [asset], [terms]],
  }),
  value: "0",
  operation: 0,
  safeTxGas: "2000000",
  baseGas: "0",
  gasPrice: "0",
  gasToken: zeroAddress,
  refundReceiver: zeroAddress,
};
async function bundle(): Promise<SignatureFile> {
  return {
    format: "bbf-settings-signatures-v1",
    proposalDigest: digest,
    safeTransactionHash: hash,
    signatures: [{ signer: owner1.address, data: await owner1.sign({ hash }) }],
  };
}
const readContract = vi.fn();
const client = { readContract } as unknown as PublicClient;
function receipt(
  eventName: "ExecutionSuccess" | "ExecutionFailure" = "ExecutionSuccess",
): TransactionReceipt {
  return {
    status: "success",
    blockNumber: 10n,
    logs: [
      {
        address: payload.safe,
        topics: encodeEventTopics({
          abi: iSafeAbi,
          eventName,
          args: { txHash: hash },
        }),
        data: encodeAbiParameters([{ type: "uint256" }], [0n]),
      },
    ],
  } as TransactionReceipt;
}
beforeEach(() => {
  readContract.mockReset();
  readContract.mockImplementation(async ({ functionName }) =>
    functionName === "limits"
      ? terms
      : functionName === "globalMinInterval"
        ? 30n
        : 4n,
  );
});
it("validates an EOA signature against the exact proposal and Safe hash", async () => {
  expect(
    (
      await validateSignatureFile(await bundle(), digest, hash, [
        owner1.address,
      ])
    ).signatures,
  ).toHaveLength(1);
});
it("rejects another proposal, duplicate signatures and a forged owner claim", async () => {
  const file = await bundle();
  await expect(
    validateSignatureFile(file, hash, hash, [owner1.address]),
  ).rejects.toThrow("another proposal");
  await expect(
    validateSignatureFile(
      { ...file, signatures: [...file.signatures, ...file.signatures] },
      digest,
      hash,
      [owner1.address],
    ),
  ).rejects.toThrow("Duplicate");
  await expect(
    validateSignatureFile(
      {
        ...file,
        signatures: [{ ...file.signatures[0], signer: owner2.address }],
      },
      digest,
      hash,
      [owner2.address],
    ),
  ).rejects.toThrow("does not match");
});
it("rejects unsupported signature methods and non-owners", async () => {
  const file = await bundle();
  await expect(
    validateSignatureFile(file, digest, hash, [owner2.address]),
  ).rejects.toThrow("current Safe owner");
  await expect(
    validateSignatureFile(
      { ...file, signatures: [{ ...file.signatures[0], data: "0x00" }] },
      digest,
      hash,
      [owner1.address],
    ),
  ).rejects.toThrow("typed-data signatures");
});
it("uses SDK owner sorting without changing reviewed transaction fields", async () => {
  const signatures = [
    ...(await bundle()).signatures,
    { signer: owner2.address, data: await owner2.sign({ hash }) },
  ];
  const forward = addOwnerSignatures(
    settingsSafeTransaction(payload),
    signatures,
  );
  const reverse = addOwnerSignatures(
    settingsSafeTransaction(payload),
    [...signatures].reverse(),
  );
  expect(forward.encodedSignatures()).toEqual(reverse.encodedSignatures());
  expect(forward.data).toMatchObject({
    to: payload.to,
    data: payload.data,
    nonce: 3,
    safeTxGas: "2000000",
    gasPrice: "0",
    operation: 0,
  });
});
it("rejects a successful outer receipt carrying Safe inner failure", async () => {
  await expect(
    verifySettingsReceipt(client, receipt("ExecutionFailure"), payload, hash),
  ).rejects.toThrow("inner execution success");
  expect(readContract).not.toHaveBeenCalled();
});
it("verifies exact policy, revision and nonce at the receipt block", async () => {
  await expect(
    verifySettingsReceipt(client, receipt(), payload, hash),
  ).resolves.toBeUndefined();
  expect(
    readContract.mock.calls.every(([args]) => args.blockNumber === 10n),
  ).toBe(true);
  readContract.mockImplementation(async ({ functionName }) =>
    functionName === "limits"
      ? { ...terms, maxInput: 9n }
      : functionName === "globalMinInterval"
        ? 30n
        : 4n,
  );
  await expect(
    verifySettingsReceipt(client, receipt(), payload, hash),
  ).rejects.toThrow("differ from your review");
});
it("rejects a success event for a different Safe transaction", async () => {
  await expect(
    verifySettingsReceipt(client, receipt(), payload, digest),
  ).rejects.toThrow("inner execution success");
});
