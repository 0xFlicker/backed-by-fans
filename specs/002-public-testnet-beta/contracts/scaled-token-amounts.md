# Contract: Scaled Token Amounts

This is the shared browser-domain contract for token reads, conversion, and display. It does not add
scaled arithmetic to the membership protocol.

## Capability detection

For each factory-listed token:

1. Read ERC-20 `name()`, `symbol()`, and `decimals()`.
2. Query ERC-165 support for ERC-8056 core `0xa60bf13d`.
3. If core is supported, require pending-multiplier interface `0x4bd27648` and read:
   - `uiMultiplier()`;
   - `newUIMultiplier()`;
   - `effectiveAt()`.
4. Reject a zero multiplier as invalid presentation state.
5. Do not require optional conversion (`0x57854fc3`) or UI-balance (`0xd890fd71`) interfaces.

An ordinary ERC-20 uses an effective multiplier of `1e18`.

## Creator input contract

Input is a non-negative decimal string in current displayed-token units.

```text
uiUnits = parseDecimal(input, decimals)
rawNumerator = uiUnits * 1e18
raw = floor((rawNumerator + floor(multiplier / 2)) / multiplier)
```

- Parsing rejects signs other than an optional leading `+`, exponent notation, non-digits, and more
  fractional digits than the token supports.
- Nearest-integer rounding is used because raw units cannot represent a fraction.
- Values that round to zero are allowed only where the underlying tier rules already allow a zero
  price; the UI must make that result visible in final review.
- The final publication review recomputes from a refreshed current multiplier and shows the resulting
  raw amount in technical detail.
- The transaction contains only `raw`; displayed text is never submitted as protocol state.

## Display contract

For a raw non-negative integer:

```text
scaledNumerator = raw * multiplier
uiUnits = floor(scaledNumerator / 1e18)
```

Formatting then:

1. places the decimal point using token `decimals`;
2. preserves any leading zeros in the fractional part;
3. retains at most three subsequent meaningful fractional digits;
4. uses the next digit for normal half-up rounding;
5. carries rounding into the integer part when needed;
6. trims trailing fractional zeros and the decimal separator when empty;
7. appends the token symbol outside the numeric string.

If correct rounding requires the remainder from `scaledNumerator / 1e18`, the implementation retains
that rational information instead of double-rounding through a truncated intermediate string.

## Required examples

| Input/value                                 | Expected result                                      |
| ------------------------------------------- | ---------------------------------------------------- |
| `0.049999999`                               | `0.05`                                               |
| `0.000123456`                               | `0.000123`                                           |
| `12.3456`                                   | `12.346`                                             |
| `10.000000`                                 | `10`                                                 |
| `99.9996`                                   | `100`                                                |
| six-decimal unscaled `10.123456`            | `10.123`                                             |
| raw amount displayed at `1e18`, then `2e18` | second display is exactly 2x before product rounding |

Tests also cover zero, one raw unit, maximum supported decimals, multipliers below and above `1e18`,
scheduled-but-not-effective multipliers, and values whose nearest-raw conversion carries.

## Scheduled multiplier contract

- `uiMultiplier()` is always the value used for current display and writes.
- When `effectiveAt` is in the future and `newUIMultiplier` differs, the UI may show “scheduled” with
  the future illustrative display.
- The future value never changes current raw approval, transfer, or tier state.
- After the effective block/time, a new direct read supplies the token's new current multiplier.

## Failure behavior

- A failed metadata, ERC-165, or required multiplier read identifies the affected token.
- New-tier publication cannot proceed with an unreadable selected token.
- Existing-tier payment controls for that token show a retryable error; unrelated navigation and
  controls remain available.
- No timeout is invented at this layer. RPC errors and successful slow reads follow the established
  query and wagmi/viem lifecycle.
- No value defaults to USDG, six decimals, multiplier `1`, or cached offchain metadata after a failed
  required read.

## Surface coverage

The same amount functions and token model must be used for:

- creator price entry and review;
- catalog cards and tier details;
- join, renew, prepay, gift, and optional contribution;
- balances, allowances, shortfalls, and wallet prompts;
- cancel/refund previews and top-ups;
- supporter rewards and referrals;
- creator proceeds and claims;
- protocol fee balances and withdrawals;
- account discovery and tier management.
