import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import {
  anvilRpc,
  simulateRendererDeployment,
  startLocalAnvil,
  type RendererPackage,
  type RendererPackageExample,
  type SimulatedRendererDeployment,
} from "./build-package";

const PREVIEW_SVG_SIGNATURE =
  "previewSVG(((string,string,string,bytes32,(uint16,uint128,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8,uint8),(uint8,address,uint32,bytes32,bytes32),uint256,uint64,bool),bytes))(string)";

type GalleryResult =
  | { requestId: string; status: "ready"; svgPath: string }
  | { requestId: string; status: "failed"; svgPath: string; error: string };

type WriteRendererGalleryOptions = {
  outputDirectory: string;
  rendererPackage: RendererPackage;
  renderSvg: (example: RendererPackageExample) => Promise<string>;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function failureSvg(example: RendererPackageExample, error: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" role="img" aria-label="Renderer failed"><rect width="1200" height="1200" fill="#171717"/><text x="72" y="120" fill="#f5f5f0" font-family="monospace" font-size="34">${escapeHtml(example.requestId)}</text><text x="72" y="190" fill="#ff796d" font-family="monospace" font-size="24">${escapeHtml(error.slice(0, 160))}</text></svg>`;
}

function galleryHtml(
  rendererPackage: RendererPackage,
  results: GalleryResult[],
): string {
  const examplesById = new Map(
    rendererPackage.examples.map((example) => [example.requestId, example]),
  );
  const figures = results
    .map((result) => {
      const example = examplesById.get(result.requestId)!;
      const status = result.status === "ready" ? "Rendered" : "Failed";
      return `<figure><img src="${escapeHtml(basename(result.svgPath))}" alt="${escapeHtml(example.requestId)}"/><figcaption><strong>${escapeHtml(example.requestId)}</strong><span>Token ${example.tokenId} · ${escapeHtml(example.state)} · ${escapeHtml(example.imageMode)} · ${status}</span></figcaption></figure>`;
    })
    .join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${escapeHtml(rendererPackage.rendererName)} gallery</title><style>
:root{color-scheme:dark;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#0c0c0c;color:#f4f1e8}body{margin:0;padding:32px}header{max-width:980px;margin:0 auto 28px}h1{font-size:clamp(28px,5vw,56px);margin:0 0 12px}p{color:#aaa;overflow-wrap:anywhere}.matrix{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px;max-width:1440px;margin:auto}figure{margin:0;border:1px solid #333;background:#151515}img{display:block;width:100%;aspect-ratio:1;object-fit:contain;background:#080808}figcaption{display:grid;gap:7px;padding:14px;font-size:13px}figcaption span{color:#aaa}</style></head><body><header><h1>${escapeHtml(rendererPackage.rendererName)}</h1><p>Six deterministic local representative requests. Browser image slots render with empty local media; no source image is embedded.</p><p>Predicted CREATE2 address: ${escapeHtml(rendererPackage.deployment.predictedAddress)}</p></header><main class="matrix">${figures}</main></body></html>
`;
}

export async function writeRendererGallery(
  options: WriteRendererGalleryOptions,
): Promise<{
  htmlPath: string;
  results: GalleryResult[];
  svgPaths: string[];
}> {
  if (options.rendererPackage.examples.length !== 6) {
    throw new Error(
      "The local renderer gallery requires exactly six examples.",
    );
  }
  mkdirSync(options.outputDirectory, { recursive: true });
  const results: GalleryResult[] = [];
  for (const [index, example] of options.rendererPackage.examples.entries()) {
    const slug =
      example.requestId
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, "-")
        .replaceAll(/^-|-$/g, "")
        .slice(0, 80) || "request";
    const svgPath = join(
      options.outputDirectory,
      `${String(index + 1).padStart(2, "0")}-${slug}.svg`,
    );
    try {
      const svg = await options.renderSvg(example);
      if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg)) {
        throw new Error("previewSVG did not return a complete SVG document.");
      }
      writeFileSync(svgPath, svg);
      results.push({ requestId: example.requestId, status: "ready", svgPath });
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause);
      writeFileSync(svgPath, failureSvg(example, error));
      results.push({
        requestId: example.requestId,
        status: "failed",
        svgPath,
        error,
      });
    }
  }
  const htmlPath = join(options.outputDirectory, "index.html");
  writeFileSync(htmlPath, galleryHtml(options.rendererPackage, results));
  return {
    htmlPath,
    results,
    svgPaths: results.map((result) => result.svgPath),
  };
}

function previewTuple(example: RendererPackageExample): string {
  const { token } = example.contextWithoutMedia;
  const { art, media } = token;
  const artTuple = `(${[
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
  ].join(",")})`;
  const mediaTuple = `(${[
    media.mime,
    media.store,
    media.length,
    media.digest,
    media.runtimeCodehash,
  ].join(",")})`;
  const tokenTuple = `(${[
    JSON.stringify(token.tierName),
    JSON.stringify(token.description),
    JSON.stringify(token.externalURI),
    token.tierIdentity,
    artTuple,
    mediaTuple,
    token.tokenId,
    token.expiration,
    token.active,
  ].join(",")})`;
  return `(${tokenTuple},0x)`;
}

function castOutput(command: string[]): string {
  const result = Bun.spawnSync(command, { stderr: "pipe", stdout: "pipe" });
  if (result.exitCode !== 0) {
    const detail = new TextDecoder().decode(result.stderr).trim();
    throw new Error(detail || `cast exited ${result.exitCode}.`);
  }
  return new TextDecoder().decode(result.stdout).trim();
}

async function simulatedPreviewCall(
  rpcUrl: string,
  rendererAddress: string,
  simulation: SimulatedRendererDeployment,
  example: RendererPackageExample,
): Promise<string> {
  const calldata = castOutput([
    "cast",
    "calldata",
    PREVIEW_SVG_SIGNATURE,
    previewTuple(example),
  ]);
  const encodedOutput = await anvilRpc(rpcUrl, "eth_call", [
    { data: calldata, to: rendererAddress },
    "latest",
    simulation.stateOverrides,
  ]);
  if (typeof encodedOutput !== "string") {
    throw new Error("Local preview returned no ABI-encoded output.");
  }
  const output = castOutput([
    "cast",
    "decode-abi",
    PREVIEW_SVG_SIGNATURE,
    encodedOutput,
  ]);
  if (output.startsWith('"') && output.endsWith('"')) {
    return JSON.parse(output) as string;
  }
  return output;
}

function parseRendererPackage(path: string): RendererPackage {
  const value = JSON.parse(readFileSync(path, "utf8")) as RendererPackage;
  if (
    value.formatVersion !== 1 ||
    typeof value.artifacts?.creationBytecode !== "string" ||
    typeof value.artifacts?.runtimeBytecode !== "string" ||
    !Array.isArray(value.examples)
  ) {
    throw new Error(`${path} is not a renderer package.`);
  }
  return value;
}

export async function runRenderGalleryCli(args: string[]): Promise<string> {
  const packageInput = args[0];
  if (!packageInput || packageInput.startsWith("--")) {
    throw new Error(
      "Usage: bun render-gallery.ts <renderer-package.json> [--output directory]",
    );
  }
  let outputInput: string | undefined;
  if (args.length > 1) {
    if (args[1] !== "--output" || !args[2] || args.length !== 3) {
      throw new Error(
        "Usage: bun render-gallery.ts <renderer-package.json> [--output directory]",
      );
    }
    outputInput = args[2];
  }
  const packagePath = resolve(packageInput);
  const rendererPackage = parseRendererPackage(packagePath);
  const outputDirectory = resolve(
    outputInput ?? join(dirname(packagePath), "renderer-gallery"),
  );
  const local = await startLocalAnvil();
  try {
    const simulation = await simulateRendererDeployment(local, {
      creationBytecode: rendererPackage.artifacts.creationBytecode,
      predictedAddress: rendererPackage.deployment.predictedAddress,
      salt: rendererPackage.deployment.salt,
    });
    if (
      simulation.runtimeBytecode.toLowerCase() !==
      rendererPackage.artifacts.runtimeBytecode.toLowerCase()
    ) {
      throw new Error(
        "The package runtime does not match the complete local CREATE2 simulation.",
      );
    }
    const gallery = await writeRendererGallery({
      outputDirectory,
      rendererPackage,
      renderSvg: (example) =>
        simulatedPreviewCall(
          local.rpcUrl,
          rendererPackage.deployment.predictedAddress,
          simulation,
          example,
        ),
    });
    return gallery.htmlPath;
  } finally {
    local.process.kill();
    await local.process.exited;
  }
}

if (import.meta.main) {
  try {
    const htmlPath = await runRenderGalleryCli(Bun.argv.slice(2));
    console.log(`Renderer gallery: ${htmlPath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
