import { getAddress, parseUnits, zeroAddress, zeroHash } from "viem";
import { describe, expect, it } from "vitest";

import {
  defaultCreatorForm,
  evaluateCreatorForm,
  isValidOnchainText,
  previewPaymentSplit,
} from "@/features/creator/config";
import {
  createDefaultArtConfig,
  toContractArtConfig,
} from "@/features/creator-studio/art-config";

const creator = getAddress("0x1111111111111111111111111111111111111111");
const validCreatorForm = {
  ...defaultCreatorForm,
  name: "Creator membership",
  symbol: "FANS",
};
const creative = {
  tierSalt:
    "0x0000000000000000000000000000000000000000000000000000000000000001" as const,
  rendererVersion: 1,
  art: toContractArtConfig(createDefaultArtConfig()),
  media: {
    mime: 0,
    store: zeroAddress,
    length: 0,
    digest: zeroHash,
    runtimeCodehash: zeroHash,
  },
};

describe("creator tier configuration", () => {
  it("keeps identity examples out of the submitted default form", () => {
    expect(defaultCreatorForm.name).toBe("");
    expect(defaultCreatorForm.symbol).toBe("");
  });

  it("produces the confirmed default economic terms with an identity", () => {
    const result = evaluateCreatorForm(validCreatorForm, creator, creative);

    expect(result.errors).toEqual({});
    expect(result.config).toMatchObject({
      creator,
      pricePerPeriod: parseUnits("10", 6),
      periodDuration: 30n * 86_400n,
      rewardBps: 500,
      referralBps: 100,
      supplyCap: 0n,
      maxPrepaidPeriods: 12n,
      tierSalt: creative.tierSalt,
      rendererVersion: 1,
      art: creative.art,
      media: creative.media,
    });
  });

  it("accepts arbitrary valid basis-point percentages", () => {
    const result = evaluateCreatorForm(
      {
        ...validCreatorForm,
        rewardPercent: "33.33",
        referralPercent: "65.67",
      },
      creator,
      creative,
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
        ...validCreatorForm,
        rewardPercent: "",
        referralPercent: "   ",
      },
      creator,
      creative,
    );

    expect(result.errors.rewardPercent).toBeUndefined();
    expect(result.errors.referralPercent).toBeUndefined();
    expect(result.config?.rewardBps).toBe(0);
    expect(result.config?.referralBps).toBe(0);
  });

  it("rejects an invalid split before a config can be signed", () => {
    const result = evaluateCreatorForm(
      {
        ...validCreatorForm,
        rewardPercent: "60",
        referralPercent: "40",
      },
      creator,
      creative,
    );

    expect(result.config).toBeUndefined();
    expect(result.errors.referralPercent).toMatch(/cannot exceed 100/i);
  });

  it("warns about capped open zero-price tiers and gifting exposure", () => {
    const result = evaluateCreatorForm(
      {
        ...validCreatorForm,
        priceUsd: "0",
        supplyCap: "25",
        maxPrepaidPeriods: "0",
      },
      creator,
      creative,
    );

    expect(result.warnings).toEqual([
      expect.stringMatching(/free membership/i),
      expect.stringMatching(/gifts can hold capacity/i),
      expect.stringMatching(/unlimited prepayment/i),
    ]);
  });

  it("requires a non-zero permanent tier identity and creative configuration", () => {
    expect(
      evaluateCreatorForm(validCreatorForm, creator).config,
    ).toBeUndefined();
    const result = evaluateCreatorForm(validCreatorForm, creator, {
      ...creative,
      tierSalt: zeroHash,
    });

    expect(result.config).toBeUndefined();
    expect(result.creativeError).toMatch(/create a new direction/i);
  });

  it("requires an enabled renderer version to be selected", () => {
    const result = evaluateCreatorForm(validCreatorForm, creator, {
      ...creative,
      rendererVersion: 0,
    });

    expect(result.config).toBeUndefined();
    expect(result.creativeError).toMatch(/artwork collection/i);
  });

  it("matches the renderer's XML-safe text boundary before simulation", () => {
    expect(isValidOnchainText("Encore ✦\nMembers")).toBe(true);
    expect(isValidOnchainText("bad\u0000text")).toBe(false);
    expect(isValidOnchainText("unpaired \ud800 surrogate")).toBe(false);

    const result = evaluateCreatorForm(
      { ...validCreatorForm, description: "bad\u0001text" },
      creator,
      creative,
    );
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
