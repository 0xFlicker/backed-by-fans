import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { membershipTierAbi } from "../../src/contracts";
import {
  anvilEnabled,
  anvilPublicClient,
  connectAnvilWallet,
  expectReconciled,
  installAnvilWallet,
  requiredAnvilAddress,
  revertAnvil,
  snapshotAnvil,
} from "./helpers/anvil";

test.describe("configured Anvil join, renew, and gift", () => {
  test.skip(!anvilEnabled, "Run through scripts/test-web-anvil.sh.");

  test("@anvil completes the supporter payment and gifting story", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    test.skip(
      testInfo.project.name !== "desktop",
      "One mutation is sufficient.",
    );

    const snapshot = await snapshotAnvil();
    const member = requiredAnvilAddress("member");
    const recipient = requiredAnvilAddress("giftRecipient");
    const tier = requiredAnvilAddress("tier");
    const client = anvilPublicClient();

    try {
      await installAnvilWallet(page, member);
      await page.goto(`/chains/31337/tiers/${tier}?ref=${recipient}`);
      await expect(page).toHaveURL(
        new RegExp(`/chains/31337/tiers/${tier}$`, "i"),
      );
      await expect(page.getByText(/referrer|referral/i)).toHaveCount(0);
      await page.reload();
      await connectAnvilWallet(page, member);

      const join = page.getByRole("button", { name: "Join this membership" });
      await expect(join).toBeEnabled();
      await join.click();
      await expectReconciled(page, "Join this membership");

      const tokenId = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "tokenOf",
        args: [member],
      });
      const firstExpiration = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "expiresAt",
        args: [tokenId],
      });
      const referral = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "referralOf",
        args: [tokenId],
      });
      expect(referral[1]).toBe(recipient);
      await expect(
        page
          .getByRole("region", { name: "Current membership status" })
          .getByRole("heading", { name: "Renew active membership" }),
      ).toBeVisible();

      const renew = page.getByRole("button", {
        name: "Renew active membership",
      });
      await expect(renew).toBeEnabled();
      await renew.click();
      await expectReconciled(page, "Renew active membership");
      const renewedExpiration = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "expiresAt",
        args: [tokenId],
      });
      expect(renewedExpiration - firstExpiration).toBe(2_592_000n);

      await page.getByText("Gift this membership", { exact: true }).click();
      await page.getByLabel("Recipient wallet").fill(recipient);
      await expect(page.getByText("Total").last().locator("..")).toContainText(
        "10 USDG",
      );
      const gift = page.getByRole("button", {
        name: "Send gift",
      });
      await expect(gift).toBeEnabled();
      await gift.click();
      await expectReconciled(page, "Gift 1 period");

      const recipientToken = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "tokenOf",
        args: [recipient],
      });
      expect(recipientToken).not.toBe(0n);
      await expect(
        client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "sharesOf",
          args: [recipientToken],
        }),
      ).resolves.toBe(10_000_000n);

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    } finally {
      await revertAnvil(snapshot);
    }
  });
});
