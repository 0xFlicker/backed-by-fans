import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("makes the renderer skill and preview route publicly discoverable", async ({
  page,
}) => {
  await page.goto("/skill");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Describe it. See it onchain.",
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Your agent prompt")).toContainText(
    /show me the representative previews before deployment/i,
  );
  await expect(
    page.getByRole("link", { name: "Preview a renderer" }),
  ).toHaveAttribute("href", "/render");
  await expect(
    page.getByRole("link", { name: "Download the complete toolkit" }),
  ).toHaveAttribute("href", "/skill/onchain-render-skill.tar.gz");

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

  const horizontalOverflow = await page.evaluate(
    () => document.body.scrollWidth > document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBe(false);

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("serves the root agent index and raw skill files", async ({ request }) => {
  const llms = await request.get("/llms.txt");
  expect(llms.ok()).toBe(true);
  expect(llms.headers()["content-type"]).toContain("text/plain");
  const llmsText = await llms.text();
  expect(llmsText).toContain("/skill/SKILL.md");
  expect(llmsText).toContain("/render");
  expect(llmsText).toContain("creator's onchain renderer list");
  expect(llmsText).not.toContain("There is no renderer registry");

  const skill = await request.get("/skill/SKILL.md");
  expect(skill.ok()).toBe(true);
  expect(await skill.text()).toContain("# Onchain Render Skill");

  const toolkit = await request.get("/skill/onchain-render-skill.tar.gz");
  expect(toolkit.ok()).toBe(true);
  expect((await toolkit.body()).byteLength).toBeGreaterThan(10_000);
});
