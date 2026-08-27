import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  type Log,
} from "viem";
import { describe, expect, it } from "vitest";

import { membershipTierAbi } from "@/contracts";
import {
  receiptProvesMembershipRefund,
  receiptProvesPayment,
  receiptProvesReferralClaim,
  receiptProvesRewardClaim,
} from "@/features/protocol/payout-reconciliation";

const tier = getAddress("0x1111111111111111111111111111111111111111");
const owner = getAddress("0x2222222222222222222222222222222222222222");
const creator = getAddress("0x3333333333333333333333333333333333333333");
const other = getAddress("0x4444444444444444444444444444444444444444");

describe("payout receipt reconciliation", () => {
  it("proves the exact payer, recipient, gross, and period count", () => {
    const payment = {
      address: tier,
      data: encodeAbiParameters(
        [{ type: "uint256" }, { type: "uint64" }],
        [10_000_000n, 2n],
      ),
      topics: encodeEventTopics({
        abi: membershipTierAbi,
        eventName: "PaymentProcessed",
        args: { payer: owner, recipient: creator, tokenId: 4n },
      }),
    } as Log;
    const receipt = { status: "success" as const, logs: [payment] };

    expect(
      receiptProvesPayment(receipt, {
        tier,
        payer: owner,
        recipient: creator,
        gross: 10_000_000n,
        periods: 2n,
      }),
    ).toBe(true);
    for (const mismatch of [
      { tier: other },
      { payer: other },
      { recipient: other },
      { gross: 10_000_001n },
      { periods: 3n },
    ]) {
      expect(
        receiptProvesPayment(receipt, {
          tier,
          payer: owner,
          recipient: creator,
          gross: 10_000_000n,
          periods: 2n,
          ...mismatch,
        }),
      ).toBe(false);
    }
  });

  it("proves fixed-destination reward and referral claims", () => {
    const reward = {
      address: tier,
      data: encodeAbiParameters([{ type: "uint256" }], [9n]),
      topics: encodeEventTopics({
        abi: membershipTierAbi,
        eventName: "RewardClaimed",
        args: { tokenId: 4n, owner },
      }),
    } as Log;
    const referral = {
      address: tier,
      data: encodeAbiParameters([{ type: "uint256" }], [7n]),
      topics: encodeEventTopics({
        abi: membershipTierAbi,
        eventName: "ReferralClaimed",
        args: { referrer: owner },
      }),
    } as Log;
    const receipt = { status: "success" as const, logs: [reward, referral] };

    expect(
      receiptProvesRewardClaim(receipt, {
        tier,
        tokenId: 4n,
        owner,
        amount: 9n,
      }),
    ).toBe(true);
    expect(
      receiptProvesReferralClaim(receipt, {
        tier,
        referrer: owner,
        amount: 7n,
      }),
    ).toBe(true);
  });

  it("requires the exact refund token, recipient, owner, and tier", () => {
    const refund = {
      address: tier,
      data: encodeAbiParameters(
        [{ type: "uint256" }, { type: "uint256" }],
        [10n, 2n],
      ),
      topics: encodeEventTopics({
        abi: membershipTierAbi,
        eventName: "MembershipRefunded",
        args: { tokenId: 4n, recipient: owner, tierOwner: creator },
      }),
    } as Log;
    const receipt = { status: "success" as const, logs: [refund] };

    expect(
      receiptProvesMembershipRefund(receipt, {
        tier,
        tokenId: 4n,
        recipient: owner,
        tierOwner: creator,
      }),
    ).toBe(true);
    expect(
      receiptProvesMembershipRefund(receipt, {
        tier,
        tokenId: 5n,
        recipient: owner,
        tierOwner: creator,
      }),
    ).toBe(false);
  });
});
