import type { Page } from "@playwright/test";
import {
  encodeAbiParameters,
  encodeFunctionResult,
  keccak256,
  type Hex,
} from "viem";

import {
  onchainMetadataRendererAbi,
  rendererPreviewHarnessAbi,
} from "../../../src/contracts";
import {
  createDefaultArtConfig,
  toContractArtConfig,
} from "../../../src/features/creator-studio/art-config";
import {
  emptyMediaConfig,
  makeRendererPreviewContext,
} from "../../../src/features/creator-studio/studio-protocol";

const interfaceSchema = `0x${"12".repeat(32)}` as Hex;
const transformedSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect data-transform="creator-image" width="100" height="100" fill="#625bff"/></svg>';
function byteLength(value: Hex) {
  return (value.length - 2) / 2;
}

export function rendererPackage() {
  const creationBytecode = "0x6000600055" as Hex;
  const runtimeBytecode = "0x6000" as Hex;
  const compiler = {
    solidity: "0.8.36",
    evmVersion: "cancun",
    optimizerEnabled: true,
    optimizerRuns: 200,
  } as const;
  const artifactFingerprint = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes" },
        { type: "bytes" },
        { type: "string" },
        { type: "string" },
        { type: "bool" },
        { type: "uint256" },
        { type: "bytes32" },
      ],
      [
        creationBytecode,
        runtimeBytecode,
        compiler.solidity,
        compiler.evmVersion,
        compiler.optimizerEnabled,
        BigInt(compiler.optimizerRuns),
        interfaceSchema,
      ],
    ),
  );
  return {
    formatVersion: 2 as const,
    rendererName: "Moonlit Memberships",
    interfaceSchema,
    compiler,
    artifacts: {
      sourceRoot: "/local/moonlit",
      abi: "[]",
      creationBytecode,
      runtimeBytecode,
      artifactFingerprint,
      creationByteLength: byteLength(creationBytecode),
      runtimeByteLength: byteLength(runtimeBytecode),
    },
    deployment: {
      chainId: 46_630,
      initCodeByteLength: byteLength(creationBytecode),
    },
    examples: (
      [
        [1, "active", "none"],
        [1, "expired", "browser-slot"],
        [7, "active", "browser-slot"],
        [7, "expired", "none"],
        [42, "active", "none"],
        [42, "expired", "browser-slot"],
      ] as const
    ).map(([tokenId, state, imageMode], index) => {
      const context = makeRendererPreviewContext({
        tierName: "Moonlit Memberships",
        description: "Representative renderer preview",
        externalURI: "",
        tierIdentity: `0x${"56".repeat(32)}`,
        art: toContractArtConfig(createDefaultArtConfig("stack", 1n)),
        media: emptyMediaConfig,
        tokenId,
        state: state === "active" ? "active" : "afterglow",
        referenceTimestamp: 1_800_000_000n,
      });
      const contextWithoutMedia = JSON.parse(
        JSON.stringify(context, (key, value) => {
          if (key === "nativeMedia") return undefined;
          return typeof value === "bigint" ? value.toString() : value;
        }),
      ) as Record<string, unknown>;
      return {
        requestId: `example-${index + 1}`,
        tokenId,
        state,
        imageMode,
        method: "previewSVG" as const,
        contextWithoutMedia,
        localImageSlot: imageMode === "browser-slot",
      };
    }),
    skill: ".agents/skills/backed-by-fans-renderer/SKILL.md",
    llms: ".agents/skills/backed-by-fans-renderer/llms.txt",
  };
}

export async function installPreviewRpc(page: Page) {
  const rendererResult = encodeFunctionResult({
    abi: onchainMetadataRendererAbi,
    functionName: "previewSVG",
    result: transformedSvg,
  });
  const harnessResult = encodeFunctionResult({
    abi: rendererPreviewHarnessAbi,
    functionName: "preview",
    result: rendererResult,
  });

  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    let body: { id?: number; method?: string } | undefined;
    try {
      body = request.postDataJSON() as { id?: number; method?: string };
    } catch {
      return route.continue();
    }
    if (body.method !== "eth_call") return route.continue();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        result: harnessResult,
      }),
    });
  });
}

export async function importPackage(page: Page) {
  await page.getByLabel("Renderer package", { exact: true }).setInputFiles({
    name: "moonlit.renderer.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(rendererPackage())),
  });
}
