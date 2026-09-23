// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  erc20Abi,
  parseAbiParameters,
  type Address,
  type Hex,
} from "viem";
import { membershipTierAbi } from "../src/contracts";
import { reconcileMembershipBranch } from "../../scripts/protocol-fork/membership-evidence";
const tier = "0x0000000000000000000000000000000000000001" as const;
const owner = "0x0000000000000000000000000000000000000002" as const;
const executor = "0x0000000000000000000000000000000000000003" as const;
const currency = "0x0000000000000000000000000000000000000004" as const;
const hash: Hex = `0x${"11".repeat(32)}`;
function branch(gross = 40n) {
  return {
    executionChainId: 31337,
    transactions: [
      {
        transaction: {
          hash,
          from: executor as Address,
          to: tier,
          input: encodeFunctionData({
            abi: membershipTierAbi,
            functionName: "refillMembership",
            args: [1n, 2n, 25n],
          }),
        },
        receipt: {
          transactionHash: hash,
          from: executor,
          to: tier,
          status: "success",
          logs: [
            {
              address: tier,
              topics: encodeEventTopics({
                abi: membershipTierAbi,
                eventName: "MembershipRefilled",
                args: { tokenId: 1n, owner, executor },
              }),
              data: encodeAbiParameters(
                parseAbiParameters("uint256,uint256,uint64"),
                [2n, gross, 900000n],
              ),
            },
            {
              address: currency,
              topics: encodeEventTopics({
                abi: erc20Abi,
                eventName: "Transfer",
                args: { from: owner, to: tier },
              }),
              data: encodeAbiParameters(parseAbiParameters("uint256"), [40n]),
            },
            {
              address: tier,
              topics: encodeEventTopics({
                abi: membershipTierAbi,
                eventName: "SubscriptionUpdate",
                args: { tokenId: 1n },
              }),
              data: encodeAbiParameters(parseAbiParameters("uint64"), [
                900000n,
              ]),
            },
          ],
        },
      },
    ],
  };
}
describe("membership causal receipt evidence", () => {
  it("reconciles actual owner payment, bounded collection and updated expiration", () => {
    expect(reconcileMembershipBranch(branch())).toMatchObject({ refills: 1 });
  });
  it("rejects invented payment amounts and a mismatched executor", () => {
    expect(() => reconcileMembershipBranch(branch(41n))).toThrow("payment");
    const value = branch();
    value.transactions[0].transaction.from = owner;
    expect(() => reconcileMembershipBranch(value)).toThrow();
  });
  it("rejects a different transaction or chain behind the receipt", () => {
    const value = branch();
    value.transactions[0].transaction.hash = `0x${"22".repeat(32)}`;
    expect(() => reconcileMembershipBranch(value)).toThrow("transaction");
    expect(() =>
      reconcileMembershipBranch({ ...branch(), executionChainId: 1 }),
    ).toThrow("chain");
  });
});
