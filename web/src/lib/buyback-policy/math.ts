import { parseDisplayedUnits, tokenMultiplierScale } from "../token-amount";
export type Fraction = { numerator: bigint; denominator: bigint };
export function fraction(numerator: bigint, denominator: bigint): Fraction {
  if (numerator <= 0n || denominator <= 0n)
    throw new Error("Price must be positive");
  let a = numerator,
    b = denominator;
  while (b) {
    const r = a % b;
    a = b;
    b = r;
  }
  return { numerator: numerator / a, denominator: denominator / a };
}
export function exactAmount(
  displayed: string,
  decimals: number,
  multiplier: bigint,
): bigint {
  if (multiplier <= 0n) throw new Error("Invalid display multiplier");
  const n = parseDisplayedUnits(displayed, decimals) * tokenMultiplierScale;
  if (n % multiplier !== 0n)
    throw new Error(
      "Amount is not exactly representable with the token display multiplier",
    );
  const raw = n / multiplier;
  if (raw <= 0n || raw >= 2n ** 128n)
    throw new Error("Amount must be positive and fit uint128");
  return raw;
}
export function dragBps(
  input: bigint,
  output: bigint,
  marginal: Fraction,
): bigint {
  const n = input * marginal.numerator - output * marginal.denominator;
  if (n <= 0n) return 0n;
  return (
    (n * 10000n + input * marginal.numerator - 1n) /
    (input * marginal.numerator)
  );
}
