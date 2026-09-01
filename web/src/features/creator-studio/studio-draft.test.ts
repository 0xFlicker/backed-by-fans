import { encodeAbiParameters, getAddress, keccak256, stringToHex } from "viem";
import { describe, expect, it, vi } from "vitest";

import { createDefaultArtConfig } from "@/features/creator-studio/art-config";
import {
  maxUnsignedStudioDraftBytes,
  persistUnsignedStudioDraft,
  recoverUnsignedStudioDraft,
  recoverStoredUnsignedStudioDraft,
  removeStoredUnsignedStudioDraft,
  serializeUnsignedStudioDraft,
  studioDraftStorageKey,
  type StudioDraftScope,
  type UnsignedStudioDraft,
} from "@/features/creator-studio/studio-draft";

const address = (digit: string) => getAddress(`0x${digit.repeat(40)}`);
const tierSalt = `0x${"ab".repeat(32)}` as const;
const scope: StudioDraftScope = {
  chainId: 46_630,
  factory: address("1"),
  creator: address("2"),
  renderer: address("3"),
  mediaRegistry: address("4"),
  abiVersion: "onchain-art-v1",
  rendererBoundsVersion: "renderer-v1:92160",
};

function draft(): UnsignedStudioDraft {
  return {
    scope,
    tierSalt,
    art: createDefaultArtConfig("afterimage", 123n),
    media: { mode: "native", confirmedStore: address("5") },
  };
}

describe("unsigned Creator Studio draft recovery", () => {
  it("persists only scoped creative inputs and revalidates a native pointer", async () => {
    const serialized = serializeUnsignedStudioDraft(draft());
    const validateConfirmedStore = vi.fn().mockResolvedValue(true);
    const recovered = await recoverUnsignedStudioDraft(serialized, scope, {
      validateConfirmedStore,
    });

    expect(recovered).toMatchObject({
      status: "ready",
      draft: {
        tierSalt,
        art: { engine: "afterimage", collectionSeed: 123n },
        media: { mode: "native", confirmedStore: address("5") },
      },
    });
    expect(validateConfirmedStore).toHaveBeenCalledWith(
      address("5"),
      scope.mediaRegistry,
    );
    expect(serialized).not.toMatch(
      /imageBytes|candidateBytes|price|receipt|transactionHash|nonce|calldata|pending/i,
    );
  });

  it("preserves the permanent render identity across recovery", async () => {
    const before = draft();
    const recovered = await recoverUnsignedStudioDraft(
      serializeUnsignedStudioDraft(before),
      scope,
      { validateConfirmedStore: () => true },
    );
    expect(recovered.status).toBe("ready");
    if (recovered.status !== "ready") return;

    const deriveIdentity = (salt: `0x${string}`) =>
      keccak256(
        encodeAbiParameters(
          [
            { type: "bytes32" },
            { type: "address" },
            { type: "address" },
            { type: "bytes32" },
          ],
          [
            keccak256(stringToHex("BackedByFans.TierIdentity.v1")),
            scope.factory,
            scope.creator,
            salt,
          ],
        ),
      );

    expect(deriveIdentity(recovered.draft.tierSalt)).toBe(
      deriveIdentity(before.tierSalt),
    );
    expect(recovered.draft.art).toEqual(before.art);
    expect(recovered.draft.media).toEqual(before.media);
  });

  it("refuses to restore an identity that already published a tier", async () => {
    const validateTierSalt = vi.fn().mockResolvedValue(false);
    await expect(
      recoverUnsignedStudioDraft(serializeUnsignedStudioDraft(draft()), scope, {
        validateTierSalt,
        validateConfirmedStore: () => true,
      }),
    ).resolves.toMatchObject({
      status: "rejected",
      code: "tier-salt-used",
    });
    expect(validateTierSalt).toHaveBeenCalledWith(tierSalt);
  });

  it.each([
    ["chainId", 1, "chain-mismatch"],
    ["factory", address("6"), "factory-mismatch"],
    ["creator", address("6"), "creator-mismatch"],
    ["renderer", address("6"), "renderer-mismatch"],
    ["mediaRegistry", address("6"), "media-registry-mismatch"],
    ["abiVersion", "onchain-art-v2", "abi-mismatch"],
    ["rendererBoundsVersion", "renderer-v2:80000", "renderer-bounds-mismatch"],
  ] as const)("rejects a %s scope mismatch", async (key, value, code) => {
    const result = await recoverUnsignedStudioDraft(
      serializeUnsignedStudioDraft(draft()),
      { ...scope, [key]: value },
      { validateConfirmedStore: () => true },
    );
    expect(result).toMatchObject({ status: "rejected", code });
  });

  it("never restores a native pointer without current registry proof", async () => {
    const serialized = serializeUnsignedStudioDraft(draft());
    await expect(
      recoverUnsignedStudioDraft(serialized, scope),
    ).resolves.toMatchObject({
      status: "rejected",
      code: "media-pointer-invalid",
    });
    await expect(
      recoverUnsignedStudioDraft(serialized, scope, {
        validateConfirmedStore: () => false,
      }),
    ).resolves.toMatchObject({
      status: "rejected",
      code: "media-pointer-invalid",
    });
  });

  it("rejects version drift, invalid controls, and prohibited extra fields", async () => {
    const persisted = JSON.parse(serializeUnsignedStudioDraft(draft()));

    const wrongVersion = JSON.stringify({ ...persisted, version: 1 });
    await expect(
      recoverUnsignedStudioDraft(wrongVersion, scope),
    ).resolves.toMatchObject({ status: "rejected", code: "version-mismatch" });

    persisted.creative.art.global.intensity = 101;
    await expect(
      recoverUnsignedStudioDraft(JSON.stringify(persisted), scope),
    ).resolves.toMatchObject({ status: "rejected", code: "malformed" });

    persisted.creative.art.global.intensity = 50;
    persisted.creative.pendingTransaction = { hash: "0x1234" };
    await expect(
      recoverUnsignedStudioDraft(JSON.stringify(persisted), scope),
    ).resolves.toMatchObject({ status: "rejected", code: "malformed" });

    await expect(
      recoverUnsignedStudioDraft(
        "x".repeat(maxUnsignedStudioDraftBytes + 1),
        scope,
      ),
    ).resolves.toMatchObject({ status: "rejected", code: "malformed" });
  });

  it("rejects obsolete remote media drafts without a compatibility path", async () => {
    const persisted = JSON.parse(serializeUnsignedStudioDraft(draft()));
    persisted.creative.media = {
      mode: "https",
      reference: "https://media.example.com/member.png",
    };
    await expect(
      recoverUnsignedStudioDraft(JSON.stringify(persisted), scope),
    ).resolves.toMatchObject({ status: "rejected", code: "malformed" });
  });

  it("scopes storage keys to chain, canonical factory, and creator", () => {
    expect(studioDraftStorageKey(scope)).toBe(
      "backed-by-fans-creative-draft:4:46630:0x1111111111111111111111111111111111111111:0x2222222222222222222222222222222222222222:0x3333333333333333333333333333333333333333",
    );
  });

  it("persists and removes only the versioned unsigned envelope", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const key = persistUnsignedStudioDraft(storage, draft());
    expect(values.get(key)).toBe(serializeUnsignedStudioDraft(draft()));
    await expect(
      recoverStoredUnsignedStudioDraft(storage, scope, {
        validateConfirmedStore: () => true,
      }),
    ).resolves.toMatchObject({ status: "ready" });

    removeStoredUnsignedStudioDraft(storage, scope);
    await expect(
      recoverStoredUnsignedStudioDraft(storage, scope),
    ).resolves.toEqual({ status: "empty" });
  });
});
