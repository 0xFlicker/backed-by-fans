import { describe, expect, it } from "vitest";

import {
  artEngineNames,
  createDefaultArtConfig,
  defaultEngineControls,
  engineControlDefinitions,
  switchCompositionEngine,
  toContractArtConfig,
  undoEngineSwitch,
  validateArtConfig,
  type AnyStudioArtConfig,
} from "@/features/creator-studio/art-config";

describe("Creator Studio art configuration", () => {
  it("defines bounded controls for all six engines", () => {
    expect(Object.keys(engineControlDefinitions)).toEqual(artEngineNames);

    for (const engine of artEngineNames) {
      const config = createDefaultArtConfig(engine, 42n);
      expect(validateArtConfig(config).valid).toBe(true);
      for (const definition of Object.values(
        engineControlDefinitions[engine],
      )) {
        expect(definition.min).toBeLessThan(definition.max);
        expect(definition.dependency).toEqual({ kind: "engine", engine });
      }
    }
  });

  it("maps semantic engine controls into the bounded contract slots", () => {
    const config = createDefaultArtConfig("chorus", 10n);
    config.engineControls = { voices: 12, radius: 10 };

    expect(toContractArtConfig(config)).toMatchObject({
      engine: 1,
      collectionSeed: 10n,
      primary: 100,
      secondary: 0,
      tertiary: 50,
    });
  });

  it("rejects out-of-range and incompatible hidden engine controls", () => {
    const outOfRange = createDefaultArtConfig("loom", 1n);
    outOfRange.engineControls.warp = 21;
    expect(validateArtConfig(outOfRange)).toMatchObject({ valid: false });

    const stale = {
      ...createDefaultArtConfig("bloom", 1n),
      engineControls: { offset: 50, compression: 50 },
    };
    expect(validateArtConfig(stale as never)).toMatchObject({ valid: false });

    const unsupported = { ...createDefaultArtConfig(), engine: "unknown" };
    expect(validateArtConfig(unsupported as never)).toMatchObject({
      valid: false,
      errors: ["Choose a supported art engine."],
    });
  });

  it("switches only incompatible engine controls and can undo in session", () => {
    const media = { mode: "native", confirmedStore: "0x1234" } as const;
    const original = {
      art: createDefaultArtConfig("stack", 99n),
      media,
    };
    original.art.global.palette = 4;

    const switched = switchCompositionEngine(original, "loom");
    expect(switched.composition.art).toMatchObject({
      engine: "loom",
      collectionSeed: 99n,
      global: { palette: 4 },
      engineControls: defaultEngineControls("loom", 99n),
    });
    expect(switched.composition.media).toBe(media);
    expect(switched.composition.art.engineControls).not.toHaveProperty(
      "offset",
    );

    const restored = undoEngineSwitch(switched.composition, switched.undo);
    expect(restored).toEqual(original);
    expect(restored.media).toBe(media);
  });

  it("preserves later global and media edits when undoing an engine switch", () => {
    const original = {
      art: createDefaultArtConfig("stack", 99n),
      media: { mode: "none" as const },
    };
    const switched = switchCompositionEngine(original, "loom");
    const edited = {
      art: {
        ...switched.composition.art,
        global: { ...switched.composition.art.global, grain: 91 },
      } as AnyStudioArtConfig,
      media: {
        mode: "native" as const,
        confirmedStore: "0x1234",
      },
    };
    const restored = undoEngineSwitch(edited, switched.undo);

    expect(restored.art.engine).toBe("stack");
    expect(restored.art.global.grain).toBe(91);
    expect(restored.media).toEqual(edited.media);
  });

  it("refuses stale undo data after a later engine change", () => {
    const first = switchCompositionEngine(
      { art: createDefaultArtConfig("stack", 1n), media: null },
      "chorus",
    );
    const second = switchCompositionEngine(first.composition, "bloom");

    expect(() => undoEngineSwitch(second.composition, first.undo)).toThrow(
      /no longer the current composition/i,
    );
  });
});
