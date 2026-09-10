import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFile } from "node:fs/promises";

test("@anvil vesting accessibility: keyboard presets, custom correction and semantic summary", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One semantic keyboard journey is sufficient.",
  );
  test.skip(
    !process.env.BBF_ANVIL_RPC_URL,
    "Requires a configured payment asset for canonical curve units.",
  );
  await page.goto("/create");
  await expect(
    page.getByRole("button", { name: "Connect wallet", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("combobox", { name: "Membership network" })
    .selectOption("31337");
  await page.getByRole("button", { name: /^support split$/i }).click();
  const controls = page.getByRole("region", {
    name: "Reward early supporters",
  });
  const some = controls.getByRole("radio", { name: /^Some / });
  await expect(some).toBeChecked();
  await expect(controls.locator(".reward-curve-summary")).toContainText("1.5×");
  await expect(controls.locator(".reward-curve-summary")).toContainText(
    "1,000 purchased periods",
  );
  await some.focus();
  await page.keyboard.press("ArrowRight");
  const more = controls.getByRole("radio", { name: /^More / });
  await expect(more).toBeChecked();
  await expect(more).toBeFocused();
  await expect(controls.locator(".reward-curve-summary")).toContainText("3×");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(controls.getByRole("radio", { name: /^None / })).toBeChecked();
  await expect(controls.locator(".reward-curve-summary")).toContainText(
    "normal linear weight: 1×",
  );
  const custom = controls.getByRole("radio", { name: /^Custom / });
  await custom.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("Tab");
  const boost = controls.getByLabel("Starting boost (×)");
  await expect(boost).toBeFocused();
  await boost.fill("11");
  await expect(boost).toHaveAttribute("aria-invalid", "true");
  const associations = await boost.getAttribute("aria-describedby");
  expect(associations).toContain("boost-error");
  await expect(controls.getByRole("alert")).toContainText(/boost|10/i);
  await boost.fill("2.37");
  await page.keyboard.press("Tab");
  const window = controls.getByLabel(
    "Early-support window (purchased periods)",
  );
  await expect(window).toBeFocused();
  await window.fill("42");
  await expect(boost).toHaveAttribute("aria-invalid", "false");
  await expect(controls.locator(".reward-curve-summary")).toContainText(
    "2.37×",
  );
  await expect(controls.locator(".reward-curve-summary")).toContainText(
    "42 purchased periods",
  );
  await expect(controls.locator(".reward-curve-summary")).toContainText(
    "not a cash payout",
  );
  const chart = controls.locator(".reward-curve-chart");
  await expect(chart).toHaveAttribute("aria-hidden", "true");
  await expect(chart.locator("svg")).toHaveAttribute("focusable", "false");
  expect(await chart.locator("a, button, input, [tabindex]").count()).toBe(0);
  const semantics = await controls.ariaSnapshot();
  expect(semantics).not.toContain("Cumulative reward weight");
  expect(semantics).toContain("2.37×");
  expect(
    await controls.locator(".reward-curve-summary[aria-live]").count(),
  ).toBe(0);
  const axe = await new AxeBuilder({ page })
    .include(".reward-curve-controls")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
  await writeFile(
    testInfo.outputPath("vesting-keyboard-semantics.json"),
    JSON.stringify({ semantics, violations: axe.violations }, null, 2),
  );
  await controls.screenshot({
    path: testInfo.outputPath("vesting-custom-keyboard.png"),
  });
  await page.getByRole("button", { name: /^review$/i }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /^support split$/i }).focus();
  await page.keyboard.press("Enter");
  const returnedBoost = controls.getByLabel("Starting boost (×)");
  await returnedBoost.fill("");
  await returnedBoost.pressSequentially("1.5");
  await expect(returnedBoost).toBeFocused();
  await expect(returnedBoost).toHaveValue("1.5");
  await expect(
    controls.getByLabel("Early-support window (purchased periods)"),
  ).toHaveValue("42");
  await page.getByRole("button", { name: /^review$/i }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".reward-curve-summary")).toContainText("Custom.");
  await expect(page.locator(".reward-curve-summary")).toContainText("1.5×");
  await expect(page.locator(".reward-curve-summary")).toContainText(
    "42 purchased periods",
  );
});

test("@anvil vesting accessibility: motion preferences, forced colors, 200 percent text and 320px reflow", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "Explicit viewport variants cover this journey.",
  );
  test.skip(
    !process.env.BBF_ANVIL_RPC_URL,
    "Requires a configured payment asset for canonical curve units.",
  );
  await page.goto("/create");
  await expect(
    page.getByRole("button", { name: "Connect wallet", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("combobox", { name: "Membership network" })
    .selectOption("31337");
  await page.getByRole("button", { name: /^support split$/i }).click();
  const controls = page.getByRole("region", {
    name: "Reward early supporters",
  });
  const chart = controls.locator(".reward-curve-chart");
  await expect(chart).toBeVisible();
  expect(
    await chart.evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("reward-curve-enter");
  await page.emulateMedia({
    forcedColors: "active",
    reducedMotion: "no-preference",
  });
  expect(
    await chart.evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("reward-curve-enter");
  const colors = await chart.evaluate((element) => ({
    line: getComputedStyle(element.querySelector(".reward-curve-line")!).stroke,
    text: getComputedStyle(element.querySelector("text")!).fill,
  }));
  expect(colors.line).toBe(colors.text);
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "none" });
  expect(
    await chart.evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
  await controls.getByRole("radio", { name: /^Custom / }).check();
  const textZoom = await page.addStyleTag({
    content: "html { font-size: 200% !important; }",
  });
  await expect(controls.getByLabel("Starting boost (×)")).toBeVisible();
  expect(
    await controls.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  await controls.screenshot({
    path: testInfo.outputPath("vesting-text-200.png"),
  });
  await textZoom.evaluate((element) =>
    element.parentNode?.removeChild(element),
  );
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(
    controls.getByLabel("Early-support window (purchased periods)"),
  ).toBeVisible();
  // setViewportSize resolves before every responsive layout frame has run.
  // Keep the same strict width bound, using Playwright's retried assertion.
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    )
    .toBeLessThanOrEqual(1);
  await controls.screenshot({
    path: testInfo.outputPath("vesting-reflow-320.png"),
  });
});
