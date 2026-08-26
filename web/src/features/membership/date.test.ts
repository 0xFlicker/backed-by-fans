import { describe, expect, it } from "vitest";

import { formatMembershipDate } from "@/features/membership/date";

describe("formatMembershipDate", () => {
  it("formats ordinary Unix timestamps", () => {
    expect(formatMembershipDate(1_700_000_000n)).not.toContain("outside");
  });

  it("does not throw for a valid uint64 timestamp beyond JavaScript Date", () => {
    expect(formatMembershipDate((1n << 64n) - 1n)).toBe(
      "Unix timestamp 18446744073709551615 (outside calendar display range)",
    );
  });
});
