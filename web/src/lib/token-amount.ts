const multiplierScale = 10n ** 18n;

export const tokenMultiplierScale = multiplierScale;

export type TokenAmount = {
  raw: bigint;
  decimals: number;
  multiplier: bigint;
  uiUnits: bigint;
  formatted: string;
  symbol: string;
};

export type ScheduledDisplayAdjustment = {
  currentMultiplier: bigint;
  futureMultiplier: bigint;
  effectiveAt: Date;
  currentFormatted: string;
  futureFormatted: string;
};

function assertDecimals(decimals: number) {
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new RangeError(
      "Token decimals must be an integer from 0 through 255.",
    );
  }
}

function assertNonNegative(value: bigint, label: string) {
  if (value < 0n) throw new RangeError(`${label} cannot be negative.`);
}

function assertMultiplier(multiplier: bigint) {
  if (multiplier <= 0n) {
    throw new RangeError("The token UI multiplier must be positive.");
  }
}

export function parseDisplayedUnits(input: string, decimals: number): bigint {
  assertDecimals(decimals);
  const value = input.trim();
  const match = /^\+?(?:(\d+)(?:\.(\d*))?|\.(\d+))$/.exec(value);
  if (!match) {
    throw new TypeError(
      "Enter a positive decimal amount without exponent notation.",
    );
  }

  const whole = match[1] ?? "0";
  const fraction = match[2] ?? match[3] ?? "";
  if (fraction.length > decimals) {
    throw new RangeError(
      `This token supports at most ${decimals} fractional digits.`,
    );
  }

  const base = 10n ** BigInt(decimals);
  const paddedFraction = fraction.padEnd(decimals, "0");
  return BigInt(whole) * base + BigInt(paddedFraction || "0");
}

export function displayedToRaw(input: {
  displayed: string;
  decimals: number;
  multiplier: bigint;
}): bigint {
  assertMultiplier(input.multiplier);
  const uiUnits = parseDisplayedUnits(input.displayed, input.decimals);
  return (uiUnits * multiplierScale + input.multiplier / 2n) / input.multiplier;
}

export function rawToDisplayedUnits(raw: bigint, multiplier: bigint): bigint {
  assertNonNegative(raw, "Raw token amount");
  assertMultiplier(multiplier);
  return (raw * multiplier) / multiplierScale;
}

function roundedMeaningfulFraction(
  numerator: bigint,
  denominator: bigint,
): string {
  let integer = numerator / denominator;
  let remainder = numerator % denominator;
  if (remainder === 0n) return integer.toString();

  const digits: number[] = [];
  let meaningfulDigits = 0;
  const maximumDigits = 276;

  while (remainder !== 0n && meaningfulDigits < 4) {
    remainder *= 10n;
    const digit = Number(remainder / denominator);
    remainder %= denominator;
    digits.push(digit);
    if (digit !== 0 || meaningfulDigits > 0) meaningfulDigits += 1;
    if (digits.length > maximumDigits) {
      throw new RangeError("Token amount exceeds supported display precision.");
    }
  }

  const firstMeaningful = digits.findIndex((digit) => digit !== 0);
  if (firstMeaningful === -1) return integer.toString();
  const retainedEnd = Math.min(firstMeaningful + 3, digits.length);
  const retained = digits.slice(0, retainedEnd);
  const roundingDigit = digits[retainedEnd] ?? 0;

  if (roundingDigit >= 5) {
    let cursor = retained.length - 1;
    while (cursor >= 0 && retained[cursor] === 9) {
      retained[cursor] = 0;
      cursor -= 1;
    }
    if (cursor >= 0) {
      retained[cursor] += 1;
    } else {
      integer += 1n;
    }
  }

  while (retained.at(-1) === 0) retained.pop();
  return retained.length === 0
    ? integer.toString()
    : `${integer}.${retained.join("")}`;
}

export function formatRawTokenAmount(input: {
  raw: bigint;
  decimals: number;
  multiplier: bigint;
}): string {
  assertDecimals(input.decimals);
  assertNonNegative(input.raw, "Raw token amount");
  assertMultiplier(input.multiplier);
  const denominator = multiplierScale * 10n ** BigInt(input.decimals);
  return roundedMeaningfulFraction(input.raw * input.multiplier, denominator);
}

export function tokenAmount(input: {
  raw: bigint;
  decimals: number;
  multiplier: bigint;
  symbol: string;
}): TokenAmount {
  return {
    ...input,
    uiUnits: rawToDisplayedUnits(input.raw, input.multiplier),
    formatted: formatRawTokenAmount(input),
  };
}

export function scheduledDisplayAdjustment(input: {
  raw: bigint;
  decimals: number;
  currentMultiplier: bigint;
  futureMultiplier: bigint;
  effectiveAt: Date;
  referenceTime?: Date;
}): ScheduledDisplayAdjustment | undefined {
  if (
    input.futureMultiplier === input.currentMultiplier ||
    input.effectiveAt.getTime() <=
      (input.referenceTime?.getTime() ?? Date.now())
  ) {
    return undefined;
  }
  return {
    currentMultiplier: input.currentMultiplier,
    futureMultiplier: input.futureMultiplier,
    effectiveAt: input.effectiveAt,
    currentFormatted: formatRawTokenAmount({
      raw: input.raw,
      decimals: input.decimals,
      multiplier: input.currentMultiplier,
    }),
    futureFormatted: formatRawTokenAmount({
      raw: input.raw,
      decimals: input.decimals,
      multiplier: input.futureMultiplier,
    }),
  };
}
