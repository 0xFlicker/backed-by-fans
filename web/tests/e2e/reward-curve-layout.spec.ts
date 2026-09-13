import { expect, test } from "@playwright/test";
import {
  anvilEnabled,
  connectAnvilWallet,
  installAnvilWallet,
  requiredAnvilAddress,
} from "./helpers/anvil";

test("@anvil reward curve stays in place, morphs and respects reduced motion", async ({
  page,
}, info) => {
  test.skip(
    !anvilEnabled || info.project.name !== "desktop",
    "Uses the configured local creator preview.",
  );
  await page.emulateMedia({
    colorScheme: "dark",
    reducedMotion: "no-preference",
  });
  const creator = requiredAnvilAddress("creator");
  await installAnvilWallet(page, creator);
  await page.goto("/create");
  await connectAnvilWallet(page, creator);
  await page.getByRole("button", { name: /^support split$/i }).click();
  const controls = page.getByRole("region", {
    name: "Reward early supporters",
  });
  const chart = controls.locator(".reward-curve-chart");
  const line = chart.locator(".reward-curve-line");
  await expect(chart).toBeVisible();
  const belowChart = () =>
    controls.evaluate((node) =>
      Array.from(
        node.querySelectorAll(
          ".reward-curve-summary > p, :scope > .small-copy",
        ),
      ).map((row) => row.getBoundingClientRect().top + window.scrollY),
    );
  const stableRows = await belowChart();
  for (const preset of ["None", "Some", "More", "None"]) {
    await controls
      .getByRole("radio", { name: new RegExp(`^${preset}`, "i") })
      .check();
    const rows = await belowChart();
    rows.forEach((position, index) =>
      expect(position).toBeCloseTo(stableRows[index], 0),
    );
  }
  const original = await chart.elementHandle();
  const y = () =>
    chart.evaluate((node) => node.getBoundingClientRect().top + window.scrollY);
  const top = await y();
  await controls.getByRole("radio", { name: /^none/i }).check();
  await expect
    .poll(async () => original!.evaluate((node) => node.isConnected))
    .toBe(true);
  expect(await y()).toBeCloseTo(top, 0);
  await controls.getByRole("radio", { name: /^more/i }).check();
  const moving = await line.evaluate(
    (node) =>
      new Promise<string | null>((resolve) =>
        setTimeout(() => resolve(node.getAttribute("points")), 100),
      ),
  );
  await expect.poll(() => line.getAttribute("points")).not.toBe(moving);
  expect(await y()).toBeCloseTo(top, 0);
  await controls.getByRole("radio", { name: /^custom/i }).check();
  const boost = controls.getByLabel("Starting boost (×)");
  const windowInput = controls.getByLabel(
    "Early-support window (purchased periods)",
  );
  expect(await y()).toBeCloseTo(top, 0);
  const bounds = await boost.boundingBox();
  const windowBounds = await windowInput.boundingBox();
  expect(bounds!.y).toBeCloseTo(windowBounds!.y, 0);
  expect(bounds!.height).toBeCloseTo(windowBounds!.height, 0);
  expect(bounds!.y).toBeGreaterThan(
    (await chart.boundingBox())!.y + (await chart.boundingBox())!.height,
  );
  await boost.fill("");
  await expect(chart).toBeVisible();
  expect(await original!.evaluate((node) => node.isConnected)).toBe(true);
  await boost.fill("3");
  await controls.screenshot({
    path: info.outputPath("curve-custom-desktop.png"),
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await controls.getByRole("radio", { name: /^none/i }).check();
  const immediate = await line.getAttribute("points");
  const afterFrames = await line.evaluate(
    (node) =>
      new Promise<string | null>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve(node.getAttribute("points"))),
        ),
      ),
  );
  expect(afterFrames).toBe(immediate);
  await controls.getByRole("radio", { name: /^custom/i }).check();
  await expect(controls.getByRole("radio", { name: /^custom/i })).toBeChecked();
  await page.setViewportSize({ width: 320, height: 780 });
  const layout = await controls.evaluate((node) => ({
    width: node.clientWidth,
    scroll: node.scrollWidth,
    right: node.getBoundingClientRect().right,
    viewport: innerWidth,
  }));
  expect(layout.scroll).toBeLessThanOrEqual(layout.width);
  expect(layout.right).toBeLessThanOrEqual(layout.viewport);
  await controls.screenshot({
    path: info.outputPath("curve-custom-mobile.png"),
  });
  await controls.getByRole("radio", { name: /^some/i }).check();
  const narrowRows = await belowChart();
  for (const preset of ["None", "More", "Some"]) {
    await controls
      .getByRole("radio", { name: new RegExp(`^${preset}`, "i") })
      .check();
    (await belowChart()).forEach((position, index) =>
      expect(position).toBeCloseTo(narrowRows[index], 0),
    );
  }
});
