import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

import { membershipFactoryAbi } from "../../src/contracts";
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
      name: "Publish this membership",
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
        abi: membershipFactoryAbi,
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

test("@anvil rediscovers and revalidates the connected creator's permanent media", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  test.skip(!anvilEnabled, "Run through scripts/test-web-anvil.sh.");
  test.skip(
    testInfo.project.name !== "desktop",
    "One registry read is sufficient.",
  );
  const creator = requiredAnvilAddress("creator");

  await installAnvilWallet(page, creator);
  await page.goto("/create");
  await connectAnvilWallet(page, creator);
  await page.getByRole("button", { name: /^art studio$/i }).click();
  await page.getByText("Add an image", { exact: true }).click();
  const nativeMode = page.getByRole("radio", { name: /Add your image/i });
  await expect(nativeMode).toBeEnabled();
  await nativeMode.check();

  await expect(
    page.getByRole("heading", {
      name: "Choose a saved image",
    }),
  ).toBeVisible();
  await expect(page.getByText("1 saved")).toBeVisible();
  await page.getByRole("button", { name: /Use .* image/i }).click();

  await expect(
    page.getByText("Stored image selected for this membership."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Image stored",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Selected for this membership/i,
    }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("@anvil deliberately continues in memory when creative autosave is inaccessible", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  test.skip(!anvilEnabled, "Run through scripts/test-web-anvil.sh.");
  test.skip(
    testInfo.project.name !== "desktop",
    "One browser-storage recovery pass is sufficient.",
  );
  const creator = requiredAnvilAddress("creator");

  await installAnvilWallet(page, creator);
  await page.addInitScript(() => {
    const originalSetItem = Storage.prototype.setItem;
    const isStudioKey = (key: string) =>
      key.startsWith("backed-by-fans-creative-draft:");
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (isStudioKey(key)) throw new Error("Studio storage denied");
      return originalSetItem.call(this, key, value);
    };
  });
  await page.goto("/create");
  await connectAnvilWallet(page, creator);
  await page.getByRole("button", { name: /^art studio$/i }).click();

  await expect(
    page.getByRole("heading", { name: "Saved draft needs attention." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue without autosave" }).click();
  await expect(
    page.getByText("Autosave is off. Reloading will lose this draft."),
  ).toBeVisible();
  await page.getByText("Add an image", { exact: true }).click();
  await expect(
    page.getByRole("radio", { name: /Generated artwork/i }),
  ).toBeEnabled();
});

test("@anvil cancels stale local image work when the creator changes media mode", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  test.skip(!anvilEnabled, "Run through scripts/test-web-anvil.sh.");
  test.skip(
    testInfo.project.name !== "desktop",
    "One local image cancellation pass is sufficient.",
  );
  const creator = requiredAnvilAddress("creator");

  await installAnvilWallet(page, creator);
  await page.addInitScript(() => {
    const decode = window.createImageBitmap.bind(window);
    Object.defineProperty(window, "createImageBitmap", {
      configurable: true,
      value: async (source: ImageBitmapSource) => {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
        return decode(source);
      },
    });
  });
  await page.goto("/create");
  await connectAnvilWallet(page, creator);
  await page.getByRole("button", { name: /^art studio$/i }).click();

  await page.getByText("Add an image", { exact: true }).click();
  await page.getByRole("radio", { name: /Add your image/i }).check();
  await page
    .getByLabel("Choose image")
    .setInputFiles(
      resolve(process.cwd(), "public/brand/backstage-membership-hero-v1.png"),
    );
  await expect(page.getByText(/Preparing image/i)).toBeVisible();

  await page.getByRole("radio", { name: /Generated artwork/i }).check();
  await page.getByRole("radio", { name: /Add your image/i }).check();

  await expect(page.getByLabel("Choose image")).toBeEnabled();
  await expect(page.getByText(/Preparing image/i)).toHaveCount(0);
  await page.waitForTimeout(1_100);
  await expect(
    page.getByAltText("Processed creator media candidate"),
  ).toHaveCount(0);
  await expect(page.getByLabel("Choose image")).toBeEnabled();
});

test("keeps horizontal Art Studio step markers clear of dividers", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "The seven-column rail is desktop-only.",
  );
  await page.goto("/create");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /^art studio$/i }).click();
  await expect(
    page.getByRole("heading", {
      name: "Make the membership unmistakably yours.",
    }),
  ).toBeVisible();

  const markerInsets = await page
    .locator(".creator-steps li")
    .evaluateAll((items) =>
      items.map((item) => {
        const marker = item.querySelector("span");
        if (!marker) throw new Error("Creator step marker is missing.");
        return (
          marker.getBoundingClientRect().left -
          item.getBoundingClientRect().left
        );
      }),
    );

  expect(markerInsets.every((inset) => inset >= 8)).toBe(true);
});

test("expands Art Studio controls on desktop and collapses them on mobile", async ({
  page,
}, testInfo) => {
  await page.goto("/create");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /^art studio$/i }).click();
  await expect(
    page.getByRole("heading", {
      name: "Make the membership unmistakably yours.",
    }),
  ).toBeVisible();

  const geometry = await page.evaluate(() => {
    const detailsFor = (heading: string) => {
      const element = Array.from(document.querySelectorAll("h3")).find(
        (candidate) => candidate.textContent === heading,
      );
      const details = element?.closest("details");
      if (!details) throw new Error(`${heading} disclosure is missing.`);
      const bounds = details.getBoundingClientRect();
      const summary = details.querySelector(":scope > summary");
      const body = details.querySelector(":scope > div");
      if (!summary || !body) {
        throw new Error(`${heading} disclosure content is missing.`);
      }
      return {
        open: details.open,
        summaryTabIndex: (summary as HTMLElement).tabIndex,
        top: Math.round(bounds.top),
        right: Math.round(bounds.right),
        bottom: Math.round(bounds.bottom),
        left: Math.round(bounds.left),
        width: Math.round(bounds.width),
      };
    };
    return {
      artwork: detailsFor("Customize artwork"),
      image: detailsFor("Add an image"),
    };
  });

  if (testInfo.project.name === "desktop") {
    expect(geometry.artwork.open).toBe(true);
    expect(geometry.image.open).toBe(true);
    expect(geometry.artwork.summaryTabIndex).toBe(-1);
    expect(geometry.image.summaryTabIndex).toBe(-1);
    expect(Math.abs(geometry.artwork.top - geometry.image.top)).toBeLessThan(2);
    expect(geometry.artwork.right).toBeLessThanOrEqual(geometry.image.left + 2);
    expect(
      Math.abs(geometry.artwork.width - geometry.image.width),
    ).toBeLessThan(2);
    await expect(
      page.getByRole("checkbox", { name: "Show tier text" }),
    ).toBeVisible();
    await expect(
      page.getByRole("radio", { name: /Add your image/i }),
    ).toBeVisible();
  } else {
    expect(geometry.artwork.open).toBe(false);
    expect(geometry.image.open).toBe(false);
    expect(geometry.artwork.summaryTabIndex).toBe(0);
    expect(geometry.image.summaryTabIndex).toBe(0);
    expect(geometry.image.top).toBeGreaterThanOrEqual(geometry.artwork.bottom);
    await expect(
      page.getByRole("checkbox", { name: "Show tier text" }),
    ).toBeHidden();
    await expect(
      page.getByRole("radio", { name: /Add your image/i }),
    ).toBeHidden();
    await page.getByText("Customize artwork", { exact: true }).click();
  }

  await expect(
    page.getByRole("checkbox", { name: "Show tier text" }),
  ).toBeVisible();
  await expect(page.getByLabel("Show tier text numeric value")).toHaveCount(0);
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
  await expect(page.getByLabel("Price per period (USDG)")).toHaveValue("10");
  await expect(page.getByLabel("Days per period")).toHaveValue("30");

  await page.getByRole("button", { name: /^support split$/i }).click();
  await page.getByLabel("Membership rewards (%)").fill("33.33");
  await page.getByLabel("Referral share (%)").fill("65.67");
  await expect(page.getByText(/creator with referral/i)).toBeVisible();
  await expect(page.getByText("0 USDG", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /^risks$/i }).click();
  await expect(
    page.getByText(/gifts can hold capacity/i).first(),
  ).toBeVisible();
  const acknowledgements = page.getByRole("checkbox");
  await acknowledgements.nth(0).check();
  await acknowledgements.nth(1).check();

  await page.getByRole("button", { name: /^review$/i }).click();
  await expect(
    page.getByText("33.33% / 65.67%", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /publish this membership/i }),
  ).toBeDisabled();
  await expect(page.getByText(/publishing unavailable/i)).toBeVisible();
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
  const documentY = (locator: typeof reward) =>
    locator.evaluate((element) =>
      Math.round(element.getBoundingClientRect().top + window.scrollY),
    );
  const rewardBefore = await documentY(reward);
  const referralBefore = await documentY(referral);
  await reward.fill("");

  await expect(page.getByText(/use a percentage from 0 to 100/i)).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Payment split preview")).toBeVisible();

  const rewardAfter = await documentY(reward);
  const referralAfter = await documentY(referral);
  expect(Math.abs(rewardBefore - rewardAfter)).toBeLessThanOrEqual(1);
  expect(Math.abs(referralBefore - referralAfter)).toBeLessThanOrEqual(1);

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
