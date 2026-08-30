import { getAddress, parseUnits } from "viem";
import { describe, expect, it } from "vitest";

import {
  defaultCreatorForm,
  evaluateCreatorForm,
  previewPaymentSplit,
} from "@/features/creator/config";

const creator = getAddress("0x1111111111111111111111111111111111111111");

describe("creator tier configuration", () => {
  it("produces the confirmed default terms", () => {
    const result = evaluateCreatorForm(defaultCreatorForm, creator);

    expect(result.errors).toEqual({});
    expect(result.config).toMatchObject({
      creator,
      pricePerPeriod: parseUnits("10", 6),
      periodDuration: 30n * 86_400n,
      rewardBps: 500,
      referralBps: 100,
      supplyCap: 0n,
      maxPrepaidPeriods: 12n,
    });
  });

  it("accepts arbitrary valid basis-point percentages", () => {
    const result = evaluateCreatorForm(
      {
        ...defaultCreatorForm,
        rewardPercent: "33.33",
        referralPercent: "65.67",
      },
      creator,
    );

    expect(result.config?.rewardBps).toBe(3_333);
    expect(result.config?.referralBps).toBe(6_567);
    expect(result.warnings).toContainEqual(
      expect.stringMatching(/less than half/i),
    );
  });

  it("treats empty percentage edits as zero", () => {
    const result = evaluateCreatorForm(
      {
        ...defaultCreatorForm,
        rewardPercent: "",
        referralPercent: "   ",
      },
      creator,
    );

    expect(result.errors.rewardPercent).toBeUndefined();
    expect(result.errors.referralPercent).toBeUndefined();
    expect(result.config?.rewardBps).toBe(0);
    expect(result.config?.referralBps).toBe(0);
  });

  it("rejects an invalid split before a config can be signed", () => {
    const result = evaluateCreatorForm(
      {
        ...defaultCreatorForm,
        rewardPercent: "60",
        referralPercent: "40",
      },
      creator,
    );

    expect(result.config).toBeUndefined();
    expect(result.errors.referralPercent).toMatch(/cannot exceed 100/i);
  });

  it("warns about capped open zero-price tiers and gifting exposure", () => {
    const result = evaluateCreatorForm(
      {
        ...defaultCreatorForm,
        priceUsd: "0",
        supplyCap: "25",
        maxPrepaidPeriods: "0",
      },
      creator,
    );

    expect(result.warnings).toEqual([
      expect.stringMatching(/capped zero-price/i),
      expect.stringMatching(/permissionless gifts/i),
      expect.stringMatching(/unlimited prepayment/i),
    ]);
  });

  it("conserves gross in referred and unreferred split previews", () => {
    const split = previewPaymentSplit(10_000_003n, 500, 100);

    expect(
      split.protocol + split.reward + split.referral + split.creatorReferred,
    ).toBe(split.gross);
    expect(split.protocol + split.reward + split.creatorUnreferred).toBe(
      split.gross,
    );
  });
});
