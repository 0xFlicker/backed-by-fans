import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  type Log,
} from "viem";
import { describe, expect, it } from "vitest";

import { membershipTierAbi } from "@/contracts";
import { receiptProvesCreatorWithdrawal } from "@/features/protocol/withdrawal-reconciliation";

const contract = getAddress("0x1111111111111111111111111111111111111111");
const recipient = getAddress("0x2222222222222222222222222222222222222222");

function withdrawalLog(amount: bigint): Log {
  return {
    address: contract,
    data: encodeAbiParameters([{ type: "uint256" }], [amount]),
    topics: encodeEventTopics({
      abi: membershipTierAbi,
      eventName: "CreatorProceedsWithdrawn",
      args: { owner: recipient },
    }),
  } as Log;
}

describe("withdrawal receipt reconciliation", () => {
  it("requires the exact tier, owner, and amount", () => {
    const receipt = {
      status: "success" as const,
      logs: [withdrawalLog(12n)],
    };

    expect(
      receiptProvesCreatorWithdrawal(receipt, {
        tier: contract,
        owner: recipient,
        amount: 12n,
      }),
    ).toBe(true);
    expect(
      receiptProvesCreatorWithdrawal(receipt, {
        tier: contract,
        owner: getAddress("0x3333333333333333333333333333333333333333"),
        amount: 12n,
      }),
    ).toBe(false);
  });
});
