import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  type Log,
  type PublicClient,
} from "viem";
import { describe, expect, it, vi } from "vitest";
import { membershipTierAbi } from "@/contracts";

import {
  buildPaymentPreview,
  classifyMembershipState,
  parsePaymentAmount,
  validateGift,
  readRewardQuote,
  reconcilePaymentWeight,
  averageRewardBoost,
} from "@/features/membership/state";
import { isSameAddress } from "@/lib/address";

const recipient = getAddress("0x1111111111111111111111111111111111111111");

describe("supporter membership state", () => {
  it("reads the contract quote at the captured block and propagates failures", async () => {
    const readContract = vi.fn().mockResolvedValue({
      grossBefore: 400n,
      grossAfter: 500n,
      sharesAdded: 125n,
    });
    const client = { readContract } as unknown as PublicClient;
    await expect(
      readRewardQuote(client, {
        tier: recipient,
        gross: 100n,
        blockNumber: 321n,
      }),
    ).resolves.toEqual({
      grossBefore: 400n,
      grossAfter: 500n,
      sharesAdded: 125n,
    });
    expect(readContract).toHaveBeenCalledWith({
      address: recipient,
      abi: membershipTierAbi,
      functionName: "previewShares",
      args: [100n],
      blockNumber: 321n,
    });
    readContract.mockRejectedValue(new Error("Capacity exceeded"));
    await expect(
      readRewardQuote(client, {
        tier: recipient,
        gross: 100n,
        blockNumber: 321n,
      }),
    ).rejects.toThrow("Capacity exceeded");
    expect(averageRewardBoost(125n, 100n)).toBe("1.25×");
    expect(averageRewardBoost(0n, 0n)).toBe("0×");
  });

  it("uses actual issuance after curve movement and accepts later canonical growth", () => {
    const payment = (gross: bigint, tokenId = 4n) =>
      ({
        address: recipient,
        data: encodeAbiParameters(
          [{ type: "uint256" }, { type: "uint64" }],
          [gross, 1n],
        ),
        topics: encodeEventTopics({
          abi: membershipTierAbi,
          eventName: "PaymentProcessed",
          args: { payer: recipient, recipient, tokenId },
        }),
      }) as Log;
    const issued = {
      address: recipient,
      data: encodeAbiParameters(
        [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
        [110n, 400n, 900n],
      ),
      topics: encodeEventTopics({
        abi: membershipTierAbi,
        eventName: "SharesIssued",
        args: { tokenId: 4n },
      }),
    } as Log;
    const input = {
      tier: recipient,
      payer: recipient,
      recipient,
      gross: 100n,
      periods: 1n,
      tokenId: 4n,
      shares: 550n,
    };
    // The old quote could have been 150. Refunds may also have shortened access
    // before inclusion; neither changes the receipt's actual 110 permanent shares.
    expect(
      reconcilePaymentWeight({ logs: [payment(100n), issued] }, input),
    ).toBe(110n);
    expect(
      reconcilePaymentWeight(
        { logs: [payment(100n), issued] },
        { ...input, shares: 399n },
      ),
    ).toBeUndefined();
    expect(
      reconcilePaymentWeight({ logs: [payment(100n, 5n), issued] }, input),
    ).toBeUndefined();
    expect(reconcilePaymentWeight({ logs: [issued] }, input)).toBeUndefined();
    expect(
      reconcilePaymentWeight({ logs: [payment(100n)] }, input),
    ).toBeUndefined();
    expect(
      reconcilePaymentWeight({ logs: [payment(0n)] }, { ...input, gross: 0n }),
    ).toBe(0n);
  });
  it.each([
    [{ walletReady: false, tokenId: 0n }, "unready"],
    [{ walletReady: true, tokenId: 0n }, "joinable"],
    [
      { walletReady: true, tokenId: 1n, active: true, occupied: true },
      "active",
    ],
    [
      { walletReady: true, tokenId: 1n, active: false, occupied: true },
      "expired-pending",
    ],
    [
      { walletReady: true, tokenId: 1n, active: false, occupied: false },
      "retired",
    ],
  ] as const)("classifies %o as %s", (input, expected) => {
    expect(classifyMembershipState(input)).toBe(expected);
  });

  it("extends active time from expiration and restarts expired time at now", () => {
    const active = buildPaymentPreview({
      now: 1_000n,
      currentExpiration: 2_000n,
      periodDuration: 300n,
      periods: 2n,
      pricePerPeriod: 10_000_000n,
      contribution: 0n,
      allowance: 5_000_000n,
      protocolFeeBps: 100,
      rewardBps: 500,
      referralBps: 100,

      referralApplies: true,
    });
    expect(active.resultingExpiration).toBe(2_600n);
    expect(active.duration).toBe(600n);
    expect(active.gross).toBe(20_000_000n);
    expect(active.exactApproval).toBe(20_000_000n);
    expect(active).not.toHaveProperty("sharesAdded");
    expect(active.split?.referral).toBe(200_000n);

    expect(
      buildPaymentPreview({
        now: 3_000n,
        currentExpiration: 2_000n,
        periodDuration: 300n,
        periods: 1n,
        pricePerPeriod: 10_000_000n,
        contribution: 0n,
        allowance: 10_000_000n,
        protocolFeeBps: 100,
        rewardBps: 500,
        referralBps: 100,

        referralApplies: false,
      }).resultingExpiration,
    ).toBe(3_300n);
  });

  it("separates zero and positive choose-your-support economics", () => {
    const free = buildPaymentPreview({
      now: 100n,
      currentExpiration: 0n,
      periodDuration: 30n,
      periods: 1n,
      pricePerPeriod: 0n,
      contribution: 0n,
      allowance: 0n,
      protocolFeeBps: 100,
      rewardBps: 500,
      referralBps: 100,

      referralApplies: true,
    });
    expect(free).toMatchObject({
      gross: 0n,
      duration: 30n,

      exactApproval: 0n,
      split: undefined,
    });

    const supported = buildPaymentPreview({
      now: 100n,
      currentExpiration: 0n,
      periodDuration: 30n,
      periods: 1n,
      pricePerPeriod: 0n,
      contribution: 100_000_000n,
      allowance: 0n,
      protocolFeeBps: 100,
      rewardBps: 500,
      referralBps: 100,

      referralApplies: true,
    });
    expect(supported.gross).toBe(100_000_000n);
    expect(supported).not.toHaveProperty("sharesAdded");
    expect(supported.split?.creatorReferred).toBe(93_000_000n);
  });

  it("forbids self-gifts and every zero-price third-party action", () => {
    expect(validateGift(recipient, recipient, 10_000_000n)).toMatch(
      /yourself/i,
    );
    expect(
      validateGift(
        recipient.toLowerCase() as `0x${string}`,
        recipient,
        10_000_000n,
      ),
    ).toMatch(/yourself/i);
    expect(
      validateGift(
        recipient,
        getAddress("0x2222222222222222222222222222222222222222"),
        0n,
      ),
    ).toMatch(/zero-price/i);
  });

  it("compares valid owner addresses without depending on checksum casing", () => {
    expect(
      isSameAddress(recipient, recipient.toLowerCase() as `0x${string}`),
    ).toBe(true);
  });

  it("parses the selected token without inventing precision or accepting negatives", () => {
    const token = { decimals: 6, uiMultiplier: 10n ** 18n };
    expect(parsePaymentAmount("10.000001", token)).toBe(10_000_001n);
    expect(parsePaymentAmount("0", token)).toBe(0n);
    expect(parsePaymentAmount("0.0000001", token)).toBeUndefined();
    expect(parsePaymentAmount("-1", token)).toBeUndefined();
  });
});
