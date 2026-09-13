import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  type Log,
} from "viem";
import { describe, expect, it } from "vitest";

import { membershipFactoryAbi, membershipTierAbi } from "@/contracts";
import {
  receiptSelectedRewards,
  receiptMembershipRefund,
  receiptProvesPayment,
  receiptReferralClaim,
  receiptRewardClaim,
  receiptMembershipMaintenance,
  receiptRetiredReward,
} from "@/features/protocol/payout-reconciliation";

const tier = getAddress("0x1111111111111111111111111111111111111111");
const owner = getAddress("0x2222222222222222222222222222222222222222");
const creator = getAddress("0x3333333333333333333333333333333333333333");
const other = getAddress("0x4444444444444444444444444444444444444444");

describe("payout receipt reconciliation", () => {
  it("uses the final combined maintenance event instead of an intermediate ledger event", () => {
    const progress = (steps: bigint, retired: bigint, address = tier) =>
      ({
        address,
        data: encodeAbiParameters(
          [
            { type: "uint64" },
            { type: "uint256" },
            { type: "bool" },
            { type: "uint256" },
            { type: "uint256" },
          ],
          [1000n, steps, false, 0n, retired],
        ),
        topics: encodeEventTopics({
          abi: membershipTierAbi,
          eventName: "AccountingProgress",
        }),
      }) as Log;
    expect(
      receiptMembershipMaintenance(
        {
          logs: [progress(1n, 0n), progress(25n, 24n), progress(8n, 8n, other)],
        },
        tier,
      ),
    ).toMatchObject({
      processedSteps: 25n,
      retiredCount: 24n,
      complete: false,
    });
    expect(receiptMembershipMaintenance({ logs: [] }, tier)).toBeUndefined();
  });
  it("attributes ended credit only to the receipt owner and tier", () => {
    const receipt = {
      logs: [
        {
          address: tier,
          data: encodeAbiParameters([{ type: "uint256" }], [9n]),
          topics: encodeEventTopics({
            abi: membershipTierAbi,
            eventName: "RetiredRewardClaimed",
            args: { owner },
          }),
        } as Log,
      ],
    };
    expect(receiptRetiredReward(receipt, { tier, owner })).toEqual({
      amount: 9n,
      recipient: owner,
    });
    expect(
      receiptRetiredReward(receipt, { tier, owner: other }),
    ).toBeUndefined();
    expect(
      receiptRetiredReward(receipt, { tier: other, owner }),
    ).toBeUndefined();
  });
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
      receiptRewardClaim(receipt, {
        tier,
        tokenId: 4n,
        owner,
      }),
    ).toEqual({ amount: 9n, recipient: owner });
    expect(
      receiptReferralClaim(receipt, {
        tier,
        referrer: owner,
      }),
    ).toEqual({ amount: 7n, recipient: owner });
    for (const mismatch of [
      { tier: other },
      { owner: other },
      { tokenId: 5n },
    ]) {
      expect(
        receiptRewardClaim(receipt, { tier, tokenId: 4n, owner, ...mismatch }),
      ).toBeUndefined();
    }
    expect(
      receiptReferralClaim(receipt, { tier, referrer: other }),
    ).toBeUndefined();
    expect(
      receiptReferralClaim(receipt, { tier: other, referrer: owner }),
    ).toBeUndefined();
    const emptyAmount = encodeAbiParameters([{ type: "uint256" }], [0n]);
    const zeros = {
      logs: [
        { ...reward, data: emptyAmount },
        { ...referral, data: emptyAmount },
      ],
    };
    expect(
      receiptRewardClaim(zeros, { tier, tokenId: 4n, owner }),
    ).toBeUndefined();
    expect(
      receiptReferralClaim(zeros, { tier, referrer: owner }),
    ).toBeUndefined();
  });

  it("requires the exact refund token, recipient, and tier", () => {
    const refund = {
      address: tier,
      data: encodeAbiParameters(
        [{ type: "uint256" }, { type: "uint64" }, { type: "uint64" }],
        [10n, 2n, 0n],
      ),
      topics: encodeEventTopics({
        abi: membershipTierAbi,
        eventName: "MembershipRefunded",
        args: { tokenId: 4n, recipient: owner },
      }),
    } as Log;
    const receipt = { status: "success" as const, logs: [refund] };

    expect(
      receiptMembershipRefund(receipt, {
        tier,
        tokenId: 4n,
        recipient: owner,
        maxGrossRefund: 10n,
      }),
    ).toMatchObject({
      grossRefund: 10n,
      canceledPaidSeconds: 2n,
      canceledGrantSeconds: 0n,
    });
    expect(
      receiptMembershipRefund(receipt, {
        tier,
        tokenId: 5n,
        recipient: owner,
        maxGrossRefund: 10n,
      }),
    ).toBeUndefined();
    expect(
      receiptMembershipRefund(receipt, {
        tier,
        tokenId: 4n,
        recipient: owner,
        maxGrossRefund: 9n,
      }),
    ).toBeUndefined();
  });
});

describe("selected factory reward receipts", () => {
  const factory = creator;
  const selection = [{ tier, tokenIds: [4n, 5n] }];
  const confirmation = {
    address: factory,
    topics: encodeEventTopics({
      abi: membershipFactoryAbi,
      eventName: "EverythingClaimed",
      args: { beneficiary: owner },
    }),
    data: encodeAbiParameters([{ type: "uint256" }], [1n]),
  } as Log;
  const live = (tokenId = 4n, recipient = owner) =>
    ({
      address: tier,
      topics: encodeEventTopics({
        abi: membershipTierAbi,
        eventName: "RewardClaimed",
        args: { tokenId, owner: recipient },
      }),
      data: encodeAbiParameters([{ type: "uint256" }], [7n]),
    }) as Log;
  const retired = {
    address: tier,
    topics: encodeEventTopics({
      abi: membershipTierAbi,
      eventName: "RetiredRewardClaimed",
      args: { owner },
    }),
    data: encodeAbiParameters([{ type: "uint256" }], [3n]),
  } as Log;
  const referral = {
    address: tier,
    topics: encodeEventTopics({
      abi: membershipTierAbi,
      eventName: "ReferralClaimed",
      args: { referrer: owner },
    }),
    data: encodeAbiParameters([{ type: "uint256" }], [2n]),
  } as Log;
  const creatorCredit = {
    address: tier,
    topics: encodeEventTopics({
      abi: membershipTierAbi,
      eventName: "CreatorProceedsWithdrawn",
      args: { owner },
    }),
    data: encodeAbiParameters([{ type: "uint256" }], [11n]),
  } as Log;
  it("separates live positions from single-count owner categories", () => {
    expect(
      receiptSelectedRewards(
        {
          logs: [
            live(),
            live(5n),
            retired,
            referral,
            creatorCredit,
            confirmation,
          ],
        },
        { factory, owner, selection },
      ),
    ).toEqual([
      { tier, liveReward: 14n, retiredReward: 3n, referral: 2n, creator: 11n },
    ]);
  });
  it("requires the exact factory and beneficiary confirmation", () => {
    expect(() =>
      receiptSelectedRewards({ logs: [live()] }, { factory, owner, selection }),
    ).toThrow("did not confirm");
    expect(() =>
      receiptSelectedRewards(
        { logs: [confirmation] },
        { factory: other, owner, selection },
      ),
    ).toThrow("did not confirm");
  });
  it("rejects stale IDs, unexpected recipients, and repeated categories", () => {
    for (const logs of [
      [live(6n)],
      [live(4n, other)],
      [retired, retired],
      [live(), live()],
    ]) {
      expect(() =>
        receiptSelectedRewards(
          { logs: [...logs, confirmation] },
          { factory, owner, selection },
        ),
      ).toThrow(/unexpected|repeats/);
    }
  });
});
