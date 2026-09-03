import { expect, test } from "@playwright/test";
import { getAddress } from "viem";

import { membershipTierAbi } from "../../src/contracts";
import {
  anvilEnabled,
  anvilPublicClient,
  connectAnvilWallet,
  installAnvilWallet,
  requiredAnvilAddress,
  revertAnvil,
  snapshotAnvil,
} from "./helpers/anvil";

test.describe("@anvil renderer sharing through memberships", () => {
  test.skip(!anvilEnabled, "Run through scripts/test-web-anvil.sh.");

  test("shares a renderer from one membership to another", async ({
    context,
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    test.skip(
      testInfo.project.name !== "desktop",
      "One publication journey is sufficient.",
    );

    const snapshot = await snapshotAnvil();
    const sourceTier = requiredAnvilAddress("tier");
    const receivingCreator = requiredAnvilAddress("newOwner");
    const client = anvilPublicClient();
    const renderer = await client.readContract({
      address: sourceTier,
      abi: membershipTierAbi,
      functionName: "renderer",
    });

    try {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await installAnvilWallet(page, receivingCreator);

      await page.goto(`/chains/31337/tiers/${sourceTier}`);
      await page.getByText("Contract Addresses", { exact: true }).click();
      await expect(page.getByText(renderer, { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Copy renderer address" }).click();
      await expect(
        page.getByRole("button", { name: "Renderer address copied" }),
      ).toBeVisible();

      const copiedRenderer = getAddress(
        await page.evaluate(() => navigator.clipboard.readText()),
      );
      expect(copiedRenderer).toBe(renderer);

      await page.goto("/create");
      await connectAnvilWallet(page, receivingCreator);
      await page.getByLabel("Membership name").fill("Shared renderer circle");
      await page.getByLabel("Symbol").fill("SHARED");
      await page.getByRole("button", { name: /^art studio$/i }).click();

      const rendererChooser = page.getByRole("group", { name: "Art style" });
      await rendererChooser.getByRole("radio", { name: /Custom/i }).click();
      const rendererAddress = rendererChooser.getByLabel(
        "Renderer contract address",
        { exact: true },
      );
      await rendererAddress.focus();
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.press("ControlOrMeta+V");
      await expect(rendererAddress).toHaveValue(renderer);
      await expect(rendererChooser.getByRole("status")).not.toBeEmpty({
        timeout: 30_000,
      });

      await page.getByRole("button", { name: /^risks$/i }).click();
      await page.getByRole("checkbox").nth(0).check();
      await page.getByRole("checkbox").nth(1).check();
      await page.getByRole("button", { name: /^review$/i }).click();
      await page
        .getByRole("button", { name: "Publish this membership" })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Your membership is ready to share.",
        }),
      ).toBeVisible({ timeout: 30_000 });

      const createdTier = getAddress(
        await page.locator(".creator-success code").first().innerText(),
      );
      await page.goto(`/chains/31337/tiers/${createdTier}`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Shared renderer circle" }),
      ).toBeVisible();
      await page.getByText("Contract Addresses", { exact: true }).click();
      await expect(page.getByText(renderer, { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Copy renderer address" }).click();
      await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toBe(renderer);
    } finally {
      await revertAnvil(snapshot);
    }
  });

  test("keeps the renderer address shareable when membership artwork fails", async ({
    context,
    page,
  }) => {
    const sourceTier = requiredAnvilAddress("tier");
    const client = anvilPublicClient();
    const renderer = await client.readContract({
      address: sourceTier,
      abi: membershipTierAbi,
      functionName: "renderer",
    });

    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.route("**/api/chains/31337/tiers/*/artwork*", (route) =>
      route.abort("connectionfailed"),
    );

    await page.goto(`/chains/31337/tiers/${sourceTier}`);
    await expect(
      page.getByText("Collection artwork is temporarily unavailable.", {
        exact: true,
      }),
    ).toBeVisible();

    await page.getByText("Contract Addresses", { exact: true }).click();
    await expect(page.getByText(renderer, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Copy renderer address" }).click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(renderer);
  });
});
