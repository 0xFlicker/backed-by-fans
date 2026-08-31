import { zeroAddress, zeroHash } from "viem";
import { describe, expect, it } from "vitest";

import {
  createDefaultArtConfig,
  toContractArtConfig,
} from "@/features/creator-studio/art-config";
import type { ExactMediaCandidate } from "@/features/creator-studio/image-processing";
import {
  emptyMediaConfig,
  makeRendererPreviewContext,
  nativeCandidateMediaConfig,
  studioPreviewFingerprint,
} from "@/features/creator-studio/studio-protocol";

const tierIdentity =
  "0x1111111111111111111111111111111111111111111111111111111111111111" as const;

function candidate(): ExactMediaCandidate {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
  return {
    mime: "image/jpeg",
    dimension: 768,
    quality: 0.84,
    byteLength: bytes.byteLength,
    bytes,
    previewBytes: bytes,
    rendererCallBytes: bytes,
    gasEstimateBytes: bytes,
    writeBytes: bytes,
    objectURL: "blob:test",
    dispose() {},
  };
}

describe("Creator Studio protocol values", () => {
  it("constructs exact pre-store native media without inventing a pointer", () => {
    expect(nativeCandidateMediaConfig(candidate())).toEqual({
      mime: 1,
      store: zeroAddress,
      length: 4,
      digest:
        "0xc3717c8a8b8965d7fce0f489a38634604b02830f3a74d00dc7c7f6b6246ac3d8",
      runtimeCodehash: zeroHash,
    });
  });

  it("constructs generated-only media with no onchain image residue", () => {
    expect(emptyMediaConfig).toEqual({
      mime: 0,
      store: zeroAddress,
      length: 0,
      digest: zeroHash,
      runtimeCodehash: zeroHash,
    });
  });

  it("keeps geometry inputs stable while active state changes", () => {
    const common = {
      tierName: "Creator Backers",
      description: "Independent creator membership",
      externalURI: "https://example.com",
      tierIdentity,
      art: toContractArtConfig(createDefaultArtConfig()),
      media: emptyMediaConfig,
      tokenId: 7 as const,
      referenceTimestamp: 1_000_000n,
    };
    const active = makeRendererPreviewContext({ ...common, state: "active" });
    const afterglow = makeRendererPreviewContext({
      ...common,
      state: "afterglow",
    });

    expect(active.token.active).toBe(true);
    expect(afterglow.token.active).toBe(false);
    expect(active.token.tierIdentity).toBe(afterglow.token.tierIdentity);
    expect(active.token.art).toEqual(afterglow.token.art);
  });

  it("preserves an allowed empty description in canonical review previews", () => {
    const common = {
      tierName: "Creator Backers",
      description: "",
      externalURI: "",
      tierIdentity,
      art: toContractArtConfig(createDefaultArtConfig()),
      media: emptyMediaConfig,
      tokenId: 7 as const,
      state: "active" as const,
      referenceTimestamp: 1_000_000n,
    };
    const canonical = makeRendererPreviewContext(common);
    const editing = makeRendererPreviewContext({
      ...common,
      editingPlaceholders: true,
    });

    expect(canonical.token.description).toBe("");
    expect(editing.token.description).toBe("Independent creator membership");
  });

  it("fingerprints BigInt art values without including native payload bytes", () => {
    const runtimeDraft = {
      tierName: "Creator Backers",
      description: "Membership",
      externalURI: "",
      tierIdentity,
      art: toContractArtConfig(createDefaultArtConfig()),
      media: emptyMediaConfig,
      nativeMedia: `0x${"ab".repeat(90_000)}`,
    };
    const fingerprint = studioPreviewFingerprint(runtimeDraft);

    expect(fingerprint).toContain('"collectionSeed":"1"');
    expect(fingerprint).not.toContain("abababab");
    expect(fingerprint.length).toBeLessThan(2_000);
  });
});
