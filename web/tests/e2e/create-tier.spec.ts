import { formatRawTokenAmount } from "../../src/lib/token-amount";
import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";

import { erc20Abi, parseEventLogs, encodeFunctionData } from "viem";
import { membershipFactoryAbi, membershipTierAbi } from "../../src/contracts";
import {
  anvilEnabled,
  anvilPublicClient,
  connectAnvilWallet,
  expectReconciled,
  expectSuccessfulReceipt,
  rpcRequest,
  sendContract,
  switchAnvilAccount,
  installAnvilWallet,
  requiredAnvilAddress,
  revertAnvil,
  snapshotAnvil,
} from "./helpers/anvil";

async function expectOriginalRenderer(page: Page) {
  const styles = page.getByRole("radiogroup", { name: "Art styles" });
  await expect(styles.getByRole("radio", { name: /STACK/i })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(styles.getByRole("radio", { name: /CUSTOM/i })).toBeVisible();
  await expect(
    page.getByLabel("Renderer contract address", { exact: true }),
  ).toHaveCount(0);
}

for (const protocolPercent of ["1", "12.34", "100"]) {
  test(`@anvil deploys and shares a creator-owned tier with ${protocolPercent}% protocol allocation`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000);
    test.skip(!anvilEnabled, "Run through scripts/test-web-anvil.sh.");
    test.skip(
      testInfo.project.name !== "desktop",
      "One mutation is sufficient.",
    );
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
      if (protocolPercent === "100")
        await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("button", { name: /^support split$/i }).click();
      const allocation = page.getByLabel("Protocol allocation (%)");
      await expect(allocation).toHaveValue("1");
      await allocation.fill("");
      await allocation.pressSequentially(protocolPercent);
      if (protocolPercent === "100") {
        await expect(page.getByText(/cannot exceed 100%/i)).toBeVisible();
        await page.getByLabel("Membership rewards (%)").fill("0");
        await page.getByLabel("Referral share (%)").fill("0");
        await expect(page.getByText(/cannot exceed 100%/i)).toHaveCount(0);
        await expect(
          page.getByText(/At 100%, creator proceeds/i),
        ).toBeVisible();
      }
      await page.getByRole("button", { name: /^art studio$/i }).click();
      await expectOriginalRenderer(page);
      await page.getByRole("button", { name: /^risks$/i }).click();
      await page.getByRole("checkbox").nth(0).check();
      await page.getByRole("button", { name: /^review$/i }).click();

      const deploy = page.getByRole("button", {
        name: "Publish this membership",
      });
      await expect(deploy).toBeEnabled();
      await deploy.click();
      await expect(
        page.getByRole("heading", {
          name: "Your membership is ready to share.",
        }),
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
      await expect(
        client.readContract({
          address: deployedTier,
          abi: membershipTierAbi,
          functionName: "protocolFeeBps",
        }),
      ).resolves.toBe(Math.round(Number(protocolPercent) * 100));
      await page.getByRole("link", { name: "Open membership page" }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: "Anvil listening room" }),
      ).toBeVisible();
      if (protocolPercent === "100") {
        const member = requiredAnvilAddress("member");
        const collector = requiredAnvilAddress("freshWallet");
        const asset = requiredAnvilAddress("paymentToken");
        const vault = await client.readContract({
          address: factory,
          abi: membershipFactoryAbi,
          functionName: "buybackVault",
        });
        await switchAnvilAccount(page, member);
        await page.getByLabel("Periods", { exact: true }).fill("12");
        await page
          .getByRole("button", { name: "Join this membership" })
          .click();
        await expectReconciled(page, "Join this membership");
        const tokenId = await client.readContract({
          address: deployedTier,
          abi: membershipTierAbi,
          functionName: "tokenOf",
          args: [member],
        });
        const expires = await client.readContract({
          address: deployedTier,
          abi: membershipTierAbi,
          functionName: "expiresAt",
          args: [tokenId],
        });
        const period = await client.readContract({
          address: deployedTier,
          abi: membershipTierAbi,
          functionName: "periodDuration",
        });
        await rpcRequest("evm_setNextBlockTimestamp", [
          Number(expires - 9n * period),
        ]);
        await rpcRequest("evm_mine");
        // Settled accounting remains at purchase until permissionless processing.
        const pending = await client.readContract({
          address: deployedTier,
          abi: membershipTierAbi,
          functionName: "allocationState",
          args: [tokenId],
        });
        expect(pending.unearnedScaled[3]).toBe(120_000_000n * (1n << 128n));
        expect(pending.earnedScaled[3]).toBe(0n);
        expect(pending.status.complete).toBe(false);
        await expect(
          client.readContract({
            address: deployedTier,
            abi: membershipTierAbi,
            functionName: "protocolFeeEarnedHeld",
          }),
        ).resolves.toBe(0n);
        await expect(
          client.readContract({
            address: asset,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [vault],
          }),
        ).resolves.toBe(0n);
        const processing = await sendContract({
          account: collector,
          address: deployedTier,
          abi: membershipTierAbi,
          functionName: "processAccounting",
          args: [25n],
        });
        expectSuccessfulReceipt(processing);
        expectSuccessfulReceipt(
          await sendContract({
            account: collector,
            address: deployedTier,
            abi: membershipTierAbi,
            functionName: "releaseProtocolFees",
          }),
        );
        const released = await client.readContract({
          address: asset,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [vault],
        });
        const processedAt = (
          await client.getBlock({ blockNumber: processing.blockNumber })
        ).timestamp;
        const scale = 1n << 128n;
        const rate = (120_000_000n * scale) / (12n * period);
        expect(released).toBe(
          (rate * (processedAt - (expires - 12n * period))) / scale,
        );
        await expect(
          client.readContract({
            address: asset,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [vault],
          }),
        ).resolves.toBe(released);
        await page.goto(`/chains/31337/tiers/${deployedTier}/manage`);
        await switchAnvilAccount(page, creator);
        await page
          .getByRole("button", { name: "Pause time increases" })
          .click();
        await expectReconciled(page, "Pause tier");
        await page
          .getByLabel("Membership token", { exact: true })
          .fill(tokenId.toString());
        await page.getByRole("button", { name: "Read refund preview" }).click();
        const funding = await client.readContract({
          address: deployedTier,
          abi: membershipTierAbi,
          functionName: "previewRefund",
          args: [tokenId],
        });
        expect(funding.grossRefund).toBeGreaterThan(0n);
        expect(funding.fundingScaled[3]).toBe(
          funding.grossRefund * (1n << 128n),
        );
        expect(funding.fundingScaled.slice(0, 3)).toEqual([0n, 0n, 0n]);
        const creatorBefore = await client.readContract({
          address: asset,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [creator],
        });
        await expect(page.locator(".refund-preview[aria-live]")).toContainText(
          "Reserved unused membership payments",
        );
        await page.getByRole("button", { name: "Refund unused time" }).click();
        await expectReconciled(page, `Refund membership #${tokenId}`);
        await expect(
          client.readContract({
            address: asset,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [creator],
          }),
        ).resolves.toBe(creatorBefore);
        await expect(
          client.readContract({
            address: asset,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [vault],
          }),
        ).resolves.toBe(released);
        const remaining = await client.readContract({
          address: deployedTier,
          abi: membershipTierAbi,
          functionName: "timeBalances",
          args: [tokenId],
        });
        expect(remaining[0]).toBe(0n);
        const after = await client.readContract({
          address: deployedTier,
          abi: membershipTierAbi,
          functionName: "allocationState",
          args: [tokenId],
        });
        expect(after.generation).toBe(1n);
        expect(after.unearnedScaled[3]).toBe(0n);
      }
    } finally {
      await revertAnvil(snapshot);
    }
  });
}

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
  await expectOriginalRenderer(page);
  await page.getByText("Add an image", { exact: true }).click();

  await expect(
    page.getByRole("heading", {
      name: "Images",
    }),
  ).toBeVisible();
  const savedImage = page.getByRole("button", {
    name: "Select saved image 1",
  });
  await expect(savedImage.locator("img")).toBeVisible();
  await savedImage.click();
  await expect(
    page.getByRole("button", {
      name: "Selected saved image 1",
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Image placement")).toBeVisible();
  await expect(
    page.getByText("Stored image selected for this membership."),
  ).toHaveCount(0);
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
  await expectOriginalRenderer(page);
  await page.getByText("Add an image", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Using generated artwork" }),
  ).toBeDisabled();
  await expect(page.getByLabel("Add new image")).toBeEnabled();
});

test("@anvil uploads an image without a media-mode gate and can return to generated artwork", async ({
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
  await page.goto("/create");
  await connectAnvilWallet(page, creator);
  await page.getByRole("button", { name: /^art studio$/i }).click();
  await expectOriginalRenderer(page);

  await page.getByText("Add an image", { exact: true }).click();
  await page
    .getByLabel("Add new image")
    .setInputFiles(
      resolve(process.cwd(), "public/brand/backstage-membership-hero-v1.png"),
    );
  await expect(page.getByAltText("New image")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Use generated artwork" }).click();
  await expect(page.getByAltText("New image")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Using generated artwork" }),
  ).toBeDisabled();
  await expect(page.getByLabel("Add new image")).toBeEnabled();
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
  await expectOriginalRenderer(page);

  const geometry = await page.evaluate(() => {
    const studio = document.querySelector<HTMLElement>("[data-creator-studio]");
    if (!studio) throw new Error("Creator Studio is missing.");
    const workbench = studio.children.item(1);
    if (!(workbench instanceof HTMLElement)) {
      throw new Error("Creator Studio workbench is missing.");
    }
    const studioBounds = studio.getBoundingClientRect();
    const workbenchBounds = workbench.getBoundingClientRect();
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
      contained:
        workbenchBounds.left >= studioBounds.left - 1 &&
        workbenchBounds.right <= studioBounds.right + 1,
      pageHasHorizontalOverflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    };
  });

  expect(geometry.contained).toBe(true);
  expect(geometry.pageHasHorizontalOverflow).toBe(false);

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
    await expect(page.getByLabel("Add new image")).toBeVisible();
  } else {
    expect(geometry.artwork.open).toBe(false);
    expect(geometry.image.open).toBe(false);
    expect(geometry.artwork.summaryTabIndex).toBe(0);
    expect(geometry.image.summaryTabIndex).toBe(0);
    expect(geometry.image.top).toBeGreaterThanOrEqual(geometry.artwork.bottom);
    await expect(
      page.getByRole("checkbox", { name: "Show tier text" }),
    ).toBeHidden();
    await expect(page.getByLabel("Add new image")).toBeHidden();
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
  await expect(
    page.getByRole("textbox", { name: /^Price per period/ }),
  ).toHaveValue("10");
  await expect(page.getByLabel("Days per period")).toHaveValue("30");

  await page.getByRole("button", { name: /^support split$/i }).click();
  await page.getByLabel("Membership rewards (%)").fill("33.33");
  await page.getByLabel("Referral share (%)").fill("65.67");

  await page.getByRole("button", { name: /^risks$/i }).click();
  await expect(
    page.getByText(/gifted memberships count toward your capacity/i).first(),
  ).toBeVisible();
  const acknowledgements = page.getByRole("checkbox");
  await acknowledgements.nth(0).check();

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
  // Token-amount previews require an accepted token on a deployed protocol.
  // This standalone form check covers normalization and layout without one.
  await expect(reward).toHaveValue("");

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

// This journey also runs against the disposable split-deployment rehearsal.
// It needs only the real local factory, asset and two funded unlocked accounts.
test("@anvil reward-curves publishes all presets and confirms execution-time weight", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  test.skip(
    !process.env.BBF_ANVIL_RPC_URL,
    "Requires a configured local chain.",
  );
  test.skip(
    testInfo.project.name !== "desktop",
    "One publication sequence is sufficient.",
  );
  const creator = requiredAnvilAddress("creator");
  const member = requiredAnvilAddress("member");
  const asset = requiredAnvilAddress("paymentToken");
  const client = anvilPublicClient();
  const checkpoint = await snapshotAnvil();
  const evidence: unknown[] = [];
  try {
    await installAnvilWallet(page, creator);
    for (const [preset, boost, periods] of [
      ["None", 10000, 0n],
      ["Some", 15000, 1000n],
      ["More", 30000, 1000n],
      ["Custom", 23700, 2n],
    ] as const) {
      await page.goto("/create");
      await page
        .getByRole("combobox", { name: "Membership network" })
        .selectOption("31337");
      await connectAnvilWallet(page, creator);
      await page.getByLabel("Membership name").fill(`Curve ${preset}`);
      await page.getByLabel("Symbol", { exact: true }).fill("CURVE");
      await page.getByRole("button", { name: /^support split$/i }).click();
      await page.getByRole("radio", { name: new RegExp(`^${preset}`) }).check();
      if (preset === "Custom") {
        await page
          .getByLabel("Starting boost (×)", { exact: true })
          .fill("2.37");
        await page
          .getByLabel("Early-support window (purchased periods)", {
            exact: true,
          })
          .fill("2");
      }
      await page.getByRole("button", { name: /^risks$/i }).click();
      await page.getByRole("checkbox").nth(0).check();
      await page.getByRole("button", { name: /^review$/i }).click();
      const publish = page.getByRole("button", {
        name: "Publish this membership",
      });
      await expect(publish).toBeEnabled({ timeout: 30_000 });
      await publish.click();
      await expect(
        page.getByRole("heading", {
          name: "Your membership is ready to share.",
        }),
      ).toBeVisible({ timeout: 45_000 });
      const tier = (await page
        .locator(".creator-success code")
        .first()
        .innerText()) as `0x${string}`;
      const price = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "pricePerPeriod",
      });
      await expect(
        client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "startingBoostBps",
        }),
      ).resolves.toBe(boost);
      await expect(
        client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "earlySupportGross",
        }),
      ).resolves.toBe(price * periods);
      evidence.push({
        preset,
        tier,
        startingBoostBps: boost,
        earlySupportGross: String(price * periods),
      });
      if (preset !== "Custom") continue;
      for (const account of [creator, member]) {
        expectSuccessfulReceipt(
          await sendContract({
            account,
            address: asset,
            abi: erc20Abi,
            functionName: "approve",
            args: [tier, price * 10n],
          }),
        );
      }
      await page.getByRole("link", { name: "Open membership page" }).click();
      await page.getByLabel("Periods", { exact: true }).fill("2");
      const before = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "previewShares",
        args: [price * 2n],
      });
      await expect(
        page.getByText(
          `Estimated new reward weight: ${formatRawTokenAmount({ raw: before.sharesAdded, decimals: 6, multiplier: 10n ** 18n })} shares (1.685× average).`,
        ),
      ).toBeVisible();
      const paymentData = encodeFunctionData({
        abi: membershipTierAbi,
        functionName: "purchase",
        args: [2n, "0x0000000000000000000000000000000000000000"],
      });
      let intervened = false;
      let paymentHash: `0x${string}` | undefined;
      await page.route(process.env.BBF_ANVIL_RPC_URL!, async (route) => {
        const body = route.request().postDataJSON();
        if (
          body.method === "eth_sendTransaction" &&
          body.params[0].data === paymentData &&
          body.params[0].to?.toLowerCase() === tier.toLowerCase()
        ) {
          expect(intervened).toBe(false);
          intervened = true;
          expectSuccessfulReceipt(
            await sendContract({
              account: member,
              address: tier,
              abi: membershipTierAbi,
              functionName: "purchase",
              args: [1n, "0x0000000000000000000000000000000000000000"],
            }),
          );
          const response = await route.fetch();
          paymentHash = (await response.json()).result;
          await route.fulfill({ response });
        } else await route.continue();
      });
      await page
        .getByRole("button", { name: "Join this membership", exact: true })
        .click();
      await expectReconciled(page, "Join this membership");
      expect(intervened).toBe(true);
      expect(paymentHash).toBeDefined();
      const receipt = await client.getTransactionReceipt({
        hash: paymentHash!,
      });
      expectSuccessfulReceipt(receipt);
      const issued = parseEventLogs({
        abi: membershipTierAbi,
        eventName: "SharesIssued",
        logs: receipt.logs,
      }).find((log) => log.address.toLowerCase() === tier.toLowerCase())!.args;
      expect(issued.amount).toBeLessThan(before.sharesAdded);
      await expect(
        page.getByText(
          `Actual new reward weight: ${formatRawTokenAmount({ raw: issued.amount, decimals: 6, multiplier: 10n ** 18n })} shares. Cash rewards vest over paid membership time.`,
        ),
      ).toBeVisible();
      await expect(
        client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "lifetimeGross",
        }),
      ).resolves.toBe(price * 3n);
      evidence.push({
        quoted: String(before.sharesAdded),
        actual: String(issued.amount),
        tokenShares: String(issued.tokenShares),
        paymentHash,
      });
      await page.unroute(process.env.BBF_ANVIL_RPC_URL!);
    }
    const evidencePath = testInfo.outputPath(
      "curve-publication-and-inclusion.json",
    );
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
    await testInfo.attach("curve-publication-and-inclusion.json", {
      path: evidencePath,
      contentType: "application/json",
    });
  } finally {
    await revertAnvil(checkpoint);
  }
});
