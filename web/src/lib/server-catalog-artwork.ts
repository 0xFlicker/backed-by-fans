import {
  bytesToHex,
  getAddress,
  keccak256,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

import {
  membershipFactoryAbi,
  membershipTierAbi,
  onchainMetadataRendererAbi,
} from "@/contracts";
import type { TierArtConfig, TierMediaConfig } from "@/contracts/types";
import { decodeRendererTokenURI } from "@/features/creator-studio/renderer-preview";
import { isTierArtConfig, isTierMediaConfig } from "@/lib/authenticity";
import type { ReadyDeployment } from "@/lib/config";
import { multicall3Address } from "@/lib/direct-read";
import { tierArtworkRevision } from "@/lib/tier-artwork-revision";

const collectionPreviewTokenId = 0n;
const collectionPreviewExpiration = (1n << 64n) - 1n;

export type CatalogArtwork = {
  svg: string;
  etag: string;
  revision: Hex;
  capturedBlock: bigint;
  name: string;
  symbol: string;
  description: string;
};

export async function readServerCatalogArtwork(
  client: PublicClient,
  deployment: ReadyDeployment,
  tier: Address,
): Promise<CatalogArtwork> {
  const capturedBlock = await client.getBlockNumber({ cacheTime: 0 });
  const values = await client.multicall({
    allowFailure: false,
    blockNumber: capturedBlock,
    multicallAddress: multicall3Address,
    contracts: [
      {
        address: deployment.factoryAddress,
        abi: membershipFactoryAbi,
        functionName: "isRegisteredTier",
        args: [tier],
      },
      { address: tier, abi: membershipTierAbi, functionName: "name" },
      { address: tier, abi: membershipTierAbi, functionName: "symbol" },
      { address: tier, abi: membershipTierAbi, functionName: "description" },
      { address: tier, abi: membershipTierAbi, functionName: "externalURI" },
      { address: tier, abi: membershipTierAbi, functionName: "tierIdentity" },
      { address: tier, abi: membershipTierAbi, functionName: "renderer" },
      { address: tier, abi: membershipTierAbi, functionName: "artConfig" },
      { address: tier, abi: membershipTierAbi, functionName: "mediaConfig" },
    ],
  });

  const [
    registered,
    name,
    symbol,
    description,
    externalURI,
    tierIdentity,
    rendererValue,
    artValue,
    mediaValue,
  ] = values;
  if (!registered) throw new Error("The membership is not factory registered.");
  if (
    typeof name !== "string" ||
    typeof symbol !== "string" ||
    typeof description !== "string" ||
    typeof externalURI !== "string" ||
    typeof tierIdentity !== "string" ||
    typeof rendererValue !== "string" ||
    !isTierArtConfig(artValue) ||
    !isTierMediaConfig(mediaValue)
  ) {
    throw new Error("The membership artwork configuration is incomplete.");
  }

  const renderer = getAddress(rendererValue);
  const art = artValue as TierArtConfig;
  const media = mediaValue as TierMediaConfig;
  const revision = tierArtworkRevision({
    name,
    description,
    externalURI,
    renderer,
    art,
    media,
  });
  const tokenURI = await client.readContract({
    address: renderer,
    abi: onchainMetadataRendererAbi,
    functionName: "previewTokenURI",
    args: [
      {
        token: {
          tierName: name,
          description,
          externalURI,
          tierIdentity: tierIdentity as Hex,
          art,
          media,
          tokenId: collectionPreviewTokenId,
          expiration: collectionPreviewExpiration,
          active: true,
        },
        nativeMedia: "0x",
      },
    ],
    blockNumber: capturedBlock,
  });
  const decoded = decodeRendererTokenURI(tokenURI);

  return {
    svg: decoded.svg,
    etag: `"${keccak256(bytesToHex(decoded.svgBytes))}"`,
    revision,
    capturedBlock,
    name,
    symbol,
    description,
  };
}
