import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { usdgAbi } from "../../src/contracts";
import {
  anvilEnabled,
  anvilPublicClient,
  connectAnvilWallet,
  expectReconciled,
  installAnvilWallet,
  requiredAnvilAddress,
  requiredAnvilRpc,
  revertAnvil,
  snapshotAnvil,
} from "./helpers/anvil";

test.describe("@anvil configured local Anvil membership", () => {
  test.skip(!anvilEnabled, "Run through scripts/test-web-anvil.sh.");

  test("renders a verified direct tier accessibly at every supported viewport", async ({
    page,
  }) => {
    await page.goto(`/chains/31337/tiers/${requiredAnvilAddress("tier")}`);

    await expect(
      page.getByRole("heading", { level: 1, name: "Local Creator Circle" }),
    ).toBeVisible();
    await expect(page.getByText("Factory-registered membership")).toBeVisible();
    await expect(page.getByText("Onchain state unavailable")).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Clear from check to reconciliation",
      }),
    ).toBeVisible();

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("renders RPC loss as unavailable and never as a zero-value membership", async ({
    page,
  }) => {
    await page.route(`${requiredAnvilRpc()}/`, (route) =>
      route.abort("connectionfailed"),
    );
    await page.goto(`/chains/31337/tiers/${requiredAnvilAddress("tier")}`);

    await expect(page.getByText("Onchain state unavailable")).toBeVisible();
    await expect(page.getByText(/0 USDG/i)).toHaveCount(0);
    await expect(
      page.getByText(/complete and reconciled onchain/i),
    ).toHaveCount(0);
  });

  test("connects an unlocked wallet and reconciles an exact-approval purchase", async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    test.skip(
      testInfo.project.name !== "desktop",
      "One mutation is sufficient.",
    );
    const snapshot = await snapshotAnvil();
    const member = requiredAnvilAddress("member");
    const tier = requiredAnvilAddress("tier");
    const usdg = requiredAnvilAddress("usdg");
    const client = anvilPublicClient();
    try {
      await installAnvilWallet(page, member);
      await page.goto(`/chains/31337/tiers/${tier}`);
      await connectAnvilWallet(page, member);
      await expect(
        page.getByText("Current allowance").locator(".."),
      ).toContainText("0 USDG");
      const readiness = page.getByRole("region", {
        name: "Fund before signing",
      });
      await expect(
        readiness.getByText("ETH for gas").locator(".."),
      ).toContainText("10000.00000");
      await expect(
        readiness.getByText("USDG balance").locator(".."),
      ).toContainText("1000");

      await page.getByRole("radio", { name: "Explicitly no referrer" }).check();
      const join = page.getByRole("button", { name: "Join this membership" });
      await expect(join).toBeEnabled();
      await join.click();

      await expectReconciled(page, "Join this membership");
      await expect(
        page
          .getByRole("region", { name: "Current membership status" })
          .getByRole("heading", { level: 2, name: "Renew active membership" }),
      ).toBeVisible();
      await expect(page.getByText("0.5 USDG · token owner only")).toBeVisible();
      await expect(
        readiness.getByText("USDG balance").locator(".."),
      ).toContainText("990");
      await expect(
        page.getByText("Current allowance").locator(".."),
      ).toContainText("0 USDG");
      await expect(
        client.readContract({
          address: usdg,
          abi: usdgAbi,
          functionName: "allowance",
          args: [member, tier],
        }),
      ).resolves.toBe(0n);

      const transactionFlow = page.locator(".transaction-flow");
      await expect(transactionFlow).toHaveAttribute(
        "aria-labelledby",
        "transaction-title",
      );
      expect(
        await transactionFlow
          .locator(".transaction-message")
          .getAttribute("role"),
      ).toBe("status");

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    } finally {
      await revertAnvil(snapshot);
    }
  });
});
