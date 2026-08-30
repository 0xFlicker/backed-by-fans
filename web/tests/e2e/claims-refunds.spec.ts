import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { formatUnits, zeroAddress, type Address } from "viem";

import { membershipTierAbi, usdgAbi } from "../../src/contracts";
import {
  anvilEnabled,
  anvilPublicClient,
  connectAnvilWallet,
  expectReconciled,
  expectSuccessfulReceipt,
  installAnvilWallet,
  requiredAnvilAddress,
  revertAnvil,
  sendContract,
  snapshotAnvil,
  switchAnvilAccount,
} from "./helpers/anvil";

const localTokenControlAbi = [
  {
    type: "function",
    name: "setBlocked",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "blocked", type: "bool" },
    ],
    outputs: [],
  },
] as const;

async function seedPurchase(referrer: Address = zeroAddress) {
  const member = requiredAnvilAddress("member");
  const tier = requiredAnvilAddress("tier");
  const usdg = requiredAnvilAddress("usdg");
  expectSuccessfulReceipt(
    await sendContract({
      account: member,
      address: usdg,
      abi: usdgAbi,
      functionName: "approve",
      args: [tier, 10_000_000n],
    }),
  );
  expectSuccessfulReceipt(
    await sendContract({
      account: member,
      address: tier,
      abi: membershipTierAbi,
      functionName: "purchase",
      args: [1n, referrer],
    }),
  );
}

test.describe("configured Anvil claims and refunds", () => {
  test.skip(!anvilEnabled, "Run through scripts/test-web-anvil.sh.");

  test("@anvil pays reward and referral claims only to their fixed wallets", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    test.skip(
      testInfo.project.name !== "desktop",
      "One mutation is sufficient.",
    );
    const snapshot = await snapshotAnvil();
    const member = requiredAnvilAddress("member");
    const referrer = requiredAnvilAddress("giftRecipient");
    const tier = requiredAnvilAddress("tier");

    try {
      await installAnvilWallet(page, member);
      await seedPurchase(referrer);
      await page.goto(`/chains/31337/tiers/${tier}`);
      await connectAnvilWallet(page, member);

      const rewardRow = page
        .locator(".claim-row")
        .filter({ hasText: "Membership rewards" });
      await expect(rewardRow).toContainText("0.5 USDG");
      await rewardRow
        .getByRole("button", { name: "Claim to this wallet" })
        .click();
      await expectReconciled(page, "Claim membership rewards");
      await expect(rewardRow).toHaveCount(0);

      await switchAnvilAccount(page, referrer);
      const referralRow = page
        .locator(".claim-row")
        .filter({ hasText: "Referral proceeds" });
      await expect(referralRow).toContainText("0.1 USDG");
      const referralClaim = referralRow.getByRole("button", {
        name: "Claim to this wallet",
      });
      await expect(referralClaim).toBeEnabled();
      await referralClaim.click();
      await expectReconciled(page, "Claim referral proceeds");
      await expect(referralRow).toHaveCount(0);

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    } finally {
      await revertAnvil(snapshot);
    }
  });

  test("@anvil preserves a blocked destination's exact claim for safe retry", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    test.skip(
      testInfo.project.name !== "desktop",
      "One mutation is sufficient.",
    );
    const snapshot = await snapshotAnvil();
    const creator = requiredAnvilAddress("creator");
    const member = requiredAnvilAddress("member");
    const tier = requiredAnvilAddress("tier");
    const usdg = requiredAnvilAddress("usdg");
    const client = anvilPublicClient();

    try {
      await seedPurchase();
      expectSuccessfulReceipt(
        await sendContract({
          account: creator,
          address: usdg,
          abi: localTokenControlAbi,
          functionName: "setBlocked",
          args: [member, true],
        }),
      );
      await installAnvilWallet(page, member);
      await page.goto(`/chains/31337/tiers/${tier}`);
      await connectAnvilWallet(page, member);

      const rewardRow = page
        .locator(".claim-row")
        .filter({ hasText: "Membership rewards" });
      await expect(rewardRow).toContainText("0.5 USDG");
      await rewardRow
        .getByRole("button", { name: "Claim to this wallet" })
        .click();
      await expect(
        page
          .locator(".membership-transaction")
          .filter({ hasText: "Claim membership rewards" }),
      ).toBeVisible();
      await expect(
        page.locator(".membership-transaction.transaction-retry"),
      ).toBeVisible();
      await expect(rewardRow).toContainText("0.5 USDG");
      await expect(
        client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "claimableReward",
          args: [1n],
        }),
      ).resolves.toBe(500_000n);
      await expect(
        page.getByText(/funds remain available here/i),
      ).toBeVisible();
      await expect(rewardRow.locator("input")).toHaveCount(0);
    } finally {
      await revertAnvil(snapshot);
    }
  });

  test("@anvil previews and executes the creator's exact gross refund", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    test.skip(
      testInfo.project.name !== "desktop",
      "One mutation is sufficient.",
    );
    const snapshot = await snapshotAnvil();
    const creator = requiredAnvilAddress("creator");
    const member = requiredAnvilAddress("member");
    const tier = requiredAnvilAddress("tier");
    const client = anvilPublicClient();

    try {
      await seedPurchase();
      await installAnvilWallet(page, creator);
      await page.goto(`/chains/31337/tiers/${tier}/manage`);
      await connectAnvilWallet(page, creator);

      const readRefundPreview = page.getByRole("button", {
        name: "Read refund preview",
      });
      await page.getByLabel("Membership token", { exact: true }).fill("1");
      await expect(readRefundPreview).toBeDisabled();
      await page.getByRole("button", { name: "Pause time increases" }).click();
      await expectReconciled(page, "Pause tier");
      await expect(readRefundPreview).toBeEnabled();
      await readRefundPreview.click();
      const [grossRefund, ownerTopUp] = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "previewRefund",
        args: [1n],
      });
      const refundPreview = page.locator(".refund-preview");
      await expect(refundPreview).toContainText(
        `${formatUnits(grossRefund, 6)} USDG`,
      );
      await expect(refundPreview).toContainText(
        `${formatUnits(ownerTopUp, 6)} USDG`,
      );

      const refund = page.getByRole("button", {
        name: "Approve exact top-up and refund",
      });
      await expect(refund).toBeEnabled();
      await refund.click();
      await expectReconciled(page, "Refund membership #1");
      await expect(refundPreview).toHaveCount(0);
      await page
        .getByRole("button", { name: "Unpause time increases" })
        .click();
      await expectReconciled(page, "Unpause tier");

      const tokenId = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "tokenOf",
        args: [member],
      });
      const balances = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "timeBalances",
        args: [tokenId],
      });
      expect(balances[0]).toBe(0n);
      expect(balances[1]).toBe(0n);
      await expect(
        client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "isActive",
          args: [member],
        }),
      ).resolves.toBe(false);
    } finally {
      await revertAnvil(snapshot);
    }
  });

  test("@anvil invalidates the preview when the tier is unpaused elsewhere", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    test.skip(
      testInfo.project.name !== "desktop",
      "One mutation is sufficient.",
    );
    const snapshot = await snapshotAnvil();
    const creator = requiredAnvilAddress("creator");
    const tier = requiredAnvilAddress("tier");

    try {
      await seedPurchase();
      await installAnvilWallet(page, creator);
      await page.goto(`/chains/31337/tiers/${tier}/manage`);
      await connectAnvilWallet(page, creator);

      await page.getByRole("button", { name: "Pause time increases" }).click();
      await expectReconciled(page, "Pause tier");
      await page.getByLabel("Membership token", { exact: true }).fill("1");
      await page.getByRole("button", { name: "Read refund preview" }).click();

      const refundPreview = page.locator(".refund-preview");
      await expect(refundPreview).toBeVisible();
      expectSuccessfulReceipt(
        await sendContract({
          account: creator,
          address: tier,
          abi: membershipTierAbi,
          functionName: "setPaused",
          args: [false],
        }),
      );

      const refund = page.getByRole("button", {
        name: "Approve exact top-up and refund",
      });
      await expect(refund).toBeEnabled();
      await refund.click();
      await expect(
        page.getByText(
          "The tier is no longer paused. Pause it again and read a new refund preview.",
        ),
      ).toBeVisible();
      await expect(refundPreview).toHaveCount(0);
      await expect(refund).toBeDisabled();
    } finally {
      await revertAnvil(snapshot);
    }
  });
});
