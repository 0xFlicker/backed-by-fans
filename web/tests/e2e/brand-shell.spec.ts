import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("renders the membership catalog at the canonical homepage", async ({
  page,
  request,
}) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);
  const serverHtml = await response.text();
  expect(serverHtml).toContain("Find a membership worth joining.");
  expect(serverHtml).toContain("collection artwork");

  await page.goto("/");

  await expect(page).toHaveTitle(/Explore memberships/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Find a membership worth joining.",
    }),
  ).toBeVisible();
  await expect(page.locator(".catalog-card").first()).toBeVisible();
  await expect(page.locator(".catalog-card img").first()).toHaveAttribute(
    "src",
    /\/api\/chains\/\d+\/tiers\/0x[a-fA-F0-9]{40}\/artwork\?v=0x[a-fA-F0-9]{64}/,
  );
  await expect(page.getByRole("link", { name: "About" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Backed By Fans home" }),
  ).toBeVisible();
  const expectedSiteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    expectedSiteUrl.replace(/\/$/, ""),
  );
  await expect(page.getByText("Testnet", { exact: true })).toBeVisible();
  await expect(page.getByText(/working brand direction/i)).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    /vercel|next\.js template/i,
  );

  const horizontalOverflow = await page.evaluate(
    () => document.body.scrollWidth > document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBe(false);
});

test("explains the product on the About page", async ({ page }) => {
  await page.goto("/about");

  await expect(page).toHaveTitle(/About/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Keep it direct." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Support the work." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "The membership is the NFT.",
    }),
  ).toBeVisible();
  await expect(page.getByText("Built on Robinhood Chain.")).toBeVisible();
  await expect(page.getByText(/pay-as-you-go/i)).toBeVisible();
  await expect(page.getByText(/multiple tiers/i)).toBeVisible();
  await expect(page.getByText(/custom onchain renderer/i)).toBeVisible();
  await expect(page.getByText(/referrals can share value/i)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Explore memberships" }),
  ).toHaveAttribute("href", "/");
  await expect(
    page.getByRole("link", { name: "Create a membership" }),
  ).toHaveAttribute("href", "/create");

  const expectedSiteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${expectedSiteUrl.replace(/\/$/, "")}/about`,
  );
});

test("supports keyboard focus, skip navigation, and reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/about");

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to content" });
  await expect(skipLink).toBeFocused();
  await skipLink.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  const reducedMotion = await page.locator(".settle-in").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      animationDuration: style.animationDuration,
      transitionDuration: style.transitionDuration,
    };
  });
  expect(
    Number.parseFloat(reducedMotion.animationDuration),
  ).toBeLessThanOrEqual(0.00001);
  expect(
    Number.parseFloat(reducedMotion.transitionDuration),
  ).toBeLessThanOrEqual(0.00001);
});

for (const route of ["/", "/about"] as const) {
  test(`${route} has no automatically detectable accessibility violations`, async ({
    page,
  }) => {
    await page.goto(route);
    await page.evaluate(() =>
      Promise.allSettled(
        document
          .getAnimations()
          .filter(
            (animation) =>
              animation.timeline === document.timeline &&
              animation.effect?.getTiming().iterations !== Infinity,
          )
          .map((animation) => animation.finished),
      ),
    );
    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toEqual([]);
  });
}

test("keeps About actions touch-sized and supports 200% content zoom", async ({
  page,
}, testInfo) => {
  await page.goto("/about");
  const actions = page.locator(".button");
  for (let index = 0; index < (await actions.count()); index += 1) {
    const box = await actions.nth(index).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
  }

  if (testInfo.project.name === "desktop") {
    await page.locator("html").evaluate((element) => {
      element.style.fontSize = "200%";
    });
    await expect(
      page.getByRole("heading", { level: 1, name: "Keep it direct." }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.body.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
  }
});
