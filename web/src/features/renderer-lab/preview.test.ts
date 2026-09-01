import {
  encodeFunctionResult,
  getAddress,
  type Hex,
  type PublicClient,
} from "viem";
import { describe, expect, it, vi } from "vitest";

import {
  onchainMetadataRendererAbi,
  rendererPreviewHarnessAbi,
} from "@/contracts";
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
const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect /></svg>';
const context = makeRendererPreviewContext({
  tierName: "Renderer Lab",
  description: "Preview",
  externalURI: "",
  tierIdentity: `0x${"33".repeat(32)}`,
  art: toContractArtConfig(createDefaultArtConfig("stack", 1n)),
  media: emptyMediaConfig,
  tokenId: 1,
  state: "active",
  referenceTimestamp: 1_800_000_000n,
});

describe("renderer lab canonical RPC previews", () => {
  it("calls an already deployed renderer address", async () => {
    const rendererResult = encodeFunctionResult({
      abi: onchainMetadataRendererAbi,
      functionName: "previewSVG",
      result: svg,
    });
    const call = vi.fn().mockResolvedValue({ data: rendererResult });

    await expect(
      previewRendererRequest({
        client: { call } as unknown as PublicClient,
        previewHarness: harness,
        renderer,
        creationBytecode: "0x6000",
        request: {
          requestId: "deployed",
          mode: "deployed-address",
          method: "previewSVG",
          contextWithoutMedia: context,
          localImageSlot: false,
        },
      }),
    ).resolves.toBe(svg);
    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({ to: renderer, batch: false }),
    );
  });

  it("uses the generated transient harness for undeployed initcode", async () => {
    const rendererResult = encodeFunctionResult({
      abi: onchainMetadataRendererAbi,
      functionName: "previewSVG",
      result: svg,
    });
    const harnessResult = encodeFunctionResult({
      abi: rendererPreviewHarnessAbi,
      functionName: "preview",
      result: rendererResult,
    });
    const call = vi.fn().mockResolvedValue({ data: harnessResult });

    await expect(
      previewRendererRequest({
        client: { call } as unknown as PublicClient,
        previewHarness: harness,
        renderer,
        creationBytecode: "0x6000" as Hex,
        request: {
          requestId: "undeployed",
          mode: "undeployed-initcode",
          method: "previewSVG",
          contextWithoutMedia: context,
          localImageSlot: false,
        },
      }),
    ).resolves.toBe(svg);
    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({ to: harness, batch: false }),
    );
  });

  it("fails when the canonical RPC returns no result bytes", async () => {
    await expect(
      previewRendererRequest({
        client: {
          call: vi.fn().mockResolvedValue({ data: undefined }),
        } as unknown as PublicClient,
        previewHarness: harness,
        renderer,
        creationBytecode: "0x6000",
        request: {
          requestId: "missing",
          mode: "deployed-address",
          method: "previewSVG",
          contextWithoutMedia: context,
          localImageSlot: false,
        },
      }),
    ).rejects.toThrow(/no preview/i);
  });
});
