import type { TierArtConfig } from "@/contracts/types";

export const artEngineNames = [
  "stack",
  "chorus",
  "loom",
  "bloom",
  "marquee",
  "afterimage",
] as const;

export const canonicalArtEngineManifestNames = [
  "STACK",
  "CHORUS",
  "LOOM",
  "BLOOM",
  "MARQUEE",
  "AFTERIMAGE",
] as const;

export type ArtEngine = (typeof artEngineNames)[number];

export const artEngineIndex = {
  stack: 0,
  chorus: 1,
  loom: 2,
  bloom: 3,
  marquee: 4,
  afterimage: 5,
} as const satisfies Record<ArtEngine, number>;

export type ImageFit = "cover" | "contain" | "tile";

export const imageFitIndex = {
  cover: 0,
  contain: 1,
  tile: 2,
} as const satisfies Record<ImageFit, number>;

export type GlobalArtControls = {
  palette: number;
  intensity: number;
  density: number;
  symmetry: number;
  typographyScale: number;
  typographyStyle: number;
  textVisibility: number;
  imageFit: ImageFit;
  focalX: number;
  focalY: number;
  grain: number;
  mediaMix: number;
};

export type EngineControlMap = {
  stack: { offset: number; compression: number };
  chorus: { voices: number; radius: number };
  loom: { warp: number; weft: number; tension: number };
  bloom: { petals: number; phase: number };
  marquee: { panels: number; slant: number };
  afterimage: { echoes: number; drift: number };
};

export type StudioArtConfig<Engine extends ArtEngine = ArtEngine> = {
  engine: Engine;
  collectionSeed: bigint;
  global: GlobalArtControls;
  engineControls: EngineControlMap[Engine];
};

export type AnyStudioArtConfig = {
  [Engine in ArtEngine]: StudioArtConfig<Engine>;
}[ArtEngine];

export type NumericControlDefinition = {
  label: string;
  min: number;
  max: number;
  step: number;
  dependency:
    | { kind: "always" }
    | { kind: "media" }
    | { kind: "engine"; engine: ArtEngine };
};

export const globalControlDefinitions = {
  palette: {
    label: "Palette",
    min: 0,
    max: 4,
    step: 1,
    dependency: { kind: "always" },
  },
  intensity: {
    label: "Intensity",
    min: 0,
    max: 100,
    step: 1,
    dependency: { kind: "always" },
  },
  density: {
    label: "Density",
    min: 0,
    max: 100,
    step: 1,
    dependency: { kind: "always" },
  },
  symmetry: {
    label: "Symmetry",
    min: 0,
    max: 100,
    step: 1,
    dependency: { kind: "always" },
  },
  typographyScale: {
    label: "Type scale",
    min: 0,
    max: 100,
    step: 1,
    dependency: { kind: "always" },
  },
  typographyStyle: {
    label: "Type treatment",
    min: 0,
    max: 3,
    step: 1,
    dependency: { kind: "always" },
  },
  textVisibility: {
    label: "Show tier text",
    min: 0,
    max: 1,
    step: 1,
    dependency: { kind: "always" },
  },
  focalX: {
    label: "Horizontal focal point",
    min: 0,
    max: 100,
    step: 1,
    dependency: { kind: "media" },
  },
  focalY: {
    label: "Vertical focal point",
    min: 0,
    max: 100,
    step: 1,
    dependency: { kind: "media" },
  },
  grain: {
    label: "Grain",
    min: 0,
    max: 100,
    step: 1,
    dependency: { kind: "always" },
  },
  mediaMix: {
    label: "Media mix",
    min: 0,
    max: 100,
    step: 1,
    dependency: { kind: "media" },
  },
} as const satisfies Record<
  Exclude<keyof GlobalArtControls, "imageFit">,
  NumericControlDefinition
>;

export const imageFitDefinition = {
  label: "Image fit",
  options: imageFitIndex,
  dependency: { kind: "media" },
} as const;

export const engineControlDefinitions = {
  stack: {
    offset: {
      label: "Offset",
      min: 0,
      max: 100,
      step: 1,
      dependency: { kind: "engine", engine: "stack" },
    },
    compression: {
      label: "Compression",
      min: 0,
      max: 100,
      step: 1,
      dependency: { kind: "engine", engine: "stack" },
    },
  },
  chorus: {
    voices: {
      label: "Voices",
      min: 3,
      max: 12,
      step: 1,
      dependency: { kind: "engine", engine: "chorus" },
    },
    radius: {
      label: "Radius",
      min: 10,
      max: 90,
      step: 1,
      dependency: { kind: "engine", engine: "chorus" },
    },
  },
  loom: {
    warp: {
      label: "Warp",
      min: 2,
      max: 20,
      step: 1,
      dependency: { kind: "engine", engine: "loom" },
    },
    weft: {
      label: "Weft",
      min: 2,
      max: 20,
      step: 1,
      dependency: { kind: "engine", engine: "loom" },
    },
    tension: {
      label: "Tension",
      min: 0,
      max: 100,
      step: 1,
      dependency: { kind: "engine", engine: "loom" },
    },
  },
  bloom: {
    petals: {
      label: "Petals",
      min: 4,
      max: 24,
      step: 1,
      dependency: { kind: "engine", engine: "bloom" },
    },
    phase: {
      label: "Phase",
      min: 0,
      max: 100,
      step: 1,
      dependency: { kind: "engine", engine: "bloom" },
    },
  },
  marquee: {
    panels: {
      label: "Panels",
      min: 2,
      max: 12,
      step: 1,
      dependency: { kind: "engine", engine: "marquee" },
    },
    slant: {
      label: "Slant",
      min: 0,
      max: 100,
      step: 1,
      dependency: { kind: "engine", engine: "marquee" },
    },
  },
  afterimage: {
    echoes: {
      label: "Echoes",
      min: 2,
      max: 16,
      step: 1,
      dependency: { kind: "engine", engine: "afterimage" },
    },
    drift: {
      label: "Drift",
      min: 0,
      max: 100,
      step: 1,
      dependency: { kind: "engine", engine: "afterimage" },
    },
  },
} as const satisfies {
  [Engine in ArtEngine]: {
    [Control in keyof EngineControlMap[Engine]]: NumericControlDefinition;
  };
};

export const uint128Max = (1n << 128n) - 1n;

export type ContractArtConfig = TierArtConfig;

export type ArtConfigValidation =
  { valid: true } | { valid: false; errors: string[] };

const defaultGlobalControls: GlobalArtControls = {
  palette: 0,
  intensity: 72,
  density: 58,
  symmetry: 42,
  typographyScale: 60,
  typographyStyle: 0,
  textVisibility: 1,
  imageFit: "cover",
  focalX: 50,
  focalY: 50,
  grain: 38,
  mediaMix: 58,
};

function seededUnit(seed: bigint, lane: number): number {
  let value = BigInt.asUintN(
    64,
    seed ^ (BigInt(lane + 1) * 0x9e3779b97f4a7c15n),
  );
  value ^= value >> 30n;
  value = BigInt.asUintN(64, value * 0xbf58476d1ce4e5b9n);
  value ^= value >> 27n;
  value = BigInt.asUintN(64, value * 0x94d049bb133111ebn);
  value ^= value >> 31n;
  return Number(value & 0xffff_ffffn) / 0x1_0000_0000;
}

function seededControlValue(
  definition: NumericControlDefinition,
  seed: bigint,
  lane: number,
): number {
  const steps = Math.floor((definition.max - definition.min) / definition.step);
  return (
    definition.min +
    Math.floor(seededUnit(seed, lane) * (steps + 1)) * definition.step
  );
}

export function defaultEngineControls<Engine extends ArtEngine>(
  engine: Engine,
  seed: bigint,
): EngineControlMap[Engine] {
  const definitions = engineControlDefinitions[engine] as Record<
    string,
    NumericControlDefinition
  >;
  return Object.fromEntries(
    Object.entries(definitions).map(([key, definition], lane) => [
      key,
      seededControlValue(definition, seed, lane + artEngineIndex[engine] * 8),
    ]),
  ) as EngineControlMap[Engine];
}

export function createDefaultArtConfig(): StudioArtConfig<"stack">;
export function createDefaultArtConfig<Engine extends ArtEngine>(
  engine: Engine,
  collectionSeed?: bigint,
): StudioArtConfig<Engine>;
export function createDefaultArtConfig<Engine extends ArtEngine>(
  engine: Engine = "stack" as Engine,
  collectionSeed = 1n,
): StudioArtConfig<Engine> {
  return {
    engine,
    collectionSeed,
    global: { ...defaultGlobalControls },
    engineControls: defaultEngineControls(engine, collectionSeed),
  };
}

function isStepValue(value: number, definition: NumericControlDefinition) {
  return (
    Number.isSafeInteger(value) &&
    value >= definition.min &&
    value <= definition.max &&
    (value - definition.min) % definition.step === 0
  );
}

export function validateArtConfig(
  config: StudioArtConfig,
): ArtConfigValidation {
  const errors: string[] = [];
  if (!artEngineNames.includes(config.engine)) {
    errors.push("Choose a supported art engine.");
  }
  if (config.collectionSeed < 0n || config.collectionSeed > uint128Max) {
    errors.push("The collection seed must fit in uint128.");
  }

  for (const [key, definition] of Object.entries(globalControlDefinitions) as [
    keyof typeof globalControlDefinitions,
    NumericControlDefinition,
  ][]) {
    if (!isStepValue(config.global[key], definition)) {
      errors.push(
        `${definition.label} must be between ${definition.min} and ${definition.max}.`,
      );
    }
  }
  if (!(config.global.imageFit in imageFitIndex)) {
    errors.push("Choose a supported image fit.");
  }

  const definitions = engineControlDefinitions[config.engine as ArtEngine] as
    Record<string, NumericControlDefinition> | undefined;
  const controls = config.engineControls as Record<string, number>;
  if (!definitions) {
    return { valid: false, errors };
  }
  const expectedKeys = Object.keys(definitions);
  const actualKeys = Object.keys(controls);
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key) => !(key in definitions))
  ) {
    errors.push("Engine controls do not match the selected engine.");
  } else {
    for (const [key, definition] of Object.entries(definitions)) {
      if (!isStepValue(controls[key], definition)) {
        errors.push(
          `${definition.label} must be between ${definition.min} and ${definition.max}.`,
        );
      }
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

function percentageFor(
  value: number,
  definition: NumericControlDefinition,
): number {
  if (definition.max === definition.min) return 0;
  return Math.round(
    ((value - definition.min) * 100) / (definition.max - definition.min),
  );
}

function contractEngineSlots(config: StudioArtConfig) {
  const definitions = engineControlDefinitions[config.engine] as Record<
    string,
    NumericControlDefinition
  >;
  const controls = config.engineControls as Record<string, number>;
  const values = Object.keys(definitions).map((key) =>
    percentageFor(controls[key], definitions[key]),
  );
  return {
    primary: values[0] ?? 50,
    secondary: values[1] ?? 50,
    tertiary: values[2] ?? 50,
  };
}

export function toContractArtConfig(
  config: StudioArtConfig,
): ContractArtConfig {
  const validation = validateArtConfig(config);
  if (!validation.valid) {
    throw new Error(validation.errors.join(" "));
  }
  return {
    engine: artEngineIndex[config.engine],
    collectionSeed: config.collectionSeed,
    palette: config.global.palette,
    intensity: config.global.intensity,
    density: config.global.density,
    symmetry: config.global.symmetry,
    typographyScale: config.global.typographyScale,
    typographyStyle: config.global.typographyStyle,
    textVisibility: config.global.textVisibility,
    imageFit: imageFitIndex[config.global.imageFit],
    focalX: config.global.focalX,
    focalY: config.global.focalY,
    grain: config.global.grain,
    mediaMix: config.global.mediaMix,
    ...contractEngineSlots(config),
  };
}

export type EngineSwitchUndo = {
  previousEngine: ArtEngine;
  previousEngineControls: Record<string, number>;
  expectedEngine: ArtEngine;
};

export type ArtComposition<Media> = {
  art: AnyStudioArtConfig;
  media: Media;
};

function cloneArtConfig(config: AnyStudioArtConfig): AnyStudioArtConfig {
  return {
    ...config,
    global: { ...config.global },
    engineControls: { ...config.engineControls },
  } as AnyStudioArtConfig;
}

export function switchCompositionEngine<Media>(
  composition: ArtComposition<Media>,
  engine: ArtEngine,
): {
  composition: ArtComposition<Media>;
  undo: EngineSwitchUndo;
} {
  const previous = cloneArtConfig(composition.art);
  const art = {
    engine,
    collectionSeed: composition.art.collectionSeed,
    global: { ...composition.art.global },
    engineControls: defaultEngineControls(
      engine,
      composition.art.collectionSeed,
    ),
  } as AnyStudioArtConfig;
  return {
    composition: { art, media: composition.media },
    undo: {
      previousEngine: previous.engine,
      previousEngineControls: { ...previous.engineControls },
      expectedEngine: engine,
    },
  };
}

export function undoEngineSwitch<Media>(
  composition: ArtComposition<Media>,
  undo: EngineSwitchUndo,
): ArtComposition<Media> {
  if (composition.art.engine !== undo.expectedEngine) {
    throw new Error("This engine change is no longer the current composition.");
  }
  return {
    art: {
      ...composition.art,
      engine: undo.previousEngine,
      global: { ...composition.art.global },
      engineControls: { ...undo.previousEngineControls },
    } as AnyStudioArtConfig,
    media: composition.media,
  };
}
