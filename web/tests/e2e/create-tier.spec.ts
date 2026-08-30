import { expect, test } from "@playwright/test";

import { robinhoodMembershipFactoryAbi } from "../../src/contracts";
import {
  anvilEnabled,
  anvilPublicClient,
  connectAnvilWallet,
  installAnvilWallet,
  requiredAnvilAddress,
  revertAnvil,
  snapshotAnvil,
} from "./helpers/anvil";

test("@anvil deploys and shares a creator-owned tier through the production UI", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  test.skip(!anvilEnabled, "Run through scripts/test-web-anvil.sh.");
  test.skip(testInfo.project.name !== "desktop", "One mutation is sufficient.");
  const snapshot = await snapshotAnvil();
  const creator = requiredAnvilAddress("creator");
  const factory = requiredAnvilAddress("factory");
  const client = anvilPublicClient();

  try {
    await installAnvilWallet(page, creator);
    await page.goto("/create");
    await connectAnvilWallet(page, creator);
    await page.getByLabel("Membership name").fill("Anvil listening room");
    await page.getByLabel("Symbol").fill("ANVIL");
    await page.getByRole("button", { name: /^risks$/i }).click();
    await page.getByRole("checkbox").nth(0).check();
    await page.getByRole("checkbox").nth(1).check();
    await page.getByRole("button", { name: /^review$/i }).click();

    const deploy = page.getByRole("button", {
      name: "Simulate and deploy membership",
    });
    await expect(deploy).toBeEnabled();
    await deploy.click();
    await expect(
      page.getByRole("heading", { name: "Your membership is ready to share." }),
    ).toBeVisible({ timeout: 30_000 });

    const deployedTier = (await page
      .locator(".creator-success code")
      .first()
      .innerText()) as `0x${string}`;
    await expect(
      client.readContract({
        address: factory,
        abi: robinhoodMembershipFactoryAbi,
        functionName: "isRegisteredTier",
        args: [deployedTier],
      }),
    ).resolves.toBe(true);
    await page.getByRole("link", { name: "Open membership page" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Anvil listening room" }),
    ).toBeVisible();
  } finally {
    await revertAnvil(snapshot);
  }
});

test("walks through defaults, arbitrary splits, risks, and immutable review", async ({
  page,
}) => {
  await page.goto("/create");

  await expect(page.getByLabel("Membership name")).toHaveValue("");
  await expect(page.getByLabel("Membership name")).toHaveAttribute(
    "placeholder",
    "Creator membership",
  );
  await expect(page.getByLabel("Symbol")).toHaveValue("");
  await expect(page.getByLabel("Symbol")).toHaveAttribute(
    "placeholder",
    "FANS",
  );
  await page.getByLabel("Membership name").fill("Creator membership");
  await page.getByLabel("Symbol").fill("FANS");

  await page.getByRole("button", { name: /^price & period$/i }).click();
  await expect(page.getByLabel("USDG per period")).toHaveValue("10");
  await expect(page.getByLabel("Days per period")).toHaveValue("30");

  await page.getByRole("button", { name: /^support split$/i }).click();
  await page.getByLabel("Membership rewards (%)").fill("33.33");
  await page.getByLabel("Referral share (%)").fill("65.67");
  await expect(page.getByText(/creator · referred/i)).toBeVisible();
  await expect(page.getByText("0 USDG", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /^risks$/i }).click();
  await expect(page.getByText(/permissionless gifts/i).first()).toBeVisible();
  const acknowledgements = page.getByRole("checkbox");
  await acknowledgements.nth(0).check();
  await acknowledgements.nth(1).check();

  await page.getByRole("button", { name: /^review$/i }).click();
  await expect(
    page.getByText("33.33% / 65.67%", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /simulate and deploy/i }),
  ).toBeDisabled();
  await expect(page.getByText(/writes are unavailable/i)).toBeVisible();
});

test("rejects invalid split totals before signing without losing input", async ({
  page,
}) => {
  await page.goto("/create");
  await page.getByRole("button", { name: /^support split$/i }).click();
  await page.getByLabel("Membership rewards (%)").fill("60");
  await page.getByLabel("Referral share (%)").fill("40");
  await expect(page.getByText(/cannot exceed 100/i)).toBeVisible();

  await page.getByRole("button", { name: /^identity$/i }).click();
  await page.getByLabel("Membership name").fill("The listening room");
  await page.getByRole("button", { name: /^support split$/i }).click();
  await expect(page.getByLabel("Membership rewards (%)")).toHaveValue("60");
  await page.getByRole("button", { name: /^identity$/i }).click();
  await expect(page.getByLabel("Membership name")).toHaveValue(
    "The listening room",
  );
});

test("treats an emptied split as zero without shifting its paired input", async ({
  page,
}) => {
  await page.goto("/create");
  await page.getByRole("button", { name: /^support split$/i }).click();

  const reward = page.getByLabel("Membership rewards (%)");
  const referral = page.getByLabel("Referral share (%)");
  const rewardBefore = await reward.boundingBox();
  const referralBefore = await referral.boundingBox();
  await reward.fill("");

  await expect(page.getByText(/use a percentage from 0 to 100/i)).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Payment split preview")).toBeVisible();

  const rewardAfter = await reward.boundingBox();
  const referralAfter = await referral.boundingBox();
  expect(rewardBefore).not.toBeNull();
  expect(referralBefore).not.toBeNull();
  expect(rewardAfter).not.toBeNull();
  expect(referralAfter).not.toBeNull();
  expect(Math.abs(rewardBefore!.y - rewardAfter!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(referralBefore!.y - referralAfter!.y)).toBeLessThanOrEqual(1);

  await referral.focus();
  await expect(reward).toHaveValue("0");
});

test("keeps creator setup keyboard reachable and responsive", async ({
  page,
}) => {
  await page.goto("/create");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);

  const controls = page.locator("button, input, textarea");
  for (
    let index = 0;
    index < Math.min(await controls.count(), 12);
    index += 1
  ) {
    const box = await controls.nth(index).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
});
