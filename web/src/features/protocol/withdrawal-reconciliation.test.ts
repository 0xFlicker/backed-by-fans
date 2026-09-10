import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  type Log,
} from "viem";
import { describe, expect, it } from "vitest";

import { membershipTierAbi } from "@/contracts";
import { receiptCreatorWithdrawal } from "@/features/protocol/withdrawal-reconciliation";

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
  it("returns actual positive cash for the exact tier and owner", () => {
    const receipt = {
      status: "success" as const,
      logs: [withdrawalLog(12n)],
    };

    expect(
      receiptCreatorWithdrawal(receipt, {
        tier: contract,
        owner: recipient,
      }),
    ).toEqual({ amount: 12n, recipient });
    expect(
      receiptCreatorWithdrawal(receipt, {
        tier: contract,
        owner: getAddress("0x3333333333333333333333333333333333333333"),
      }),
    ).toBeUndefined();
    expect(
      receiptCreatorWithdrawal(
        { logs: [withdrawalLog(0n)] },
        { tier: contract, owner: recipient },
      ),
    ).toBeUndefined();
    expect(
      receiptCreatorWithdrawal(receipt, { tier: recipient, owner: recipient }),
    ).toBeUndefined();
  });
});
