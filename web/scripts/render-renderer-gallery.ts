import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const engines = [
  "STACK",
  "CHORUS",
  "LOOM",
  "BLOOM",
  "MARQUEE",
  "AFTERIMAGE",
] as const;
const tokenIds = [1, 7, 42] as const;
const mediaModes = ["generated", "onchain"] as const;
const states = ["active", "afterglow"] as const;

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const galleryDirectory = resolve(
  scriptDirectory,
  "../../contracts/deployments/renderer-gallery",
);
const outputDirectory = resolve(galleryDirectory, "contact-sheets");
const tile = 320;
const labelHeight = 36;
const cellHeight = tile + labelHeight;

function escapeHTML(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch();

try {
  for (const media of mediaModes) {
    for (const state of states) {
      const cells: string[] = [];
      const embeddedMedia: string[] = [];
      for (const engine of engines) {
        for (const tokenId of tokenIds) {
          const filename = `${engine}-${tokenId}-${media}-${state}.svg`;
          const path = resolve(galleryDirectory, filename);
          const svg = await readFile(path);
          const forbidden = ["<script", "animation_url", "ar://", "ipfs://"];
          const source = svg.toString("utf8");
          for (const marker of forbidden) {
            if (source.includes(marker)) {
              throw new Error(
                `${filename} contains forbidden marker ${marker}`,
              );
            }
          }
          if (!source.includes(`data-state="${state}"`)) {
            throw new Error(
              `${filename} does not contain its declared ${state} state`,
            );
          }
          if (
            media === "onchain" &&
            !source.includes("data:image/png;base64,")
          ) {
            throw new Error(`${filename} does not embed its onchain PNG bytes`);
          }
          if (media === "onchain") {
            const dataURI = source.match(
              /data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+/,
            )?.[0];
            if (!dataURI) {
              throw new Error(
                `${filename} does not contain a decodable native-media data URI`,
              );
            }
            embeddedMedia.push(dataURI);
          }

          cells.push(`<article class="cell">
            <img alt="${escapeHTML(`${engine} token ${tokenId}`)}" src="data:image/svg+xml;base64,${svg.toString("base64")}" />
            <p>${escapeHTML(`${engine} · TOKEN ${tokenId}`)}</p>
          </article>`);
        }
      }

      const page = await browser.newPage({
        viewport: {
          width: tokenIds.length * tile,
          height: engines.length * cellHeight,
        },
        deviceScaleFactor: 1,
      });
      await page.setContent(`<!doctype html>
        <html><head><style>
          * { box-sizing: border-box; }
          html, body { margin: 0; background: #120b0a; }
          main { display: grid; grid-template-columns: repeat(${tokenIds.length}, ${tile}px); }
          .cell { width: ${tile}px; height: ${cellHeight}px; margin: 0; overflow: hidden; }
          .cell img { display: block; width: ${tile}px; height: ${tile}px; object-fit: cover; background: #120b0a; }
          .cell p { height: ${labelHeight}px; margin: 0; padding: 10px 16px 0; color: #f4e6c8; background: #120b0a; font: 700 14px/1 Arial, Helvetica, sans-serif; letter-spacing: 1.4px; }
        </style></head><body><main>${cells.join("")}</main></body></html>`);
      await page.locator("img").evaluateAll(async (images) => {
        const imageElements = images as HTMLImageElement[];
        await Promise.all(imageElements.map((image) => image.decode()));
        for (const image of imageElements) {
          if (image.naturalWidth === 0 || image.naturalHeight === 0) {
            throw new Error(`${image.alt} failed to decode`);
          }
        }
      });
      await page.evaluate(async (dataURIs) => {
        await Promise.all(
          dataURIs.map(async (dataURI) => {
            const image = new Image();
            image.src = dataURI;
            await image.decode();
            if (image.naturalWidth === 0 || image.naturalHeight === 0) {
              throw new Error("Embedded onchain media failed to decode");
            }
          }),
        );
      }, embeddedMedia);
      await page.screenshot({
        path: resolve(outputDirectory, `${media}-${state}.png`),
        fullPage: true,
      });
      await page.close();
    }
  }
} finally {
  await browser.close();
}
