import { expect, test } from "@playwright/test";

import {
  anvilEnabled,
  anvilEnvironment,
  requiredAnvilAddress,
} from "./helpers/anvil";

test.describe("configured Anvil RPC behavior", () => {
  test.skip(!anvilEnabled, "Run through scripts/test-web-anvil.sh.");

  test("@anvil treats RPC loss as unavailable rather than empty state", async ({
    page,
  }) => {
    const tier = requiredAnvilAddress("tier");
    await page.route(`${anvilEnvironment.rpcUrl}/`, (route) =>
      route.abort("connectionfailed"),
    );
    await page.goto(`/tiers/${tier}`);

    await expect(page.getByText("Onchain state unavailable")).toBeVisible();
    await expect(page.getByText(/0 USDG/i)).toHaveCount(0);
    await expect(
      page.getByText("Complete and reconciled onchain."),
    ).toHaveCount(0);
  });
});
