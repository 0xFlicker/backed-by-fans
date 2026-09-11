import { readFile, mkdir, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { marked } from "marked";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(web, "../docs/whitepaper");
const output = resolve(web, "public/backed-by-fans-whitepaper.pdf");
const temporary = `${output}.tmp`;
const markdown = await readFile(resolve(source, "whitepaper.md"), "utf8");
const revision = markdown.match(/contracts at revision `([a-f0-9]{40})`/)?.[1];
if (!revision)
  throw new Error("Whitepaper must identify its contract revision.");
const css = await readFile(resolve(source, "print.css"), "utf8");
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "https://whitepaper.local") return route.abort();
    const path = decodeURIComponent(url.pathname);
    const root = path.startsWith("/fonts/")
      ? resolve(web, "node_modules")
      : source;
    const relative = path.startsWith("/fonts/") ? path.slice(7) : path.slice(1);
    const file = resolve(root, relative);
    if (!file.startsWith(`${root}/`)) throw new Error(`Invalid asset: ${path}`);
    await route.fulfill({ path: file });
  });
  await page.setContent(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><base href="https://whitepaper.local/"><title>Backed By Fans — Creator-owned memberships</title><style>${css}</style></head><body>${await marked.parse(markdown)}</body></html>`,
  );
  await page.evaluate((revision) => {
    const title = document.querySelector("h1");
    const coverImage = document.querySelector('img[src="assets/cover.png"]');
    if (!title || !coverImage)
      throw new Error("Missing whitepaper title or cover.");
    const cover = document.createElement("header");
    cover.className = "cover";
    document.body.prepend(cover);
    for (const element of [
      title,
      title.nextElementSibling,
      title.nextElementSibling?.nextElementSibling,
      coverImage.parentElement,
    ]) {
      if (element) cover.append(element);
    }
    document.querySelectorAll("p > img").forEach((img) => {
      if (cover.contains(img)) return;
      const paragraph = img.parentElement!;
      const caption = paragraph.nextElementSibling;
      const figure = document.createElement("figure");
      paragraph.before(figure);
      figure.append(paragraph);
      if (caption?.textContent?.startsWith("Figure ")) figure.append(caption);
    });
    document
      .querySelectorAll<HTMLAnchorElement>('a[href^="../../contracts/"]')
      .forEach((link) => {
        link.href = `https://github.com/0xFlicker/backed-by-fans/blob/${revision}/${link.getAttribute("href")!.slice(6)}`;
      });
  }, revision);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map(async (img) => {
        await img.decode();
        if (!img.naturalWidth)
          throw new Error(`Image failed to load: ${img.src}`);
      }),
    );
  });
  await mkdir(dirname(output), { recursive: true });
  await page.pdf({
    path: temporary,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    tagged: true,
    outline: true,
  });
  await rename(temporary, output);
  console.log(`Generated ${output}`);
} finally {
  await browser.close();
  await rm(temporary, { force: true });
}
