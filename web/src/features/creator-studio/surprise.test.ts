import { describe, expect, it } from "vitest";

import {
  createDefaultArtConfig,
  validateArtConfig,
} from "@/features/creator-studio/art-config";
import {
  surpriseArtConfig,
  type RandomValuesSource,
} from "@/features/creator-studio/surprise";

function sequenceRandom(values: number[]): RandomValuesSource {
  let cursor = 0;
  return {
    getRandomValues<T extends ArrayBufferView | null>(array: T): T {
      if (!(array instanceof Uint32Array)) {
        throw new Error("The test source only supports Uint32Array.");
      }
      for (let index = 0; index < array.length; index += 1) {
        array[index] = values[cursor % values.length];
        cursor += 1;
      }
      return array;
    },
  };
}

describe("Surprise Me", () => {
  it("rerolls a seed and every compatible unlocked control locally", () => {
    const current = createDefaultArtConfig("loom", 1n);
    const next = surpriseArtConfig(
      current,
      new Set(),
      sequenceRandom([2, 4, 8, 16, 32, 64, 128, 256]),
    );

    expect(next.collectionSeed).not.toBe(current.collectionSeed);
    expect(next.engine).toBe("loom");
    expect(Object.keys(next.engineControls)).toEqual([
      "warp",
      "weft",
      "tension",
    ]);
    expect(validateArtConfig(next).valid).toBe(true);
  });

  it("preserves every locked value", () => {
    const current = createDefaultArtConfig("stack", 77n);
    current.global.palette = 3;
    current.engineControls.offset = 88;

    const next = surpriseArtConfig(
      current,
      new Set(["collectionSeed", "global.palette", "engine.offset"]),
      sequenceRandom([1_000]),
    );

    expect(next.collectionSeed).toBe(77n);
    expect(next.global.palette).toBe(3);
    expect(next.engineControls.offset).toBe(88);
    expect(validateArtConfig(next).valid).toBe(true);
  });

  it("forces a changed unlocked seed even when the random source repeats it", () => {
    const current = createDefaultArtConfig("bloom", 0n);
    const next = surpriseArtConfig(current, new Set(), sequenceRandom([0]));

    expect(next.collectionSeed).toBe(1n);
  });
});
