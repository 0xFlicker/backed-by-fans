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
    await expect(page.getByText("Contract Addresses")).toBeVisible();
    await expect(page.getByText("Onchain state unavailable")).toHaveCount(0);
    await expect(page.locator(".membership-transaction")).toHaveCount(0);

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

  test("gives the connected creator a direct path to tier management", async ({
    page,
  }) => {
    const creator = requiredAnvilAddress("creator");
    const tier = requiredAnvilAddress("tier");
    await installAnvilWallet(page, creator);
    await page.goto(`/chains/31337/tiers/${tier}`);
    await connectAnvilWallet(page, creator);

    const manage = page.getByRole("link", { name: "Manage membership" });
    await expect(manage).toHaveAttribute(
      "href",
      `/chains/31337/tiers/${tier}/manage`,
    );
    await manage.click();

    await expect(page).toHaveURL(`/chains/31337/tiers/${tier}/manage`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Local Creator Circle" }),
    ).toBeVisible();
    await expect(page.getByText("This wallet operates the tier")).toBeVisible();
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
      await expect(page.getByText(/exact 10 USDG approval/i)).toBeVisible();

      const join = page.getByRole("button", { name: "Join this membership" });
      await expect(join).toBeEnabled();
      await join.click();

      await expectReconciled(page, "Join this membership");
      await expect(
        page
          .getByRole("region", { name: "Current membership status" })
          .getByRole("heading", { level: 2, name: "Renew active membership" }),
      ).toBeVisible();
      await expect(
        page.locator(".claim-row").filter({ hasText: "Membership rewards" }),
      ).toContainText("0.5 USDG");
      await expect(
        client.readContract({
          address: usdg,
          abi: usdgAbi,
          functionName: "allowance",
          args: [member, tier],
        }),
      ).resolves.toBe(0n);

      await expect(
        page.locator(".membership-transaction.transaction-confirmed"),
      ).toHaveAttribute("role", "status");

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    } finally {
      await revertAnvil(snapshot);
    }
  });
});
