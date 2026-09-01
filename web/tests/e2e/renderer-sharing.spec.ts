import { expect, test } from "@playwright/test";
import { getAbiItem, getAddress, toFunctionSelector } from "viem";

import {
  onchainMetadataRendererAbi,
  membershipTierAbi,
} from "../../src/contracts";
import {
  anvilEnabled,
  anvilPublicClient,
  connectAnvilWallet,
  installAnvilWallet,
  requiredAnvilAddress,
  requiredAnvilRpc,
  revertAnvil,
  snapshotAnvil,
} from "./helpers/anvil";

const previewTokenURISelector = toFunctionSelector(
  getAbiItem({
    abi: onchainMetadataRendererAbi,
    name: "previewTokenURI",
  }),
);

type JsonRpcRequest = {
  method?: string;
  params?: readonly unknown[];
};

function isRendererArtworkRequest(request: JsonRpcRequest, renderer: string) {
  const call = request.params?.[0];
  if (
    request.method !== "eth_call" ||
    typeof call !== "object" ||
    call === null ||
    Array.isArray(call)
  ) {
    return false;
  }

  const { data, to } = call as { data?: unknown; to?: unknown };
  return (
    typeof to === "string" &&
    to.toLowerCase() === renderer.toLowerCase() &&
    typeof data === "string" &&
    data.startsWith(previewTokenURISelector)
  );
}

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
      await page.getByText("Reuse this artwork", { exact: true }).click();
      await expect(page.getByText(renderer, { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Copy renderer address" }).click();
      await expect(
        page.getByText(
          "Paste it into the renderer field for another membership.",
          { exact: true },
        ),
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

      const rendererChooser = page.getByRole("region", {
        name: "Choose the artwork renderer",
      });
      const rendererAddress = rendererChooser.getByLabel("Renderer address");
      await rendererAddress.focus();
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.press("ControlOrMeta+V");
      await expect(rendererAddress).toHaveValue(renderer);
      await rendererChooser
        .getByRole("button", { name: "Preview renderer" })
        .click();
      await expect(rendererChooser.getByRole("status")).toContainText(
        "6 of 6 representative previews are ready",
        { timeout: 30_000 },
      );

      const representativeArtwork = page
        .getByRole("heading", { name: "Representative artwork" })
        .locator("..");
      await expect(representativeArtwork.getByRole("img")).toHaveCount(6);

      await rendererChooser
        .getByRole("button", { name: "Reject renderer" })
        .click();
      await expect(
        page.getByText("Renderer rejected.", { exact: true }),
      ).toBeVisible();
      await rendererChooser
        .getByRole("button", { name: "Use this renderer" })
        .click();
      await expect(
        page.getByText("Renderer approved.", { exact: true }),
      ).toBeVisible();

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
      await page.getByText("Reuse this artwork", { exact: true }).click();
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
    await page.route(`${requiredAnvilRpc()}/`, async (route) => {
      let request: JsonRpcRequest;
      try {
        request = route.request().postDataJSON() as JsonRpcRequest;
      } catch {
        await route.continue();
        return;
      }

      if (isRendererArtworkRequest(request, renderer)) {
        await route.abort("connectionfailed");
        return;
      }
      await route.continue();
    });

    await page.goto(`/chains/31337/tiers/${sourceTier}`);
    await expect(
      page.getByText("Canonical art is temporarily unavailable.", {
        exact: true,
      }),
    ).toBeVisible();

    await page.getByText("Reuse this artwork", { exact: true }).click();
    await expect(page.getByText(renderer, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Copy renderer address" }).click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(renderer);
  });
});
