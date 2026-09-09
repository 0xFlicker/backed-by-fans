import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { zeroAddress, encodeFunctionData, type Address } from "viem";

import { membershipTierAbi, usdgAbi } from "../../src/contracts";
import { formatRawTokenAmount } from "../../src/lib/token-amount";
import {
  anvilEnabled,
  anvilPublicClient,
  connectAnvilWallet,
  expectReconciled,
  expectSuccessfulReceipt,
  installAnvilWallet,
  requiredAnvilAddress,
  requiredAnvilRpc,
  revertAnvil,
  sendContract,
  snapshotAnvil,
  switchAnvilAccount,
} from "./helpers/anvil";

const usdgDisplay = (raw: bigint) =>
  `${formatRawTokenAmount({ raw, decimals: 6, multiplier: 10n ** 18n })} USDG`;

async function seedPurchase(referrer: Address = zeroAddress) {
  const member = requiredAnvilAddress("member");
  const tier = requiredAnvilAddress("tier");
  const usdg = requiredAnvilAddress("paymentToken");
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
    const member = requiredAnvilAddress("member");
    const tier = requiredAnvilAddress("tier");
    const usdg = requiredAnvilAddress("paymentToken");
    const client = anvilPublicClient();

    try {
      await seedPurchase();
      // Labeled browser RPC fault only. Authentic USDG code/storage and all
      // successful membership proofs remain untouched; Foundry separately
      // exercises issuer-restricted token delivery.
      const claimData = encodeFunctionData({
        abi: membershipTierAbi,
        functionName: "claimReward",
        args: [1n],
      });
      await page.route(`${requiredAnvilRpc()}/`, async (route) => {
        const payload = route.request().postDataJSON();
        const requests = Array.isArray(payload) ? payload : [payload];
        const failed = (request: {
          method: string;
          params?: { to?: string; data?: string }[];
        }) =>
          request.method === "eth_call" &&
          request.params?.[0]?.to?.toLowerCase() === tier.toLowerCase() &&
          request.params?.[0]?.data === claimData;
        if (!requests.some(failed)) {
          await route.continue();
          return;
        }
        const upstream = await route.fetch();
        const data = await upstream.json();
        const responses = (Array.isArray(data) ? data : [data]).map((item) =>
          requests.some((request) => request.id === item.id && failed(request))
            ? {
                jsonrpc: "2.0",
                id: item.id,
                error: {
                  code: 3,
                  message:
                    "execution reverted: Labeled recipient delivery failure",
                  data: "0x",
                },
              }
            : item,
        );
        await route.fulfill({
          response: upstream,
          json: Array.isArray(data) ? responses : responses[0],
        });
      });
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
      await page.unroute(`${requiredAnvilRpc()}/`);
      const balanceBeforeRetry = await client.readContract({
        address: usdg,
        abi: usdgAbi,
        functionName: "balanceOf",
        args: [member],
      });
      await rewardRow
        .getByRole("button", { name: "Claim to this wallet" })
        .click();
      await expectReconciled(page, "Claim membership rewards");
      expect(
        (await client.readContract({
          address: usdg,
          abi: usdgAbi,
          functionName: "balanceOf",
          args: [member],
        })) - balanceBeforeRetry,
      ).toBe(500_000n);
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
      const components = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "previewRefundComponents",
        args: [1n],
      });
      expect(components[1]).toBeGreaterThan(0n);
      expect(components[1] + components[2] + components[3]).toBe(components[0]);
      const refundPreview = page.locator(".refund-preview");
      await expect(refundPreview).toContainText(usdgDisplay(components[1]));
      await expect(refundPreview).toContainText(usdgDisplay(components[2]));
      await expect(refundPreview).toContainText(usdgDisplay(grossRefund));
      await expect(refundPreview).toContainText(usdgDisplay(ownerTopUp));

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
