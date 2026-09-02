import { getAddress } from "viem";
import { describe, expect, it } from "vitest";

import {
  buildPaymentPreview,
  classifyMembershipState,
  parsePaymentAmount,
  validateGift,
} from "@/features/membership/state";
import { isSameAddress } from "@/lib/address";

const recipient = getAddress("0x1111111111111111111111111111111111111111");

describe("supporter membership state", () => {
  it.each([
    [{ walletReady: false, tokenId: 0n }, "unready"],
    [{ walletReady: true, tokenId: 0n }, "joinable"],
    [
      { walletReady: true, tokenId: 1n, active: true, occupied: true },
      "active",
    ],
    [
      { walletReady: true, tokenId: 1n, active: false, occupied: true },
      "expired-occupied",
    ],
    [
      { walletReady: true, tokenId: 1n, active: false, occupied: false },
      "historical-synchronized",
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
      rewardBps: 500,
      referralBps: 100,
      referralApplies: true,
    });
    expect(active.resultingExpiration).toBe(2_600n);
    expect(active.duration).toBe(600n);
    expect(active.gross).toBe(20_000_000n);
    expect(active.exactApproval).toBe(20_000_000n);
    expect(active.sharesAdded).toBe(20_000_000n);
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
      rewardBps: 500,
      referralBps: 100,
      referralApplies: true,
    });
    expect(free).toMatchObject({
      gross: 0n,
      duration: 30n,
      sharesAdded: 0n,
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
      rewardBps: 500,
      referralBps: 100,
      referralApplies: true,
    });
    expect(supported.gross).toBe(100_000_000n);
    expect(supported.sharesAdded).toBe(100_000_000n);
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
