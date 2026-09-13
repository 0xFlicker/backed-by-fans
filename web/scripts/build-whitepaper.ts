import { readFile, mkdir, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { marked } from "marked";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(web, "../docs/whitepaper");
const output = resolve(web, "public/backed-by-fans-whitepaper.pdf");
const temporary = `${output}.tmp`;
const markdown = await readFile(resolve(source, "whitepaper.md"), "utf8");
const repo = resolve(web, "..");
const revision = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repo,
  encoding: "utf8",
}).trim();
const changed =
  execFileSync(
    "git",
    [
      "status",
      "--porcelain",
      "--",
      "contracts/src",
      "specs/005-transferable-memberships/spec.md",
    ],
    { cwd: repo, encoding: "utf8" },
  ).trim().length > 0;
const sourceFiles = execFileSync(
  "git",
  [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    "contracts/src",
    "specs/005-transferable-memberships/spec.md",
  ],
  { cwd: repo, encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean)
  .sort();
const sourceHash = createHash("sha256");
for (const file of [...new Set(sourceFiles)]) {
  // Removed tracked files are part of the changed-source status, not current source.
  try {
    const bytes = await readFile(resolve(repo, file));
    sourceHash
      .update(file + "\0")
      .update(bytes)
      .update("\0");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
const sourceLabel = changed
  ? `Uncommitted source snapshot SHA-256 ${sourceHash.digest("hex")}; based on ${revision}. References identify local source paths.`
  : `Source revision ${revision}.`;
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
  await page.evaluate(
    ({ revision, changed, sourceLabel }) => {
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
        .querySelectorAll<HTMLAnchorElement>('a[href^="../../"]')
        .forEach((link) => {
          const path = link.getAttribute("href")!.slice(6);
          if (changed) {
            link.replaceWith(`${link.textContent} (${path})`);
          } else
            link.href = `https://github.com/0xFlicker/backed-by-fans/blob/${revision}/${path}`;
        });
      const provenance = document.createElement("p");
      provenance.textContent = sourceLabel;
      provenance.style.overflowWrap = "anywhere";
      document.body.append(provenance);
    },
    { revision, changed, sourceLabel },
  );
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
