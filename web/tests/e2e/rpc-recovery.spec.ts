import { expect, test } from "@playwright/test";

import {
  anvilEnabled,
  anvilEnvironment,
  requiredAnvilAddress,
} from "./helpers/anvil";

test.describe("configured Anvil RPC behavior", () => {
  test.skip(!anvilEnabled, "Run through scripts/test-web-anvil.sh.");

  test("@anvil preserves the server snapshot during browser RPC loss", async ({
    page,
  }) => {
    const tier = requiredAnvilAddress("tier");
    await page.route(`${anvilEnvironment.rpcUrl}/`, (route) =>
      route.abort("connectionfailed"),
    );
    await page.goto(`/chains/31337/tiers/${tier}`);

    await expect(
      page.getByRole("heading", { level: 1, name: "Local Creator Circle" }),
    ).toBeVisible();
    await expect(page.getByText("Onchain state unavailable")).toHaveCount(0);
    await expect(
      page.getByText("Complete and reconciled onchain."),
    ).toHaveCount(0);
  });
});
