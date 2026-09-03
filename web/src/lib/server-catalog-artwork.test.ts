import { describe, expect, it, vi } from "vitest";
import { getAddress, type PublicClient } from "viem";

import type { TierArtConfig, TierMediaConfig } from "@/contracts/types";
import { readServerCatalogArtwork } from "@/lib/server-catalog-artwork";

const factory = getAddress("0x1111111111111111111111111111111111111111");
const renderer = getAddress("0x2222222222222222222222222222222222222222");
const harness = getAddress("0x3333333333333333333333333333333333333333");
const tier = getAddress("0x4444444444444444444444444444444444444444");
const art: TierArtConfig = {
  engine: 0,
  collectionSeed: 9n,
  palette: 0,
  intensity: 50,
  density: 50,
  symmetry: 50,
  typographyScale: 50,
  typographyStyle: 0,
  textVisibility: 1,
  imageFit: 0,
  focalX: 50,
  focalY: 50,
  grain: 50,
  mediaMix: 50,
  primary: 50,
  secondary: 50,
  tertiary: 50,
};
const media: TierMediaConfig = {
  mime: 0,
  store: "0x0000000000000000000000000000000000000000",
  length: 0,
  digest: `0x${"00".repeat(32)}`,
  runtimeCodehash: `0x${"00".repeat(32)}`,
};
const deployment = {
  status: "ready" as const,
  chainId: 46_630 as const,
  factoryAddress: factory,
  rendererAddress: renderer,
  previewHarnessAddress: harness,
};

function tokenURI(svg: string) {
  const image = `data:image/svg+xml;base64,${btoa(svg)}`;
  return `data:application/json;base64,${btoa(
    JSON.stringify({
      name: "Genesis Fans #0",
      description: "A collection preview.",
      image,
      external_url: "https://example.com",
      attributes: [],
    }),
  )}`;
}

describe("server catalog artwork", () => {
  it("renders token zero as a stable collection preview", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const readContract = vi.fn().mockResolvedValue(tokenURI(svg));
    const multicall = vi
      .fn()
      .mockResolvedValue([
        true,
        "Genesis Fans",
        "A collection preview.",
        "https://example.com",
        `0x${"ab".repeat(32)}`,
        renderer,
        art,
        media,
      ]);

    const result = await readServerCatalogArtwork(
      {
        getBlockNumber: vi.fn().mockResolvedValue(123n),
        multicall,
        readContract,
      } as unknown as PublicClient,
      deployment,
      tier,
    );

    expect(result.svg).toBe(svg);
    expect(result.capturedBlock).toBe(123n);
    expect(result.revision).toMatch(/^0x[0-9a-f]{64}$/);
    expect(readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: renderer,
        functionName: "previewTokenURI",
        blockNumber: 123n,
        args: [
          expect.objectContaining({
            token: expect.objectContaining({
              tokenId: 0n,
              active: true,
              expiration: (1n << 64n) - 1n,
            }),
          }),
        ],
      }),
    );
  });
});
