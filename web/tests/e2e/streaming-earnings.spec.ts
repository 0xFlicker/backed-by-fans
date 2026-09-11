import { test, expect } from "@playwright/test";
import { installAnvilWallet, connectAnvilWallet } from "./helpers/anvil";

test("streams account earnings and preserves responsive accessible layout", async ({
  page,
}, info) => {
  test.skip(
    !process.env.BBF_STREAMING_REVIEW,
    "Requires the isolated streaming fork",
  );
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const wallet = "0xbE0032Fc13718aB554236c3Bd9446F6b5c9b9027";
  await installAnvilWallet(page, wallet);
  await page.goto("/account");
  await connectAnvilWallet(page, wallet);
  const rewards = page.getByRole("region", { name: "Rewards", exact: true });
  await expect(rewards.locator(".streaming-amount").first()).toBeVisible();
  await expect(rewards.locator(".account-reward-usd").first()).toContainText(
    "$",
  );
  await expect
    .poll(
      async () => {
        const amount = rewards
          .locator(".account-reward-usd .streaming-amount")
          .first();
        return (
          (await amount.locator("[aria-hidden=true]").textContent()) !==
          (await amount.locator(".sr-only").textContent())
        );
      },
      { timeout: 35000 },
    )
    .toBe(true);
  await page.screenshot({
    path: info.outputPath("account-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await rewards.screenshot({ path: info.outputPath("account-phone.png") });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await rewards
      .locator(".streaming-digit > span")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page.emulateMedia({ forcedColors: "active" });
  await expect(
    rewards.getByRole("button", { name: "Claim everything" }),
  ).toBeEnabled();
  await page.goto(
    "/chains/31337/tiers/0xD1704610ee7a2276A59273ED8eAC747cA8bB8bAE",
  );
  await expect(
    page.locator(".claim-groups .streaming-amount").first(),
  ).toBeVisible();
  await page.emulateMedia({
    forcedColors: "none",
    reducedMotion: "no-preference",
  });
  await page
    .locator(".claim-groups")
    .screenshot({ path: info.outputPath("membership-phone.png") });
  await page.goto("/chains/31337/protocol");
  await expect(
    page.locator(".asset-highlights .streaming-amount").first(),
  ).toBeVisible();
  await page
    .locator(".protocol-burn")
    .getByText("Accounting details", { exact: true })
    .click();
  await expect(
    page.locator(".protocol-funding-preview .streaming-amount").first(),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("protocol-phone.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
