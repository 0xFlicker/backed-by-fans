import { isAddress, zeroAddress, zeroHash, type Address } from "viem";

import type { TierPublicationConfig } from "@/features/protocol/registry-reconciliation";
import type { AcceptedPaymentToken } from "@/lib/payment-token-read";
import { displayedToRaw } from "@/lib/token-amount";

export const protocolFeeBps = 100;
export const bpsDenominator = 10_000;
export const secondsPerDay = 86_400n;
export const uint64Max = (1n << 64n) - 1n;

export type CreatorForm = {
  name: string;
  symbol: string;
  description: string;
  externalURI: string;
  paymentToken: string;
  displayedPrice: string;
  periodDays: string;
  rewardPercent: string;
  referralPercent: string;
  supplyCap: string;
  maxPrepaidPeriods: string;
};

export type TierConfig = TierPublicationConfig;

export type TierCreativeConfig = Pick<
  TierPublicationConfig,
  "tierSalt" | "renderer" | "art" | "media"
>;

export type SplitPreview = {
  gross: bigint;
  protocol: bigint;
  reward: bigint;
  referral: bigint;
  creatorReferred: bigint;
  creatorUnreferred: bigint;
};

export type CreatorFormResult = {
  errors: Partial<Record<keyof CreatorForm, string>>;
  config?: TierConfig;
  split?: SplitPreview;
  warnings: string[];
  creativeError?: string;
};

export const defaultCreatorForm: CreatorForm = {
  name: "",
  symbol: "",
  description: "",
  externalURI: "",
  paymentToken: "",
  displayedPrice: "10",
  periodDays: "30",
  rewardPercent: "5",
  referralPercent: "1",
  supplyCap: "0",
  maxPrepaidPeriods: "12",
};

function byteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

/** Mirrors the renderer's strict UTF-8 and XML 1.0 character admission. */
export function isValidOnchainText(value: string) {
  for (let index = 0; index < value.length;) {
    const codepoint = value.codePointAt(index)!;
    const valid =
      codepoint === 0x09 ||
      codepoint === 0x0a ||
      codepoint === 0x0d ||
      (codepoint >= 0x20 && codepoint <= 0xd7ff) ||
      (codepoint >= 0xe000 && codepoint <= 0xfffd) ||
      (codepoint >= 0x1_0000 && codepoint <= 0x10_ffff);
    if (!valid) return false;
    index += codepoint > 0xffff ? 2 : 1;
  }
  return true;
}

function parseWholeUint64(value: string): bigint | undefined {
  if (!/^\d+$/.test(value.trim())) return undefined;
  const parsed = BigInt(value.trim());
  return parsed <= uint64Max ? parsed : undefined;
}

function parsePercentToBps(value: string): number | undefined {
  const normalized = value.trim();
  if (normalized === "") return 0;

  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return undefined;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const bps = whole * 100 + fraction;
  return Number.isSafeInteger(bps) && bps <= bpsDenominator ? bps : undefined;
}

export function previewPaymentSplit(
  gross: bigint,
  rewardBps: number,
  referralBps: number,
): SplitPreview {
  const protocol = (gross * BigInt(protocolFeeBps)) / 10_000n;
  const reward = (gross * BigInt(rewardBps)) / 10_000n;
  const referral = (gross * BigInt(referralBps)) / 10_000n;

  return {
    gross,
    protocol,
    reward,
    referral,
    creatorReferred: gross - protocol - reward - referral,
    creatorUnreferred: gross - protocol - reward,
  };
}

export function evaluateCreatorForm(
  form: CreatorForm,
  creator?: Address,
  creative?: TierCreativeConfig,
  paymentToken?: AcceptedPaymentToken,
): CreatorFormResult {
  const errors: CreatorFormResult["errors"] = {};
  const name = form.name.trim();
  const symbol = form.symbol.trim();
  const description = form.description.trim();
  const externalURI = form.externalURI.trim();

  if (!name) {
    errors.name = "Enter a membership name.";
  } else if (byteLength(name) > 100) {
    errors.name = "Shorten the membership name.";
  } else if (!isValidOnchainText(name)) {
    errors.name = "Remove unsupported characters.";
  }
  if (!symbol) {
    errors.symbol = "Enter a symbol.";
  } else if (byteLength(symbol) > 16) {
    errors.symbol = "Shorten the symbol.";
  } else if (!isValidOnchainText(symbol)) {
    errors.symbol = "Remove unsupported characters.";
  }
  if (byteLength(description) > 500) {
    errors.description = "Shorten the description.";
  } else if (!isValidOnchainText(description)) {
    errors.description = "Remove unsupported characters.";
  }
  if (byteLength(externalURI) > 2_048) {
    errors.externalURI = "Shorten the website address.";
  } else if (!isValidOnchainText(externalURI)) {
    errors.externalURI = "Remove unsupported characters.";
  }

  let pricePerPeriod: bigint | undefined;
  const selectedPaymentToken = form.paymentToken.trim();
  if (
    !paymentToken ||
    !isAddress(selectedPaymentToken) ||
    paymentToken.address.toLowerCase() !== selectedPaymentToken.toLowerCase()
  ) {
    errors.paymentToken = "Choose an available payment token.";
  } else if (!paymentToken.enabled) {
    errors.paymentToken =
      "This payment token is not available for new memberships.";
  } else {
    try {
      pricePerPeriod = displayedToRaw({
        displayed: form.displayedPrice,
        decimals: paymentToken.decimals,
        multiplier: paymentToken.uiMultiplier,
      });
    } catch (error) {
      errors.displayedPrice =
        error instanceof Error
          ? error.message
          : "Enter a valid payment amount.";
    }
  }

  const periodDays = parseWholeUint64(form.periodDays);
  const periodDuration = periodDays && periodDays * secondsPerDay;
  if (!periodDuration || periodDuration > uint64Max) {
    errors.periodDays = "Enter a whole number of days greater than 0.";
  }

  const rewardBps = parsePercentToBps(form.rewardPercent);
  if (rewardBps === undefined) {
    errors.rewardPercent =
      "Use a percentage from 0 to 100 with up to 2 decimals.";
  }
  const referralBps = parsePercentToBps(form.referralPercent);
  if (referralBps === undefined) {
    errors.referralPercent =
      "Use a percentage from 0 to 100 with up to 2 decimals.";
  }
  if (
    rewardBps !== undefined &&
    referralBps !== undefined &&
    rewardBps + referralBps + protocolFeeBps > bpsDenominator
  ) {
    errors.referralPercent =
      "Rewards, referrals, and the 1% platform fee cannot exceed 100%.";
  }

  const supplyCap = parseWholeUint64(form.supplyCap);
  if (supplyCap === undefined) {
    errors.supplyCap = "Enter a whole number of 0 or more.";
  }
  const maxPrepaidPeriods = parseWholeUint64(form.maxPrepaidPeriods);
  if (maxPrepaidPeriods === undefined) {
    errors.maxPrepaidPeriods = "Enter a whole number of 0 or more.";
  }

  const split =
    pricePerPeriod !== undefined &&
    rewardBps !== undefined &&
    referralBps !== undefined &&
    rewardBps + referralBps + protocolFeeBps <= bpsDenominator
      ? previewPaymentSplit(pricePerPeriod, rewardBps, referralBps)
      : undefined;
  const warnings: string[] = [];
  if (split && split.creatorReferred * 2n < split.gross) {
    warnings.push("A referred payment gives you less than half of the total.");
  }
  if (pricePerPeriod === 0n && supplyCap && supplyCap > 0n) {
    warnings.push("A free membership can fill every available place.");
  }
  if (supplyCap && supplyCap > 0n) {
    warnings.push("Gifts can hold capacity until the membership expires.");
  }
  if (maxPrepaidPeriods === 0n) {
    warnings.push(
      "Unlimited prepayment lets a gift hold membership time indefinitely.",
    );
  }

  const creativeError =
    creative &&
    (/^0x[0-9a-fA-F]{64}$/.test(creative.tierSalt) === false ||
      creative.tierSalt.toLowerCase() === zeroHash)
      ? "Return to Art Studio and create a new direction."
      : creative &&
          (!isAddress(creative.renderer) ||
            creative.renderer.toLowerCase() === zeroAddress)
        ? "Choose an artwork collection before publishing."
        : undefined;

  if (
    !creator ||
    !creative ||
    !paymentToken ||
    creativeError ||
    Object.keys(errors).length > 0 ||
    pricePerPeriod === undefined ||
    !periodDuration ||
    rewardBps === undefined ||
    referralBps === undefined ||
    supplyCap === undefined ||
    maxPrepaidPeriods === undefined
  ) {
    return { errors, split, warnings, creativeError };
  }

  return {
    errors,
    split,
    warnings,
    config: {
      creator,
      tierSalt: creative.tierSalt,
      renderer: creative.renderer,
      paymentToken: paymentToken.address,
      name,
      symbol,
      pricePerPeriod,
      periodDuration,
      rewardBps,
      referralBps,
      supplyCap,
      maxPrepaidPeriods,
      metadata: { description, externalURI },
      art: creative.art,
      media: creative.media,
    },
  };
}
