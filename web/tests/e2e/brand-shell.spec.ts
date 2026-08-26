import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("renders the exact provisional brand shell without starter identity", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Backed By Fans/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Your people make your work possible.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Backed By Fans home" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create a membership", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/working brand direction/i)).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    /vercel|next\.js template/i,
  );

  const horizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBe(false);
});

test("supports keyboard focus, skip navigation, and reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

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

test("has no automatically detectable accessibility violations", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    Promise.all(
      document.getAnimations().map((animation) => animation.finished),
    ),
  );
  const results = await new AxeBuilder({ page }).analyze();

  expect(results.violations).toEqual([]);
});

test("keeps primary actions touch-sized and supports 200% content zoom", async ({
  page,
}, testInfo) => {
  await page.goto("/");
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
      page.getByRole("heading", {
        level: 1,
        name: "Your people make your work possible.",
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      ),
    ).toBe(false);
  }
});
