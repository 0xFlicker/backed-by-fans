import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import {
  DEFAULT_INTERFACE_SCHEMA,
  LOCAL_ANVIL_BLOCK_GAS_LIMIT,
  buildRendererPackage,
  localAnvilCommand,
  representativeRendererExamples,
  simulateRendererDeployment,
  type AnvilRpcRequest,
  type LocalAnvil,
} from "./build-package";
import { writeRendererGallery } from "./render-gallery";

const temporaryDirectories: string[] = [];

const artifact = {
  abi: [
    {
      inputs: [],
      name: "rendererName",
      outputs: [{ internalType: "string", name: "", type: "string" }],
      stateMutability: "pure",
      type: "function",
    },
  ],
  bytecode: { object: "0x6000" },
  deployedBytecode: { object: "0x6009" },
  metadata: {
    compiler: { version: "0.8.36+commit.8a079791" },
    settings: {
      compilationTarget: { "src/CustomRenderer.sol": "CustomRenderer" },
      evmVersion: "cancun",
      optimizer: { enabled: true, runs: 200 },
    },
  },
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function makePackage() {
  return buildRendererPackage({
    artifact,
    constructorArgs: "0x1234",
    finalRuntimeBytecode: "0x6001",
    rendererName: "Test Renderer",
    sourceRoot: "template",
  });
}

function containsForbiddenImageField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenImageField);
  if (value === null || typeof value !== "object") return false;

  return Object.entries(value).some(([key, nested]) => {
    const normalized = key.replaceAll(/[^a-zA-Z0-9]/g, "").toLowerCase();
    return (
      normalized === "nativemedia" ||
      normalized.startsWith("sourceimage") ||
      containsForbiddenImageField(nested)
    );
  });
}

describe("renderer package writer", () => {
  test("packages complete final initcode and the registry deployment measurement", () => {
    const rendererPackage = makePackage();

    expect(rendererPackage.interfaceSchema).toBe(DEFAULT_INTERFACE_SCHEMA);
    expect(rendererPackage.artifacts.creationBytecode).toBe("0x60001234");
    expect(rendererPackage.artifacts.runtimeBytecode).toBe("0x6001");
    expect(rendererPackage.artifacts.creationByteLength).toBe(4);
    expect(rendererPackage.artifacts.runtimeByteLength).toBe(2);
    expect(rendererPackage.artifacts.artifactFingerprint).toBe(
      "0xe0d9e699bb7c275c2f5958a0219df55d0277d7ab6ad6944452d6b33cc101a642",
    );
    expect(rendererPackage.deployment).toEqual({
      chainId: 46_630,
      initCodeByteLength: 4,
    });
    expect(rendererPackage.artifacts.abi).toBe(JSON.stringify(artifact.abi));
  });

  test("produces deterministic packages with the required embedded request matrix and no source image", () => {
    const first = makePackage();
    const second = makePackage();

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.examples).toEqual(representativeRendererExamples());
    expect(
      first.examples.map(({ tokenId, state, imageMode }) => [
        tokenId,
        state,
        imageMode,
      ]),
    ).toEqual([
      [1, "active", "none"],
      [1, "expired", "browser-slot"],
      [7, "active", "browser-slot"],
      [7, "expired", "none"],
      [42, "active", "none"],
      [42, "expired", "browser-slot"],
    ]);
    expect(
      first.examples.every((example) => example.method === "previewSVG"),
    ).toBe(true);
    expect(
      first.examples.every(
        (example) =>
          example.localImageSlot === (example.imageMode === "browser-slot"),
      ),
    ).toBe(true);
    expect(containsForbiddenImageField(first)).toBe(false);
  });

  test("uses the illustrative membership name in every preview", () => {
    const rendererPackage = buildRendererPackage({
      artifact,
      finalRuntimeBytecode: "0x6001",
      membershipName: "Night Garden Society",
      rendererName: "Test Renderer",
      sourceRoot: "template",
    });

    expect(
      rendererPackage.examples.map(
        (example) =>
          (example.contextWithoutMedia.token as { tierName: string }).tierName,
      ),
    ).toEqual(Array(6).fill("Night Garden Society"));
  });
});

describe("local deployment rehearsal", () => {
  test("starts Anvil with the toolkit block gas limit", () => {
    const command = localAnvilCommand(54_321);
    const gasLimitIndex = command.indexOf("--gas-limit");

    expect(gasLimitIndex).toBeGreaterThan(-1);
    expect(command[gasLimitIndex + 1]).toBe(
      String(LOCAL_ANVIL_BLOCK_GAS_LIMIT),
    );
  });

  test("estimates deployment gas and sends that estimate", async () => {
    const deployer = "0x1111111111111111111111111111111111111111";
    const renderer = "0x2222222222222222222222222222222222222222";
    const transactionHash = `0x${"33".repeat(32)}`;
    const calls: Array<{ method: string; params: unknown[] }> = [];
    const rpc: AnvilRpcRequest = async (_rpcUrl, method, params) => {
      calls.push({ method, params });
      switch (method) {
        case "eth_accounts":
          return [deployer];
        case "eth_estimateGas":
          return "0x186a0";
        case "eth_sendTransaction":
          return transactionHash;
        case "eth_getTransactionReceipt":
          return { contractAddress: renderer, status: "0x1" };
        case "eth_getCode":
          return "0x6000";
        default:
          throw new Error(`Unexpected RPC method: ${method}`);
      }
    };

    const result = await simulateRendererDeployment(
      { rpcUrl: "http://127.0.0.1:54321" } as LocalAnvil,
      "0x6000",
      rpc,
    );

    expect(result).toEqual({
      rendererAddress: renderer,
      runtimeBytecode: "0x6000",
    });
    expect(calls.map(({ method }) => method)).toEqual([
      "eth_accounts",
      "eth_estimateGas",
      "eth_sendTransaction",
      "eth_getTransactionReceipt",
      "eth_getCode",
    ]);
    expect(calls[1]?.params).toEqual([
      { data: "0x6000", from: deployer },
    ]);
    expect(calls[2]?.params).toEqual([
      { data: "0x6000", from: deployer, gas: "0x186a0" },
    ]);
  });
});

describe("local renderer gallery", () => {
  test("writes one real SVG slot per representative request and a deterministic six-case gallery", async () => {
    const outputDirectory = mkdtempSync(
      join(tmpdir(), "onchain-render-skill-gallery-"),
    );
    temporaryDirectories.push(outputDirectory);
    const rendererPackage = makePackage();

    const gallery = await writeRendererGallery({
      outputDirectory,
      rendererPackage,
      renderSvg: async (example) =>
        `<svg xmlns="http://www.w3.org/2000/svg" data-request="${example.requestId}"/>`,
    });

    expect(gallery.svgPaths).toHaveLength(6);
    expect(gallery.results.map((result) => result.requestId)).toEqual(
      rendererPackage.examples.map((example) => example.requestId),
    );
    for (const [index, svgPath] of gallery.svgPaths.entries()) {
      expect(readFileSync(svgPath, "utf8")).toContain(
        `data-request="${rendererPackage.examples[index]?.requestId}"`,
      );
    }

    const html = readFileSync(gallery.htmlPath, "utf8");
    expect(html.match(/<figure/g)).toHaveLength(6);
    expect(html.match(/<img /g)).toHaveLength(6);
    expect(html).not.toContain("CREATE2");
    expect(html).not.toContain("data:image");
  });

  test("keeps package-provided request IDs inside the gallery directory", async () => {
    const outputDirectory = mkdtempSync(
      join(tmpdir(), "onchain-render-skill-gallery-paths-"),
    );
    temporaryDirectories.push(outputDirectory);
    const rendererPackage = makePackage();
    rendererPackage.examples[0]!.requestId = "../../outside";

    const gallery = await writeRendererGallery({
      outputDirectory,
      rendererPackage,
      renderSvg: async () => '<svg xmlns="http://www.w3.org/2000/svg"/>',
    });

    expect(
      gallery.svgPaths.every(
        (path) => !relative(outputDirectory, path).startsWith(".."),
      ),
    ).toBe(true);
  });
});
