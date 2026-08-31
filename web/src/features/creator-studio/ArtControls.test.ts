import { describe, expect, it } from "vitest";

import { normalizeNumericControlValue } from "@/features/creator-studio/ArtControls";

describe("art control numeric admission", () => {
  it("clamps typed values to the published control bounds", () => {
    const definition = { min: 3, max: 12, step: 1 };
    expect(normalizeNumericControlValue(999, definition)).toBe(12);
    expect(normalizeNumericControlValue(-5, definition)).toBe(3);
    expect(normalizeNumericControlValue(Number.NaN, definition)).toBe(3);
  });

  it("snaps decimal controls without floating point residue", () => {
    const definition = { min: 0.55, max: 0.95, step: 0.01 };
    expect(normalizeNumericControlValue(0.844, definition)).toBe(0.84);
    expect(normalizeNumericControlValue(1, definition)).toBe(0.95);
  });
});
