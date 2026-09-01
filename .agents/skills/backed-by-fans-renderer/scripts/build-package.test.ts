import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import {
  CANONICAL_CREATE2_DEPLOYER,
  DEFAULT_INTERFACE_SCHEMA,
  buildRendererPackage,
  representativeRendererExamples,
} from "./build-package";
import { writeRendererGallery } from "./render-gallery";

const salt = `0x${"11".repeat(32)}`;
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
    salt,
    sourceRoot: "templates/renderer",
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
  test("packages complete final initcode and independently checkable deployment measurements", () => {
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
      create2Deployer: CANONICAL_CREATE2_DEPLOYER,
      salt,
      initCodeHash:
        "0xbeeab6947c3dc3ca67fbf87e560e698ad870596e7f656fe215494899ed5e3948",
      predictedAddress: "0xcb927a74aA81d2f792E06bD21C22812Fd75aeb7B",
      rawByteLength: 36,
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
});

describe("local renderer gallery", () => {
  test("writes one real SVG slot per representative request and a deterministic six-case gallery", async () => {
    const outputDirectory = mkdtempSync(
      join(tmpdir(), "backed-by-fans-renderer-gallery-"),
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
    expect(html).toContain(rendererPackage.deployment.predictedAddress);
    expect(html).not.toContain("data:image");
  });

  test("keeps package-provided request IDs inside the gallery directory", async () => {
    const outputDirectory = mkdtempSync(
      join(tmpdir(), "backed-by-fans-renderer-gallery-paths-"),
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
