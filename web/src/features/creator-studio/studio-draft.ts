import { getAddress, isAddress, type Address, type Hex } from "viem";

import {
  artEngineNames,
  type AnyStudioArtConfig,
  type ArtEngine,
  type GlobalArtControls,
  type StudioArtConfig,
  uint128Max,
  validateArtConfig,
} from "@/features/creator-studio/art-config";
import { isNonZeroAddress, isSameAddress } from "@/lib/address";

export const studioDraftVersion = 3;
export const studioDraftKind = "backed-by-fans-creative-draft";
export const maxUnsignedStudioDraftBytes = 16 * 1024;
export const studioDraftAbiVersion = "onchain-art-image-only-2026-08-30";
export const studioDraftRendererBoundsVersion =
  "renderer-registry-native-media-92160-2026-08-30";

export type StudioDraftScope = {
  chainId: number;
  factory: Address;
  creator: Address;
  rendererVersion: number;
  renderer: Address;
  mediaRegistry: Address;
  abiVersion: string;
  rendererBoundsVersion: string;
};

export type StudioMediaDraft =
  { mode: "none" } | { mode: "native"; confirmedStore: Address | null };

export type UnsignedStudioDraft = {
  scope: StudioDraftScope;
  tierSalt: Hex;
  art: AnyStudioArtConfig;
  media: StudioMediaDraft;
};

type PersistedArtConfig = Omit<StudioArtConfig, "collectionSeed"> & {
  collectionSeed: string;
};

type PersistedStudioDraft = {
  kind: typeof studioDraftKind;
  version: typeof studioDraftVersion;
  scope: StudioDraftScope;
  creative: {
    tierSalt: Hex;
    art: PersistedArtConfig;
    media: StudioMediaDraft;
  };
};

export type StudioDraftRecovery =
  | { status: "ready"; draft: UnsignedStudioDraft }
  | {
      status: "rejected";
      code:
        | "malformed"
        | "version-mismatch"
        | "chain-mismatch"
        | "factory-mismatch"
        | "creator-mismatch"
        | "renderer-mismatch"
        | "media-registry-mismatch"
        | "abi-mismatch"
        | "renderer-bounds-mismatch"
        | "tier-salt-used"
        | "media-pointer-invalid";
      message: string;
    };

export type StudioDraftRecoveryOptions = {
  validateTierSalt?: (tierSalt: Hex) => boolean | Promise<boolean>;
  validateConfirmedStore?: (
    store: Address,
    mediaRegistry: Address,
  ) => boolean | Promise<boolean>;
};

export type StudioDraftStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

export type StoredStudioDraftRecovery =
  StudioDraftRecovery | { status: "empty" };

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(record: JsonRecord, keys: readonly string[]) {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function validScope(value: unknown): value is StudioDraftScope {
  if (!isRecord(value)) return false;
  if (
    !hasExactKeys(value, [
      "chainId",
      "factory",
      "creator",
      "rendererVersion",
      "renderer",
      "mediaRegistry",
      "abiVersion",
      "rendererBoundsVersion",
    ])
  ) {
    return false;
  }
  return (
    Number.isSafeInteger(value.chainId) &&
    Number(value.chainId) > 0 &&
    typeof value.factory === "string" &&
    isAddress(value.factory) &&
    typeof value.creator === "string" &&
    isAddress(value.creator) &&
    Number.isInteger(value.rendererVersion) &&
    Number(value.rendererVersion) >= 1 &&
    Number(value.rendererVersion) <= 0xffff_ffff &&
    typeof value.renderer === "string" &&
    isAddress(value.renderer) &&
    typeof value.mediaRegistry === "string" &&
    isAddress(value.mediaRegistry) &&
    typeof value.abiVersion === "string" &&
    value.abiVersion.length > 0 &&
    value.abiVersion.length <= 100 &&
    typeof value.rendererBoundsVersion === "string" &&
    value.rendererBoundsVersion.length > 0 &&
    value.rendererBoundsVersion.length <= 100
  );
}

function parseArt(value: unknown): AnyStudioArtConfig | undefined {
  if (!isRecord(value)) return undefined;
  if (
    !hasExactKeys(value, [
      "engine",
      "collectionSeed",
      "global",
      "engineControls",
    ]) ||
    typeof value.engine !== "string" ||
    !artEngineNames.includes(value.engine as ArtEngine) ||
    typeof value.collectionSeed !== "string" ||
    !/^0x[0-9a-f]{32}$/.test(value.collectionSeed) ||
    !isRecord(value.global) ||
    !hasExactKeys(value.global, [
      "palette",
      "intensity",
      "density",
      "symmetry",
      "typographyScale",
      "typographyStyle",
      "textVisibility",
      "imageFit",
      "focalX",
      "focalY",
      "grain",
      "mediaMix",
    ]) ||
    !isRecord(value.engineControls)
  ) {
    return undefined;
  }

  const global = value.global as GlobalArtControls;
  const config = {
    engine: value.engine,
    collectionSeed: BigInt(value.collectionSeed),
    global,
    engineControls: value.engineControls,
  } as AnyStudioArtConfig;
  if (config.collectionSeed > uint128Max) return undefined;
  return validateArtConfig(config).valid ? config : undefined;
}

function parseMedia(value: unknown): StudioMediaDraft | undefined {
  if (!isRecord(value) || typeof value.mode !== "string") return undefined;
  if (value.mode === "none" && hasExactKeys(value, ["mode"])) {
    return { mode: "none" };
  }
  if (
    value.mode === "native" &&
    hasExactKeys(value, ["mode", "confirmedStore"]) &&
    (value.confirmedStore === null ||
      (typeof value.confirmedStore === "string" &&
        isNonZeroAddress(value.confirmedStore)))
  ) {
    return {
      mode: "native",
      confirmedStore:
        value.confirmedStore === null ? null : getAddress(value.confirmedStore),
    };
  }
  return undefined;
}

function validTierSalt(value: unknown): value is Hex {
  return (
    typeof value === "string" &&
    /^0x[0-9a-fA-F]{64}$/.test(value) &&
    !/^0x0{64}$/.test(value)
  );
}

function parseEnvelope(serialized: string): UnsignedStudioDraft | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;
  if (!hasExactKeys(parsed, ["kind", "version", "scope", "creative"])) {
    return undefined;
  }
  if (
    parsed.kind !== studioDraftKind ||
    parsed.version !== studioDraftVersion
  ) {
    return undefined;
  }
  if (!validScope(parsed.scope) || !isRecord(parsed.creative)) return undefined;
  if (!hasExactKeys(parsed.creative, ["tierSalt", "art", "media"])) {
    return undefined;
  }
  if (!validTierSalt(parsed.creative.tierSalt)) return undefined;
  const art = parseArt(parsed.creative.art);
  const media = parseMedia(parsed.creative.media);
  if (!art || !media) return undefined;
  return {
    scope: {
      ...parsed.scope,
      factory: getAddress(parsed.scope.factory),
      creator: getAddress(parsed.scope.creator),
      renderer: getAddress(parsed.scope.renderer),
      mediaRegistry: getAddress(parsed.scope.mediaRegistry),
    },
    tierSalt: parsed.creative.tierSalt,
    art,
    media,
  };
}

function rejected(
  code: Extract<StudioDraftRecovery, { status: "rejected" }>["code"],
  message: string,
): StudioDraftRecovery {
  return { status: "rejected", code, message };
}

function scopeMismatch(
  stored: StudioDraftScope,
  current: StudioDraftScope,
): StudioDraftRecovery | undefined {
  if (stored.chainId !== current.chainId) {
    return rejected("chain-mismatch", "The draft belongs to another chain.");
  }
  if (!isSameAddress(stored.factory, current.factory)) {
    return rejected(
      "factory-mismatch",
      "The draft belongs to another canonical membership factory.",
    );
  }
  if (!isSameAddress(stored.creator, current.creator)) {
    return rejected(
      "creator-mismatch",
      "Reconnect the creator account that owns this draft.",
    );
  }
  if (stored.rendererVersion !== current.rendererVersion) {
    return rejected(
      "renderer-mismatch",
      "The artwork renderer changed; review a fresh composition.",
    );
  }
  if (!isSameAddress(stored.renderer, current.renderer)) {
    return rejected(
      "renderer-mismatch",
      "The renderer generation changed; review a fresh composition.",
    );
  }
  if (!isSameAddress(stored.mediaRegistry, current.mediaRegistry)) {
    return rejected(
      "media-registry-mismatch",
      "The onchain media registry changed; select media again.",
    );
  }
  if (stored.abiVersion !== current.abiVersion) {
    return rejected(
      "abi-mismatch",
      "The Creator Studio contract interface changed; review a fresh draft.",
    );
  }
  if (stored.rendererBoundsVersion !== current.rendererBoundsVersion) {
    return rejected(
      "renderer-bounds-mismatch",
      "The renderer control or media bounds changed; review a fresh draft.",
    );
  }
  return undefined;
}

function encodeSeed(seed: bigint) {
  if (seed < 0n || seed > uint128Max) {
    throw new Error("The collection seed must fit in uint128.");
  }
  return `0x${seed.toString(16).padStart(32, "0")}`;
}

export function serializeUnsignedStudioDraft(
  draft: UnsignedStudioDraft,
): string {
  if (!validScope(draft.scope)) throw new Error("The draft scope is invalid.");
  const artValidation = validateArtConfig(draft.art);
  if (!artValidation.valid) throw new Error(artValidation.errors.join(" "));
  const media = parseMedia(draft.media);
  if (!media) throw new Error("The media draft is invalid.");
  if (!validTierSalt(draft.tierSalt)) {
    throw new Error("The permanent collection identity is invalid.");
  }

  const persisted: PersistedStudioDraft = {
    kind: studioDraftKind,
    version: studioDraftVersion,
    scope: {
      ...draft.scope,
      factory: getAddress(draft.scope.factory),
      creator: getAddress(draft.scope.creator),
      renderer: getAddress(draft.scope.renderer),
      mediaRegistry: getAddress(draft.scope.mediaRegistry),
    },
    creative: {
      tierSalt: draft.tierSalt,
      art: {
        ...draft.art,
        collectionSeed: encodeSeed(draft.art.collectionSeed),
      },
      media,
    },
  };
  const serialized = JSON.stringify(persisted);
  if (
    new TextEncoder().encode(serialized).length > maxUnsignedStudioDraftBytes
  ) {
    throw new Error("The unsigned creative draft exceeds its storage limit.");
  }
  return serialized;
}

export async function recoverUnsignedStudioDraft(
  serialized: string,
  currentScope: StudioDraftScope,
  options: StudioDraftRecoveryOptions = {},
): Promise<StudioDraftRecovery> {
  if (
    new TextEncoder().encode(serialized).length > maxUnsignedStudioDraftBytes
  ) {
    return rejected(
      "malformed",
      "The saved creative draft exceeds its storage limit.",
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(serialized);
  } catch {
    return rejected("malformed", "The saved creative draft is not valid JSON.");
  }
  if (
    isRecord(raw) &&
    (raw.kind !== studioDraftKind || raw.version !== studioDraftVersion)
  ) {
    return rejected(
      "version-mismatch",
      "The saved creative draft uses another Studio version.",
    );
  }

  const draft = parseEnvelope(serialized);
  if (!draft) {
    return rejected(
      "malformed",
      "The saved creative draft contains invalid or prohibited fields.",
    );
  }
  if (!validScope(currentScope)) {
    return rejected(
      "malformed",
      "The current Creator Studio scope is invalid.",
    );
  }
  const mismatch = scopeMismatch(draft.scope, currentScope);
  if (mismatch) return mismatch;

  if (options.validateTierSalt) {
    const available = await options.validateTierSalt(draft.tierSalt);
    if (!available) {
      return rejected(
        "tier-salt-used",
        "This saved collection identity has already published a membership. Start a fresh Studio direction.",
      );
    }
  }

  if (draft.media.mode === "native" && draft.media.confirmedStore) {
    if (!options.validateConfirmedStore) {
      return rejected(
        "media-pointer-invalid",
        "Revalidate the confirmed media store before restoring this draft.",
      );
    }
    const confirmed = await options.validateConfirmedStore(
      draft.media.confirmedStore,
      currentScope.mediaRegistry,
    );
    if (!confirmed) {
      return rejected(
        "media-pointer-invalid",
        "The confirmed media store is not registered for this creator.",
      );
    }
  }
  return { status: "ready", draft };
}

export function studioDraftStorageKey(scope: StudioDraftScope) {
  if (!validScope(scope)) throw new Error("The draft scope is invalid.");
  return [
    studioDraftKind,
    studioDraftVersion,
    scope.chainId,
    scope.factory.toLowerCase(),
    scope.creator.toLowerCase(),
    scope.rendererVersion,
  ].join(":");
}

export function persistUnsignedStudioDraft(
  storage: StudioDraftStorage,
  draft: UnsignedStudioDraft,
) {
  const key = studioDraftStorageKey(draft.scope);
  storage.setItem(key, serializeUnsignedStudioDraft(draft));
  return key;
}

export async function recoverStoredUnsignedStudioDraft(
  storage: StudioDraftStorage,
  currentScope: StudioDraftScope,
  options: StudioDraftRecoveryOptions = {},
): Promise<StoredStudioDraftRecovery> {
  const serialized = storage.getItem(studioDraftStorageKey(currentScope));
  if (serialized === null) return { status: "empty" };
  return recoverUnsignedStudioDraft(serialized, currentScope, options);
}

export function removeStoredUnsignedStudioDraft(
  storage: StudioDraftStorage,
  scope: StudioDraftScope,
) {
  storage.removeItem(studioDraftStorageKey(scope));
}
