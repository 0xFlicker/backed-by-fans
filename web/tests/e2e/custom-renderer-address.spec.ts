import { expect, test } from "@playwright/test";
import { getAddress } from "viem";

import { membershipFactoryAbi, membershipTierAbi } from "../../src/contracts";
import {
  anvilEnabled,
  anvilPublicClient,
  connectAnvilWallet,
  installAnvilWallet,
  requiredAnvilAddress,
  revertAnvil,
  snapshotAnvil,
} from "./helpers/anvil";

test("@anvil copies and reuses a direct renderer", async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  test.skip(!anvilEnabled, "Run through scripts/test-web-anvil.sh.");
  test.skip(testInfo.project.name !== "desktop", "One mutation is sufficient.");

  const snapshot = await snapshotAnvil();
  const creator = requiredAnvilAddress("creator");
  const factory = requiredAnvilAddress("factory");
  const sourceTier = requiredAnvilAddress("tier");
  const client = anvilPublicClient();
  const renderer = await client.readContract({
    address: sourceTier,
    abi: membershipTierAbi,
    functionName: "renderer",
  });

  try {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await installAnvilWallet(page, creator);

    await page.goto(`/chains/31337/tiers/${sourceTier}`);
    await page.getByText("Reuse this artwork", { exact: true }).click();
    await expect(page.getByText(renderer, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Copy renderer address" }).click();

    const copiedRenderer = await page.evaluate(() =>
      navigator.clipboard.readText(),
    );
    expect(getAddress(copiedRenderer)).toBe(renderer);

    await page.goto("/create");
    await connectAnvilWallet(page, creator);
    await page.getByLabel("Membership name").fill("Direct renderer circle");
    await page.getByLabel("Symbol").fill("DIRECT");
    await page.getByRole("button", { name: /^art studio$/i }).click();

    const rendererChooser = page.getByRole("group", { name: "Art style" });
    await expect(
      rendererChooser.getByRole("radio", { name: /STACK/i }),
    ).toHaveAttribute("aria-checked", "true");
    await rendererChooser.getByRole("radio", { name: /Custom/i }).click();
    const rendererAddress = rendererChooser.getByLabel(
      "Renderer contract address",
      { exact: true },
    );
    await rendererAddress.focus();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("ControlOrMeta+V");
    await expect(rendererAddress).toHaveValue(renderer);
    await expect(rendererChooser.getByRole("combobox")).toHaveCount(0);
    await expect(rendererChooser.getByRole("status")).not.toBeEmpty({
      timeout: 30_000,
    });

    const representativeTokens = page.getByLabel(
      "Representative membership tokens",
    );
    await expect(representativeTokens.getByRole("img")).toHaveCount(3, {
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Afterglow" }).click();
    await expect(representativeTokens.getByRole("img")).toHaveCount(3, {
      timeout: 30_000,
    });

    await page.getByRole("button", { name: /^risks$/i }).click();
    await page.getByRole("checkbox").nth(0).check();
    await page.getByRole("checkbox").nth(1).check();
    await page.getByRole("button", { name: /^review$/i }).click();

    const publish = page.getByRole("button", {
      name: "Publish this membership",
    });
    await expect(publish).toBeEnabled();
    await publish.click();
    await expect(
      page.getByRole("heading", { name: "Your membership is ready to share." }),
    ).toBeVisible({ timeout: 30_000 });

    const createdTier = getAddress(
      await page.locator(".creator-success code").first().innerText(),
    );
    await expect(
      client.readContract({
        address: factory,
        abi: membershipFactoryAbi,
        functionName: "isRegisteredTier",
        args: [createdTier],
      }),
    ).resolves.toBe(true);
    await expect(
      client.readContract({
        address: createdTier,
        abi: membershipTierAbi,
        functionName: "renderer",
      }),
    ).resolves.toBe(renderer);
  } finally {
    await revertAnvil(snapshot);
  }
});
