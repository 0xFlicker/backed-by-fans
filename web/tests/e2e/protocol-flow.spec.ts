import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("the About page remains accessible in dark mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/about");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("all four allocations accrue together and conserve the example payment", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/about#payment-flow");
  const time = page.getByRole("slider", { name: "Paid membership time" });
  await time.fill("0.5");
  const flow = page.locator("#payment-flow");
  await expect(flow.locator("[data-remaining]")).toHaveText("$50.00");
  await expect(flow.locator("[data-earned]")).toHaveText([
    "$35.00",
    "$10.00",
    "$2.50",
    "$2.50",
  ]);
  await time.fill("1");
  await expect(flow.locator("[data-remaining]")).toHaveText("$0.00");
  await expect(flow.locator("[data-earned]")).toHaveText([
    "$70.00",
    "$20.00",
    "$5.00",
    "$5.00",
  ]);
  await flow.getByRole("button", { name: /Protocol 5%/ }).click();
  await expect(page.locator("#flow-explanation")).toContainText(
    "Accrual is not an automatic market trade.",
  );
  await flow.getByRole("button", { name: /Referrer 5%/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#flow-explanation")).toContainText(
    "Without a referrer",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("playback advances, pauses, and respects reduced motion", async ({
  page,
}) => {
  await page.goto("/about#payment-flow");
  const time = page.getByRole("slider", { name: "Paid membership time" });
  await expect
    .poll(async () => Number(await time.inputValue()))
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Pause payment flow" }).click();
  const paused = await time.inputValue();
  await page.waitForTimeout(200);
  await expect(time).toHaveValue(paused);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(
    page.getByRole("button", { name: "Play payment flow" }),
  ).toBeHidden();
  await time.fill("0.25");
  await expect(page.locator("[data-remaining]")).toHaveText("$75.00");
});
