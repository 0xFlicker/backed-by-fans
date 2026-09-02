import { expect, test } from "@playwright/test";
import { erc20Abi } from "viem";

import { membershipTierAbi } from "../../src/contracts";
import { formatRawTokenAmount } from "../../src/lib/token-amount";
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

const multiplierControlAbi = [
  {
    type: "function",
    name: "setUIMultiplier",
    stateMutability: "nonpayable",
    inputs: [
      { name: "multiplier", type: "uint256" },
      { name: "effectiveAtTimestamp", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

test("@anvil publishes displayed Stock Token terms as refreshed immutable raw units", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  test.skip(!anvilEnabled, "Run through scripts/test-web-anvil.sh.");
  test.skip(
    testInfo.project.name !== "desktop",
    "One publication is sufficient.",
  );
  const snapshot = await snapshotAnvil();
  const creator = requiredAnvilAddress("creator");
  const member = requiredAnvilAddress("member");
  const factory = requiredAnvilAddress("factory");
  const scaledToken = requiredAnvilAddress("scaledPaymentToken");
  const client = anvilPublicClient();

  try {
    await installAnvilWallet(page, creator);
    await page.goto("/create");
    await connectAnvilWallet(page, creator);
    await page.getByLabel("Membership name").fill("AMD After Hours");
    await page.getByLabel("Symbol").fill("AMDHR");
    await page.getByRole("button", { name: /^price & period$/i }).click();
    await page
      .getByRole("radio", { name: /AMD.*Local AMD Stock Token/i })
      .check();
    await page.getByLabel("Price per period (AMD)").fill("0.05");
    await page.getByRole("button", { name: /^risks$/i }).click();
    await page.getByRole("checkbox").nth(0).check();
    await page.getByRole("checkbox").nth(1).check();
    await page.getByRole("button", { name: /^review$/i }).click();

    await expect(page.getByText("Local AMD Stock Token (AMD)")).toBeVisible();
    await expect(page.getByText("0.05 AMD / 30 days")).toBeVisible();

    // Model a stock action after review. Publication must refresh the multiplier
    // and convert the same displayed 0.05 terms into the new nearest raw amount.
    expectSuccessfulReceipt(
      await sendContract({
        account: creator,
        address: scaledToken,
        abi: multiplierControlAbi,
        functionName: "setUIMultiplier",
        args: [2n * 10n ** 18n, 0n],
      }),
    );

    await page.getByRole("button", { name: "Publish this membership" }).click();
    await expect(
      page.getByRole("heading", { name: "Your membership is ready to share." }),
    ).toBeVisible({ timeout: 45_000 });
    const tier = (await page
      .locator(".creator-success code")
      .first()
      .innerText()) as `0x${string}`;

    await expect(
      client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "paymentToken",
      }),
    ).resolves.toBe(scaledToken);
    await expect(
      client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "pricePerPeriod",
      }),
    ).resolves.toBe(25_000_000_000_000_000n);

    await page.goto(`/chains/31337/tiers/${tier}/manage`);
    await expect(page.getByText("0.05 AMD", { exact: true })).toBeVisible();
    await expect(page.getByText("25000000000000000 units")).toBeVisible();

    // A later stock action changes only presentation. Wallet calls and contract
    // accounting continue to use the tier's immutable 0.025 raw-token price.
    expectSuccessfulReceipt(
      await sendContract({
        account: creator,
        address: scaledToken,
        abi: multiplierControlAbi,
        functionName: "setUIMultiplier",
        args: [4n * 10n ** 18n, 0n],
      }),
    );

    await page.goto(`/chains/31337/tiers/${tier}`);
    await switchAnvilAccount(page, member);
    await expect(
      page.getByText("0.1 AMD", { exact: true }).first(),
    ).toBeVisible();
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
    await page.getByRole("button", { name: "Renew active membership" }).click();
    await expectReconciled(page, "Renew active membership");
    const renewedExpiration = await client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "expiresAt",
      args: [tokenId],
    });
    expect(renewedExpiration - firstExpiration).toBe(2_592_000n);

    const rewardRow = page
      .locator(".claim-row")
      .filter({ hasText: "Membership rewards" });
    await expect(rewardRow).toContainText("0.01 AMD");
    await rewardRow
      .getByRole("button", { name: "Claim to this wallet" })
      .click();
    await expectReconciled(page, "Claim membership rewards");
    await expect(
      client.readContract({
        address: scaledToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [factory],
      }),
    ).resolves.toBe(500_000_000_000_000n);
    await expect(
      client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "pricePerPeriod",
      }),
    ).resolves.toBe(25_000_000_000_000_000n);

    await page.goto(`/chains/31337/tiers/${tier}/manage`);
    await switchAnvilAccount(page, creator);
    await expect(
      page.getByRole("heading", { name: "0.188 AMD" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Pause time increases" }).click();
    await expectReconciled(page, "Pause tier");
    await page
      .getByLabel("Membership token", { exact: true })
      .fill(tokenId.toString());
    await page.getByRole("button", { name: "Read refund preview" }).click();
    const [grossRefund, ownerTopUp] = await client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "previewRefund",
      args: [tokenId],
    });
    const refundPreview = page.locator(".refund-preview");
    const display = (raw: bigint) =>
      `${formatRawTokenAmount({
        raw,
        decimals: 18,
        multiplier: 4n * 10n ** 18n,
      })} AMD`;
    await expect(refundPreview).toContainText(display(grossRefund));
    await expect(refundPreview).toContainText(display(ownerTopUp));
    await page
      .getByRole("button", { name: "Approve exact top-up and refund" })
      .click();
    await expectReconciled(page, `Refund membership #${tokenId}`);
    await expect(
      client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "isActiveToken",
        args: [tokenId],
      }),
    ).resolves.toBe(false);
    const [paidSeconds, grantSeconds, effectiveCheckpoint] =
      await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "timeBalances",
        args: [tokenId],
      });
    expect([paidSeconds, grantSeconds]).toEqual([0n, 0n]);
    expect(effectiveCheckpoint).toBeGreaterThan(0n);
  } finally {
    await revertAnvil(snapshot);
  }
});
