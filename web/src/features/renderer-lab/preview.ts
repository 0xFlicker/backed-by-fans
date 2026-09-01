import {
  decodeFunctionResult,
  encodeFunctionData,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

import {
  onchainMetadataRendererAbi,
  rendererPreviewHarnessAbi,
} from "@/contracts";
import {
  decodeRendererSurface,
  decodeRendererTokenURI,
} from "@/features/creator-studio/renderer-preview";
import { previewLimiter } from "@/features/creator-studio/preview-limiter";
import type { RendererPreviewRequest } from "@/features/renderer-lab/candidate";

export async function previewRendererRequest(input: {
  client: PublicClient;
  previewHarness: Address;
  renderer: Address;
  creationBytecode: Hex;
  request: RendererPreviewRequest;
  nativeMedia?: Hex;
  signal?: AbortSignal;
}) {
  const context = {
    ...input.request.contextWithoutMedia,
    nativeMedia: input.request.localImageSlot
      ? (input.nativeMedia ?? "0x")
      : "0x",
  } as never;
  const rendererCallData = encodeFunctionData({
    abi: onchainMetadataRendererAbi,
    functionName: input.request.method,
    args: [context],
  });
  const target =
    input.request.mode === "deployed-address"
      ? input.renderer
      : input.previewHarness;
  const data =
    input.request.mode === "deployed-address"
      ? rendererCallData
      : encodeFunctionData({
          abi: rendererPreviewHarnessAbi,
          functionName: "preview",
          args: [input.creationBytecode, rendererCallData],
        });

  const response = await previewLimiter.run(
    (signal) =>
      input.client.call({
        batch: false,
        data,
        requestOptions: { retryCount: 0, signal },
        to: target,
      }),
    input.signal,
  );
  if (!response.data) throw new Error("No preview was returned.");
  const rendererResult =
    input.request.mode === "undeployed-initcode"
      ? (decodeFunctionResult({
          abi: rendererPreviewHarnessAbi,
          functionName: "preview",
          data: response.data,
        }) as Hex)
      : response.data;
  const output = decodeFunctionResult({
    abi: onchainMetadataRendererAbi,
    functionName: input.request.method,
    data: rendererResult,
  }) as string;

  if (input.request.method === "previewSVG") {
    return decodeRendererSurface(output, "svg").text;
  }
  return decodeRendererTokenURI(output).svg;
}
