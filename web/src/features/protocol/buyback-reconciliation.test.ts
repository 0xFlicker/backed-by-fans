import { expect, it } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  getAbiItem,
  type Address,
  type TransactionReceipt,
} from "viem";
import { protocolBuybackVaultAbi, protocolBurnRouterAbi } from "@/contracts";
import { receiptBuyback, receiptAdvance } from "./buyback-reconciliation";
const vault = "0x1111111111111111111111111111111111111111" as const;
const asset = "0x2222222222222222222222222222222222222222" as const;

it("reports actual atomic advance outcomes and skipped buybacks from the supplied receipt", () => {
  const caller = "0x3333333333333333333333333333333333333333";
  const completion = getAbiItem({
    abi: protocolBurnRouterAbi,
    name: "AdvanceCompleted",
  });
  const receipt = {
    status: "success",
    transactionHash: `0x${"1".repeat(64)}`,
    logs: [
      {
        address: vault,
        topics: encodeEventTopics({
          abi: protocolBurnRouterAbi,
          eventName: "AccountingAdvanced",
          args: { caller, tier: asset },
        }),
        data: encodeAbiParameters(
          [
            { type: "uint256" },
            { type: "uint64" },
            { type: "bool" },
            { type: "uint256" },
          ],
          [25n, 950n, false, 9n],
        ),
      },
      {
        address: vault,
        topics: encodeEventTopics({
          abi: protocolBurnRouterAbi,
          eventName: "TierReleased",
          args: { caller, tier: asset, asset },
        }),
        data: encodeAbiParameters([{ type: "uint256" }], [7n]),
      },
      {
        address: vault,
        topics: encodeEventTopics({
          abi: protocolBurnRouterAbi,
          eventName: "PurchaseCompleted",
          args: { caller, asset },
        }),
        data: encodeAbiParameters([{ type: "uint8" }], [0]),
      },
      {
        address: vault,
        topics: encodeEventTopics({
          abi: protocolBurnRouterAbi,
          eventName: "PurchaseSkipped",
          args: { asset },
        }),
        data: encodeAbiParameters(
          [{ type: "uint8" }, { type: "uint8" }],
          [0, 2],
        ),
      },
      {
        address: vault,
        topics: encodeEventTopics({
          abi: protocolBurnRouterAbi,
          eventName: "PurchaseSkipped",
          args: { asset },
        }),
        data: encodeAbiParameters(
          [{ type: "uint8" }, { type: "uint8" }],
          [1, 2],
        ),
      },
      {
        address: vault,
        topics: encodeEventTopics({
          abi: protocolBurnRouterAbi,
          eventName: "AdvanceCompleted",
          args: { caller },
        }),
        data: encodeAbiParameters(
          completion.inputs.filter((item) => !item.indexed),
          [25n, 1n, 1n, 0n, false],
        ),
      },
    ],
  } as unknown as TransactionReceipt;
  const result = receiptAdvance(receipt, { router: vault, caller });
  expect(result?.completed).toMatchObject({
    processedSteps: 25n,
    releasedTiers: 1n,
    purchases: 1n,
    burned: 0n,
    burnMeasured: false,
  });
  expect(result?.accounting).toEqual([
    {
      caller,
      tier: asset,
      processedSteps: 25n,
      accountedThrough: 950n,
      complete: false,
      earnedScaledDelta: 9n,
    },
  ]);
  expect(result?.releases[0]).toMatchObject({ asset, amount: 7n });
  expect(result?.purchases[0]).toMatchObject({ asset, bucket: 0 });
  expect(result?.skipped).toHaveLength(2);
  expect(receiptAdvance(receipt, { router: asset, caller })).toBeUndefined();
  expect(
    receiptAdvance(receipt, { router: vault, caller: asset }),
  ).toBeUndefined();
  expect(
    receiptAdvance(
      { ...receipt, status: "reverted" },
      { router: vault, caller },
    ),
  ).toBeUndefined();
});
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
