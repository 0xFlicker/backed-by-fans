import {
  engineControlDefinitions,
  globalControlDefinitions,
  type ArtEngine,
  type NumericControlDefinition,
  type StudioArtConfig,
  uint128Max,
} from "@/features/creator-studio/art-config";

export type SurpriseLock =
  | "collectionSeed"
  | `global.${keyof typeof globalControlDefinitions}`
  | `engine.${string}`;

export type RandomValuesSource = Pick<Crypto, "getRandomValues">;

function secureRandomSource(): RandomValuesSource {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error(
      "Secure local randomness is unavailable in this browser. Surprise Me cannot run.",
    );
  }
  return globalThis.crypto;
}

function randomUint32(random: RandomValuesSource): number {
  const value = new Uint32Array(1);
  random.getRandomValues(value);
  return value[0];
}

function randomUint128(random: RandomValuesSource): bigint {
  const words = new Uint32Array(4);
  random.getRandomValues(words);
  return (
    (BigInt(words[0]) << 96n) |
    (BigInt(words[1]) << 64n) |
    (BigInt(words[2]) << 32n) |
    BigInt(words[3])
  );
}

function randomStepValue(
  random: RandomValuesSource,
  definition: NumericControlDefinition,
): number {
  const count =
    Math.floor((definition.max - definition.min) / definition.step) + 1;
  const limit = Math.floor(0x1_0000_0000 / count) * count;
  let value = randomUint32(random);
  while (value >= limit) value = randomUint32(random);
  return definition.min + (value % count) * definition.step;
}

function changedSeed(current: bigint, random: RandomValuesSource): bigint {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const candidate = randomUint128(random);
    if (candidate !== current) return candidate;
  }
  return (current ^ 1n) & uint128Max;
}

export function surpriseArtConfig<Engine extends ArtEngine>(
  current: StudioArtConfig<Engine>,
  locks: ReadonlySet<SurpriseLock> = new Set(),
  random: RandomValuesSource = secureRandomSource(),
): StudioArtConfig<Engine> {
  const collectionSeed = locks.has("collectionSeed")
    ? current.collectionSeed
    : changedSeed(current.collectionSeed, random);
  const global = { ...current.global };

  for (const [key, definition] of Object.entries(globalControlDefinitions) as [
    keyof typeof globalControlDefinitions,
    NumericControlDefinition,
  ][]) {
    if (!locks.has(`global.${key}`)) {
      global[key] = randomStepValue(random, definition);
    }
  }

  const definitions = engineControlDefinitions[current.engine] as Record<
    string,
    NumericControlDefinition
  >;
  const engineControls = { ...current.engineControls } as Record<
    string,
    number
  >;
  for (const [key, definition] of Object.entries(definitions)) {
    if (!locks.has(`engine.${key}`)) {
      engineControls[key] = randomStepValue(random, definition);
    }
  }

  return {
    engine: current.engine,
    collectionSeed,
    global,
    engineControls,
  } as StudioArtConfig<Engine>;
}
