import { getAddress, parseUnits, zeroAddress, zeroHash } from "viem";
import { describe, expect, it } from "vitest";

import {
  defaultCreatorForm,
  evaluateCreatorForm,
  isValidOnchainText,
  previewPaymentSplit,
  type CreatorForm,
  type TierCreativeConfig,
} from "@/features/creator/config";
import {
  createDefaultArtConfig,
  toContractArtConfig,
} from "@/features/creator-studio/art-config";
import type { AcceptedPaymentToken } from "@/lib/payment-token-read";
import { tokenMultiplierScale } from "@/lib/token-amount";

const creator = getAddress("0x1111111111111111111111111111111111111111");
const renderer = getAddress("0x2222222222222222222222222222222222222222");
const paymentTokenAddress = getAddress(
  "0x3333333333333333333333333333333333333333",
);
const paymentToken: AcceptedPaymentToken = {
  chainId: 46630,
  factory: creator,
  address: paymentTokenAddress,
  registryIndex: 0,
  listed: true,
  enabled: true,
  name: "Global Dollar",
  symbol: "USDG",
  decimals: 6,
  scaledUI: false,
  uiMultiplier: tokenMultiplierScale,
  newUIMultiplier: tokenMultiplierScale,
  effectiveAt: 0n,
  readBlock: 1n,
};
const validCreatorForm: CreatorForm = {
  ...defaultCreatorForm,
  name: "Creator membership",
  symbol: "FANS",
  paymentToken: paymentTokenAddress,
};
const creative: TierCreativeConfig = {
  tierSalt:
    "0x0000000000000000000000000000000000000000000000000000000000000001" as const,
  renderer,
  art: toContractArtConfig(createDefaultArtConfig()),
  media: {
    mime: 0,
    store: zeroAddress,
    length: 0,
    digest: zeroHash,
    runtimeCodehash: zeroHash,
  },
};

function evaluate(
  form: CreatorForm = validCreatorForm,
  creativeInput: typeof creative | undefined = creative,
  token: AcceptedPaymentToken | undefined = paymentToken,
) {
  return evaluateCreatorForm(form, creator, creativeInput, token);
}

describe("creator tier configuration", () => {
  it("keeps identity examples out of the submitted default form", () => {
    expect(defaultCreatorForm.name).toBe("");
    expect(defaultCreatorForm.symbol).toBe("");
  });

  it("produces immutable token and raw terms from the displayed amount", () => {
    const result = evaluate();

    expect(result.errors).toEqual({});
    expect(result.config).toMatchObject({
      creator,
      paymentToken: paymentTokenAddress,
      pricePerPeriod: parseUnits("10", 6),
      periodDuration: 30n * 86_400n,
      rewardBps: 500,
      referralBps: 100,
      supplyCap: 0n,
      maxPrepaidPeriods: 12n,
      tierSalt: creative.tierSalt,
      renderer,
      art: creative.art,
      media: creative.media,
    });
  });

  it("uses the selected token multiplier and nearest raw unit", () => {
    const scaled = {
      ...paymentToken,
      decimals: 18,
      scaledUI: true,
      uiMultiplier: 3n * tokenMultiplierScale,
    };
    const result = evaluate(
      { ...validCreatorForm, displayedPrice: "0.05" },
      creative,
      scaled,
    );
    expect(result.config?.pricePerPeriod).toBe(16_666_666_666_666_667n);
  });

  it("rejects a disabled or mismatched payment token", () => {
    expect(
      evaluateCreatorForm(validCreatorForm, creator, creative, undefined)
        .config,
    ).toBeUndefined();
    const disabled = { ...paymentToken, enabled: false };
    const result = evaluate(validCreatorForm, creative, disabled);
    expect(result.config).toBeUndefined();
    expect(result.errors.paymentToken).toMatch(/not available/i);
  });

  it("accepts arbitrary valid basis-point percentages", () => {
    const result = evaluate({
      ...validCreatorForm,
      rewardPercent: "33.33",
      referralPercent: "65.67",
    });

    expect(result.config?.rewardBps).toBe(3_333);
    expect(result.config?.referralBps).toBe(6_567);
    expect(result.warnings).toContainEqual(
      expect.stringMatching(/less than half/i),
    );
  });

  it("treats empty percentage edits as zero", () => {
    const result = evaluate({
      ...validCreatorForm,
      rewardPercent: "",
      referralPercent: "   ",
    });

    expect(result.errors.rewardPercent).toBeUndefined();
    expect(result.errors.referralPercent).toBeUndefined();
    expect(result.config?.rewardBps).toBe(0);
    expect(result.config?.referralBps).toBe(0);
  });

  it("rejects an invalid split before a config can be signed", () => {
    const result = evaluate({
      ...validCreatorForm,
      rewardPercent: "60",
      referralPercent: "40",
    });

    expect(result.config).toBeUndefined();
    expect(result.errors.referralPercent).toMatch(/cannot exceed 100/i);
  });

  it("warns about capped open zero-price tiers and gifting exposure", () => {
    const result = evaluate({
      ...validCreatorForm,
      displayedPrice: "0",
      supplyCap: "25",
      maxPrepaidPeriods: "0",
    });

    expect(result.warnings).toEqual([
      expect.stringMatching(/free membership/i),
      expect.stringMatching(/gifts can hold capacity/i),
      expect.stringMatching(/unlimited prepayment/i),
    ]);
  });

  it("requires a non-zero permanent tier identity and creative configuration", () => {
    expect(
      evaluateCreatorForm(validCreatorForm, creator, undefined, paymentToken)
        .config,
    ).toBeUndefined();
    const result = evaluate(validCreatorForm, {
      ...creative,
      tierSalt: zeroHash,
    });

    expect(result.config).toBeUndefined();
    expect(result.creativeError).toMatch(/create a new direction/i);
  });

  it("requires a non-zero direct renderer address", () => {
    const result = evaluate(validCreatorForm, {
      ...creative,
      renderer: zeroAddress,
    });

    expect(result.config).toBeUndefined();
    expect(result.creativeError).toMatch(/artwork collection/i);
  });

  it("matches the renderer's XML-safe text boundary before simulation", () => {
    expect(isValidOnchainText("Encore ✦\nMembers")).toBe(true);
    expect(isValidOnchainText("bad\u0000text")).toBe(false);
    expect(isValidOnchainText("unpaired \ud800 surrogate")).toBe(false);

    const result = evaluate({
      ...validCreatorForm,
      description: "bad\u0001text",
    });
    expect(result.config).toBeUndefined();
    expect(result.errors.description).toMatch(/unsupported/i);
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
