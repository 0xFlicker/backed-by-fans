import { parseUnits, zeroHash, type Address } from "viem";

import type { TierPublicationConfig } from "@/features/protocol/registry-reconciliation";

export const protocolFeeBps = 100;
export const bpsDenominator = 10_000;
export const secondsPerDay = 86_400n;
export const uint64Max = (1n << 64n) - 1n;

export type CreatorForm = {
  name: string;
  symbol: string;
  description: string;
  externalURI: string;
  priceUsd: string;
  periodDays: string;
  rewardPercent: string;
  referralPercent: string;
  supplyCap: string;
  maxPrepaidPeriods: string;
};

export type TierConfig = TierPublicationConfig;

export type TierCreativeConfig = Pick<
  TierPublicationConfig,
  "tierSalt" | "rendererVersion" | "art" | "media"
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
  priceUsd: "10",
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
): CreatorFormResult {
  const errors: CreatorFormResult["errors"] = {};
  const name = form.name.trim();
  const symbol = form.symbol.trim();
  const description = form.description.trim();
  const externalURI = form.externalURI.trim();

  if (!name || byteLength(name) > 100) {
    errors.name = "Use a name between 1 and 100 UTF-8 bytes.";
  } else if (!isValidOnchainText(name)) {
    errors.name = "Remove unsupported control or text characters.";
  }
  if (!symbol || byteLength(symbol) > 16) {
    errors.symbol = "Use a symbol between 1 and 16 UTF-8 bytes.";
  } else if (!isValidOnchainText(symbol)) {
    errors.symbol = "Remove unsupported control or text characters.";
  }
  if (byteLength(description) > 500) {
    errors.description = "Keep the description within 500 UTF-8 bytes.";
  } else if (!isValidOnchainText(description)) {
    errors.description = "Remove unsupported control or text characters.";
  }
  if (byteLength(externalURI) > 2_048) {
    errors.externalURI = "Keep the website URI within 2,048 UTF-8 bytes.";
  } else if (!isValidOnchainText(externalURI)) {
    errors.externalURI = "Remove unsupported control or text characters.";
  }

  let pricePerPeriod: bigint | undefined;
  try {
    pricePerPeriod = parseUnits(form.priceUsd.trim(), 6);
    if (pricePerPeriod < 0n) pricePerPeriod = undefined;
  } catch {
    pricePerPeriod = undefined;
  }
  if (pricePerPeriod === undefined) {
    errors.priceUsd = "Enter a non-negative USDG amount with up to 6 decimals.";
  }

  const periodDays = parseWholeUint64(form.periodDays);
  const periodDuration = periodDays && periodDays * secondsPerDay;
  if (!periodDuration || periodDuration > uint64Max) {
    errors.periodDays = "Enter a positive whole-day period within uint64.";
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
      "Rewards, referrals, and the fixed 1% protocol fee cannot exceed 100%.";
  }

  const supplyCap = parseWholeUint64(form.supplyCap);
  if (supplyCap === undefined) {
    errors.supplyCap = "Enter a non-negative whole-number capacity.";
  }
  const maxPrepaidPeriods = parseWholeUint64(form.maxPrepaidPeriods);
  if (maxPrepaidPeriods === undefined) {
    errors.maxPrepaidPeriods =
      "Enter a non-negative whole-number prepayment limit.";
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
    warnings.push(
      "A referred payment leaves the creator with less than half of gross support.",
    );
  }
  if (pricePerPeriod === 0n && supplyCap && supplyCap > 0n) {
    warnings.push(
      "A capped zero-price tier is open to self-joins that can fill every available place.",
    );
  }
  if (supplyCap && supplyCap > 0n) {
    warnings.push(
      "Permissionless gifts can hold capped capacity until membership time expires and the slot is synchronized.",
    );
  }
  if (maxPrepaidPeriods === 0n) {
    warnings.push(
      "Unlimited prepayment lets a gift hold membership time without a configured period ceiling.",
    );
  }

  const creativeError =
    creative &&
    (/^0x[0-9a-fA-F]{64}$/.test(creative.tierSalt) === false ||
      creative.tierSalt.toLowerCase() === zeroHash)
      ? "Refresh the Art Studio to create a valid permanent tier identity."
      : creative &&
          (!Number.isInteger(creative.rendererVersion) ||
            creative.rendererVersion < 1 ||
            creative.rendererVersion > 0xffff_ffff)
        ? "Choose an enabled artwork renderer before publishing."
        : undefined;

  if (
    !creator ||
    !creative ||
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
      rendererVersion: creative.rendererVersion,
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
