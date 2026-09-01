import {
  decodeFunctionData,
  encodeFunctionResult,
  getAddress,
  keccak256,
  toHex,
  type PublicClient,
} from "viem";
import { describe, expect, it, vi } from "vitest";

import { onchainMetadataRendererAbi } from "@/contracts";
import {
  createDefaultArtConfig,
  toContractArtConfig,
} from "@/features/creator-studio/art-config";
import {
  emptyMediaConfig,
  makeRendererPreviewContext,
} from "@/features/creator-studio/studio-protocol";
import { previewRendererRequest } from "@/features/renderer-lab/preview";

const renderer = getAddress("0x1111111111111111111111111111111111111111");
const harness = getAddress("0x2222222222222222222222222222222222222222");
const context = makeRendererPreviewContext({
  tierName: "Image renderer",
  description: "Browser-held preview",
  externalURI: "",
  tierIdentity: `0x${"33".repeat(32)}`,
  art: toContractArtConfig(createDefaultArtConfig("stack", 1n)),
  media: emptyMediaConfig,
  tokenId: 7,
  state: "active",
  referenceTimestamp: 1_800_000_000n,
});

describe("renderer lab image preview", () => {
  it("injects a 90 KiB browser image only into canonical RPC calldata and displays the transformed output", async () => {
    const nativeMedia = toHex(new Uint8Array(90 * 1024).fill(0x5a));
    const transformed =
      '<svg xmlns="http://www.w3.org/2000/svg"><filter id="creator-transform" /></svg>';
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const call = vi.fn(async ({ data }: { data: `0x${string}` }) => {
      const decoded = decodeFunctionData({
        abi: onchainMetadataRendererAbi,
        data,
      });
      expect(decoded.functionName).toBe("previewSVG");
      const decodedContext = decoded.args?.[0] as typeof context | undefined;
      expect(decodedContext?.nativeMedia).toBe(nativeMedia);
      expect(decodedContext?.token.media).toEqual({
        mime: 1,
        store: "0x0000000000000000000000000000000000000000",
        length: 90 * 1024,
        digest: keccak256(nativeMedia),
        runtimeCodehash: `0x${"00".repeat(32)}`,
      });
      return {
        data: encodeFunctionResult({
          abi: onchainMetadataRendererAbi,
          functionName: "previewSVG",
          result: transformed,
        }),
      };
    });

    await expect(
      previewRendererRequest({
        client: { call } as unknown as PublicClient,
        previewHarness: harness,
        renderer,
        creationBytecode: "0x6000",
        nativeMedia: { bytes: nativeMedia, mime: 1 },
        request: {
          requestId: "with-image",
          mode: "deployed-address",
          method: "previewSVG",
          contextWithoutMedia: context,
          localImageSlot: true,
        },
      }),
    ).resolves.toBe(transformed);
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it("uses generated-only input when no browser or configured image is present", async () => {
    const call = vi.fn(async ({ data }: { data: `0x${string}` }) => {
      const decoded = decodeFunctionData({
        abi: onchainMetadataRendererAbi,
        data,
      });
      const decodedContext = decoded.args?.[0] as typeof context | undefined;
      expect(decodedContext?.nativeMedia).toBe("0x");
      expect(decodedContext?.token.media).toEqual(emptyMediaConfig);
      return {
        data: encodeFunctionResult({
          abi: onchainMetadataRendererAbi,
          functionName: "previewSVG",
          result: '<svg xmlns="http://www.w3.org/2000/svg" />',
        }),
      };
    });

    await previewRendererRequest({
      client: { call } as unknown as PublicClient,
      previewHarness: harness,
      renderer,
      creationBytecode: "0x6000",
      request: {
        requestId: "without-image",
        mode: "deployed-address",
        method: "previewSVG",
        contextWithoutMedia: context,
        localImageSlot: true,
      },
    });
  });
});
