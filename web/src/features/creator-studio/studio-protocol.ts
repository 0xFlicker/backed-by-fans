import {
  keccak256,
  zeroAddress,
  zeroHash,
  type ContractFunctionArgs,
  type Hex,
} from "viem";

import { onchainMetadataRendererAbi } from "@/contracts";
import type { TierArtConfig, TierMediaConfig } from "@/contracts/types";
import type { ExactMediaCandidate } from "@/features/creator-studio/image-processing";
import type { MembershipArtState } from "@/features/creator-studio/PreviewGallery";

export type RendererPreviewContext = ContractFunctionArgs<
  typeof onchainMetadataRendererAbi,
  "view",
  "previewSVG"
>[0];

export const emptyMediaConfig: TierMediaConfig = {
  mime: 0,
  store: zeroAddress,
  length: 0,
  digest: zeroHash,
  runtimeCodehash: zeroHash,
};

export function mediaMimeIndex(candidate: ExactMediaCandidate): 1 | 2 {
  return candidate.mime === "image/jpeg" ? 1 : 2;
}

export function nativeCandidateMediaConfig(
  candidate: ExactMediaCandidate,
): TierMediaConfig {
  return {
    mime: mediaMimeIndex(candidate),
    store: zeroAddress,
    length: candidate.byteLength,
    digest: keccak256(candidate.bytes),
    runtimeCodehash: zeroHash,
  };
}

export function makeRendererPreviewContext(input: {
  tierName: string;
  description: string;
  externalURI: string;
  tierIdentity: Hex;
  art: TierArtConfig;
  media: TierMediaConfig;
  nativeMedia?: Hex;
  tokenId: 1 | 7 | 42;
  state: MembershipArtState;
  referenceTimestamp: bigint;
  editingPlaceholders?: boolean;
}): RendererPreviewContext {
  const active = input.state === "active";
  const tierName = input.tierName.trim();
  const description = input.description.trim();
  return {
    token: {
      tierName:
        input.editingPlaceholders && !tierName
          ? "Creator Membership"
          : tierName,
      description:
        input.editingPlaceholders && !description
          ? "Independent creator membership"
          : description,
      externalURI: input.externalURI.trim(),
      tierIdentity: input.tierIdentity,
      art: input.art,
      media: input.media,
      tokenId: BigInt(input.tokenId),
      expiration: active
        ? input.referenceTimestamp + 30n * 86_400n
        : input.referenceTimestamp > 0n
          ? input.referenceTimestamp - 1n
          : 0n,
      active,
    },
    nativeMedia: input.nativeMedia ?? "0x",
  };
}

export function studioPreviewFingerprint(input: {
  tierName: string;
  description: string;
  externalURI: string;
  tierIdentity: Hex;
  art: TierArtConfig;
  media: TierMediaConfig;
}) {
  const fingerprint = {
    tierName: input.tierName,
    description: input.description,
    externalURI: input.externalURI,
    tierIdentity: input.tierIdentity,
    art: input.art,
    media: input.media,
  };
  return JSON.stringify(fingerprint, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
}
