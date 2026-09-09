import { expect, it } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  getAbiItem,
  type Address,
  type TransactionReceipt,
} from "viem";
import { protocolBuybackVaultAbi } from "@/contracts";
import { receiptBuyback } from "./buyback-reconciliation";
const vault = "0x1111111111111111111111111111111111111111" as const;
const asset = "0x2222222222222222222222222222222222222222" as const;
export function buybackReceipt(emitter: Address = vault): TransactionReceipt {
  const event = getAbiItem({
    abi: protocolBuybackVaultAbi,
    name: "BuybackBurned",
  });
  const topics = encodeEventTopics({
    abi: protocolBuybackVaultAbi,
    eventName: "BuybackBurned",
    args: { sequence: 1n, bucket: 0, input: asset },
  });
  const data = encodeAbiParameters(
    event.inputs.filter((input) => !input.indexed),
    [60n, 90n, 0, 2n],
  );
  return {
    status: "success",
    blockNumber: 10n,
    transactionHash: `0x${"3".repeat(64)}`,
    logs: [{ address: emitter, topics, data }],
  } as TransactionReceipt;
}
it("recognizes a partial-spend burn only from the canonical vault and matching source/revision", () => {
  const input = {
    vault,
    asset,
    bucket: 0 as const,
    amount: 100n,
    revision: 2n,
  };
  expect(receiptBuyback(buybackReceipt(), input)).toEqual({
    spent: 60n,
    burned: 90n,
    sequence: 1n,
  });
  expect(receiptBuyback(buybackReceipt(asset), input)).toBeUndefined();
  expect(
    receiptBuyback(buybackReceipt(), { ...input, bucket: 1 }),
  ).toBeUndefined();
  expect(
    receiptBuyback(buybackReceipt(), { ...input, revision: 3n }),
  ).toBeUndefined();
  expect(
    receiptBuyback(buybackReceipt(), { ...input, amount: 59n }),
  ).toBeUndefined();
  expect(
    receiptBuyback({ ...buybackReceipt(), status: "reverted" }, input),
  ).toBeUndefined();
});
it("recognizes a direct burn at revision zero and rejects vesting transfers as evidence", () => {
  const receipt = buybackReceipt(),
    event = getAbiItem({ abi: protocolBuybackVaultAbi, name: "DirectBurned" });
  receipt.logs[0] = {
    ...receipt.logs[0],
    topics: encodeEventTopics({
      abi: protocolBuybackVaultAbi,
      eventName: "DirectBurned",
      args: { sequence: 1n, bucket: 0, token: asset },
    }),
    data: encodeAbiParameters(
      event.inputs.filter((input) => !input.indexed),
      [100n],
    ),
  } as TransactionReceipt["logs"][number];
  expect(
    receiptBuyback(receipt, {
      vault,
      asset,
      bucket: 0,
      amount: 100n,
      revision: 0n,
    }),
  ).toMatchObject({ burned: 100n });
  expect(
    receiptBuyback(
      { ...receipt, logs: [] },
      { vault, asset, bucket: 0, amount: 100n, revision: 0n },
    ),
  ).toBeUndefined();
});
