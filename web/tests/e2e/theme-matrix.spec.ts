import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { importPackage, installPreviewRpc } from "./helpers/renderer";

// Visual/semantic checks only. This suite never submits wallet or chain writes.
test.skip(
  !process.env.BBF_THEME_REVIEW,
  "Opt-in read-only audit of a populated deployment.",
);
let tierPath: string;
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto("/");
  const firstTier = page.locator(".catalog-card").first();
  await expect(firstTier).toBeVisible({ timeout: 30_000 });
  tierPath = (await firstTier.getAttribute("href"))!;
  await page.close();
});

async function inspect(
  page: Page,
  name: string,
  outputPath: (name: string) => string,
) {
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    for (const [size, width, height] of [
      ["desktop", 1440, 1000],
      ["phone", 390, 844],
    ] as const) {
      if (
        name === "wallet-dialog" &&
        (await page.getByRole("dialog").isVisible())
      ) {
        await page.getByRole("button", { name: "Close", exact: true }).click();
      }
      await page.setViewportSize({ width, height });
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      if (name === "wallet-dialog") {
        await page
          .getByRole("button", { name: "Connect wallet", exact: true })
          .first()
          .click();
        await expect(page.getByRole("dialog")).toBeVisible();
      }
      await expect(page.locator("main")).toBeVisible();
      expect(
        await page.evaluate(
          () => getComputedStyle(document.documentElement).colorScheme,
        ),
      ).toBe(theme);
      await expect
        .poll(
          () =>
            page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
          { message: `${name}, ${theme}, ${size}: horizontal overflow` },
        )
        .toBe(false);
      const audit = new AxeBuilder({ page }).withTags([
        "wcag2a",
        "wcag2aa",
        "wcag21aa",
      ]);
      // RainbowKit 2.2.11 has decorative wallet-logo wrappers without alt text.
      // Keep the theme audit focused on contrast; do not mutate vendor markup.
      if (name === "wallet-dialog") audit.disableRules(["role-img-alt"]);
      const results = await audit.analyze();
      await page.screenshot({
        path: outputPath(`${name}-${theme}-${size}.png`),
        fullPage: name !== "wallet-dialog",
      });
      expect.soft(results.violations, `${name}, ${theme}, ${size}`).toEqual([]);
    }
  }
}

const routes = [
  ["catalog", () => "/"],
  ["about", () => "/about"],
  ["account", () => "/account"],
  ["create", () => "/create"],
  ["skill", () => "/skill"],
  ["renderer", () => "/render"],
  ["buyback-settings", () => "/chains/46630/tools/buybacks"],
  ["protocol", () => "/chains/46630/protocol"],
  ["membership", () => tierPath],
  ["management", () => `${tierPath}/manage`],
  ["artwork", () => `${tierPath}/manage/artwork`],
  ["not-found", () => "/theme-check-missing-page"],
  ["invalid-membership", () => "/chains/46630/tiers/not-an-address"],
] as const;

for (const [name, route] of routes) {
  test(`${name} supports both themes at desktop and phone widths`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(route());
    if (name !== "renderer") {
      await expect(
        page
          .getByRole("button", { name: "Connect wallet", exact: true })
          .first(),
      ).toBeEnabled();
    }
    if (name === "membership")
      await expect(page.locator(".membership-experience")).toBeVisible({
        timeout: 30_000,
      });
    if (name === "artwork")
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible(
        {
          timeout: 30_000,
        },
      );
    if (name === "buyback-settings")
      await expect(
        page.getByRole("heading", { name: "Choose a pace" }),
      ).toBeVisible({ timeout: 60_000 });
    await inspect(page, name, (file) => testInfo.outputPath(file));
  });
}

test("creator steps and wallet dialog support both themes", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  await page.goto("/create");
  await page.getByLabel("Membership name").fill("Theme review membership");
  await page.getByLabel("Symbol", { exact: true }).fill("THEME");
  for (const step of [
    "Price & period",
    "Support split",
    "Capacity",
    "Art studio",
    "Risks",
    "Review",
  ]) {
    await page
      .getByRole("button", { name: new RegExp(`^${step}$`, "i") })
      .click();
    await inspect(
      page,
      `create-${step.replaceAll(" ", "-").toLowerCase()}`,
      (file) => testInfo.outputPath(file),
    );
  }
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await inspect(page, "wallet-dialog", (file) => testInfo.outputPath(file));
});

test("populated renderer supports both themes", async ({ page }, testInfo) => {
  await installPreviewRpc(page);
  await page.goto("/render");
  await importPackage(page);
  await expect(page.getByText("Ready to preview 6 examples.")).toBeVisible();
  await page.getByRole("button", { name: "Preview 6 examples" }).click();
  await expect(
    page.getByRole("img", { name: /Membership example/i }),
  ).toHaveCount(6);
  await inspect(page, "renderer-populated", (file) =>
    testInfo.outputPath(file),
  );
});

test("membership disclosures and share dialog support both themes", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.goto(tierPath);
  await expect(page.locator(".membership-experience")).toBeVisible({
    timeout: 30_000,
  });
  for (const summary of await page.locator("details > summary").all()) {
    await summary.click();
  }
  await inspect(page, "membership-details", (file) =>
    testInfo.outputPath(file),
  );
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await inspect(page, "membership-share", (file) => testInfo.outputPath(file));
});
