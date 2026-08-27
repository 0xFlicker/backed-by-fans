import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  type Log,
} from "viem";
import { describe, expect, it } from "vitest";

import { membershipFactoryAbi, membershipTierAbi } from "@/contracts";
import {
  receiptProvesCreatorWithdrawal,
  receiptProvesProtocolWithdrawal,
} from "@/features/protocol/withdrawal-reconciliation";

const contract = getAddress("0x1111111111111111111111111111111111111111");
const recipient = getAddress("0x2222222222222222222222222222222222222222");

function withdrawalLog(
  abi: typeof membershipFactoryAbi | typeof membershipTierAbi,
  eventName: "ProtocolFeesWithdrawn" | "CreatorProceedsWithdrawn",
  indexedName: "recipient" | "owner",
  amount: bigint,
): Log {
  return {
    address: contract,
    data: encodeAbiParameters([{ type: "uint256" }], [amount]),
    topics: encodeEventTopics({
      abi,
      eventName,
      args: { [indexedName]: recipient },
    }),
  } as Log;
}

describe("withdrawal receipt reconciliation", () => {
  it("proves the exact protocol withdrawal even if later fees arrive", () => {
    const receipt = {
      status: "success" as const,
      logs: [
        withdrawalLog(
          membershipFactoryAbi,
          "ProtocolFeesWithdrawn",
          "recipient",
          9n,
        ),
      ],
    };

    expect(
      receiptProvesProtocolWithdrawal(receipt, {
        factory: contract,
        recipient,
        amount: 9n,
      }),
    ).toBe(true);
    expect(
      receiptProvesProtocolWithdrawal(receipt, {
        factory: contract,
        recipient,
        amount: 10n,
      }),
    ).toBe(false);
  });

  it("requires the exact tier, owner, and amount", () => {
    const receipt = {
      status: "success" as const,
      logs: [
        withdrawalLog(
          membershipTierAbi,
          "CreatorProceedsWithdrawn",
          "owner",
          12n,
        ),
      ],
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
