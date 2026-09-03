import { keccak256, stringToHex, type Address, type Hex } from "viem";

import type { CatalogTierSummary } from "@/contracts/types";

export function tierArtworkRevision(input: {
  name: string;
  description: string;
  externalURI: string;
  renderer: Address;
  art: CatalogTierSummary["art"];
  media: CatalogTierSummary["media"];
}): Hex {
  const { art, media } = input;
  const values = [
    input.name,
    input.description,
    input.externalURI,
    input.renderer.toLowerCase(),
    art.engine,
    art.collectionSeed,
    art.palette,
    art.intensity,
    art.density,
    art.symmetry,
    art.typographyScale,
    art.typographyStyle,
    art.textVisibility,
    art.imageFit,
    art.focalX,
    art.focalY,
    art.grain,
    art.mediaMix,
    art.primary,
    art.secondary,
    art.tertiary,
    media.mime,
    media.store.toLowerCase(),
    media.length,
    media.digest,
    media.runtimeCodehash,
  ];
  return keccak256(stringToHex(values.map(String).join("\u001f")));
}
