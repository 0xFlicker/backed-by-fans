import { expect, test } from "@playwright/test";
import { formatUnits, zeroAddress } from "viem";

import {
  robinhoodMembershipFactoryAbi,
  membershipTierAbi,
  usdgAbi,
} from "../../src/contracts";
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

const tier = "0x2222222222222222222222222222222222222222";

test("@anvil operates every mutable tier control and completes two-step ownership", async ({
  page,
}, testInfo) => {
  test.setTimeout(150_000);
  test.skip(!anvilEnabled, "Run through scripts/test-web-anvil.sh.");
  test.skip(testInfo.project.name !== "desktop", "One mutation is sufficient.");
  const snapshot = await snapshotAnvil();
  const creator = requiredAnvilAddress("creator");
  const member = requiredAnvilAddress("member");
  const recipient = requiredAnvilAddress("giftRecipient");
  const newOwner = requiredAnvilAddress("newOwner");
  const configuredTier = requiredAnvilAddress("tier");
  const usdg = requiredAnvilAddress("usdg");
  const client = anvilPublicClient();

  try {
    expectSuccessfulReceipt(
      await sendContract({
        account: member,
        address: usdg,
        abi: usdgAbi,
        functionName: "approve",
        args: [configuredTier, 10_000_000n],
      }),
    );
    expectSuccessfulReceipt(
      await sendContract({
        account: member,
        address: configuredTier,
        abi: membershipTierAbi,
        functionName: "purchase",
        args: [1n, zeroAddress],
      }),
    );

    await installAnvilWallet(page, creator);
    await page.goto(`/chains/31337/tiers/${configuredTier}/manage`);
    await connectAnvilWallet(page, creator);
    await expect(page.getByText("This wallet operates the tier")).toBeVisible();

    await page.getByLabel("Supply cap · 0 unlimited").fill("4");
    await page.getByRole("button", { name: "Update capacity" }).click();
    await expectReconciled(page, "Update supply cap");
    await page.getByLabel("Maximum prepaid periods · 0 unlimited").fill("6");
    await page.getByRole("button", { name: "Update prepayment" }).click();
    await expectReconciled(page, "Update prepayment limit");

    await page
      .getByLabel("Description")
      .fill("Updated through the production management flow.");
    await page.getByRole("button", { name: "Update metadata" }).click();
    await expectReconciled(page, "Update tier presentation");

    await page.getByRole("button", { name: "Pause time increases" }).click();
    await expectReconciled(page, "Pause tier");
    await expect(
      page.getByRole("heading", { name: "Time increases paused" }),
    ).toBeVisible();
    await page.getByLabel("Recipient").fill(recipient);
    await expect(
      page.getByRole("button", { name: "Grant blocked while paused" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Unpause time increases" }).click();
    await expectReconciled(page, "Unpause tier");

    await page.getByRole("button", { name: "Grant time", exact: true }).click();
    await expectReconciled(page, "Grant complimentary time");
    const grantedToken = await client.readContract({
      address: configuredTier,
      abi: membershipTierAbi,
      functionName: "tokenOf",
      args: [recipient],
    });
    await page
      .getByLabel("Membership token to revoke")
      .fill(grantedToken.toString());
    await page.getByRole("button", { name: "Revoke grant time" }).click();
    await expectReconciled(page, "Revoke remaining grant time");

    await page
      .getByRole("button", { name: "Withdraw to current owner" })
      .click();
    await expectReconciled(page, "Withdraw creator proceeds");
    await expect(
      client.readContract({
        address: configuredTier,
        abi: membershipTierAbi,
        functionName: "creatorProceeds",
      }),
    ).resolves.toBe(0n);

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
      address: configuredTier,
      abi: membershipTierAbi,
      functionName: "previewRefund",
      args: [1n],
    });
    const refundPreview = page.locator(".refund-preview");
    await expect(
      refundPreview.getByText("Gross refund").locator(".."),
    ).toContainText(`${formatUnits(grossRefund, 6)} USDG`);
    await expect(
      refundPreview.getByText("Exact owner top-up").locator(".."),
    ).toContainText(`${formatUnits(ownerTopUp, 6)} USDG`);
    await page
      .getByRole("button", { name: "Approve exact top-up and refund" })
      .click();
    await expectReconciled(page, "Refund membership #1");
    await expect(refundPreview).toHaveCount(0);
    await page.getByRole("button", { name: "Unpause time increases" }).click();
    await expectReconciled(page, "Unpause tier");

    await page.getByLabel("New creator owner").fill(newOwner);
    await page.getByRole("button", { name: "Name pending owner" }).click();
    await expectReconciled(page, "Start ownership transfer");
    await switchAnvilAccount(page, newOwner);
    const accept = page.getByRole("button", { name: "Accept ownership" });
    await expect(accept).toBeEnabled();
    await accept.click();
    await expectReconciled(page, "Accept tier ownership");
    await expect(page.getByText("This wallet operates the tier")).toBeVisible();
    await expect(
      client.readContract({
        address: configuredTier,
        abi: membershipTierAbi,
        functionName: "owner",
      }),
    ).resolves.toBe(newOwner);
  } finally {
    await revertAnvil(snapshot);
  }
});

test("@anvil performs protocol withdrawal and fee-recipient writes through wagmi", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  test.skip(!anvilEnabled, "Run through scripts/test-web-anvil.sh.");
  test.skip(testInfo.project.name !== "desktop", "One mutation is sufficient.");
  const snapshot = await snapshotAnvil();
  const creator = requiredAnvilAddress("creator");
  const member = requiredAnvilAddress("member");
  const newRecipient = requiredAnvilAddress("giftRecipient");
  const factory = requiredAnvilAddress("factory");
  const configuredTier = requiredAnvilAddress("tier");
  const usdg = requiredAnvilAddress("usdg");
  const client = anvilPublicClient();

  try {
    expectSuccessfulReceipt(
      await sendContract({
        account: member,
        address: usdg,
        abi: usdgAbi,
        functionName: "approve",
        args: [configuredTier, 10_000_000n],
      }),
    );
    expectSuccessfulReceipt(
      await sendContract({
        account: member,
        address: configuredTier,
        abi: membershipTierAbi,
        functionName: "purchase",
        args: [1n, zeroAddress],
      }),
    );

    await installAnvilWallet(page, creator);
    await page.goto("/protocol");
    await connectAnvilWallet(page, creator);

    await page
      .getByRole("button", { name: "Withdraw to fee recipient" })
      .click();
    await expectReconciled(page, "Withdraw protocol fees");
    await expect(
      client.readContract({
        address: usdg,
        abi: usdgAbi,
        functionName: "balanceOf",
        args: [factory],
      }),
    ).resolves.toBe(0n);

    await page.getByLabel("New fee recipient").fill(newRecipient);
    await page.getByRole("button", { name: "Set fee recipient" }).click();
    await expectReconciled(page, "Change protocol fee recipient");
    await expect(
      client.readContract({
        address: factory,
        abi: robinhoodMembershipFactoryAbi,
        functionName: "feeRecipient",
      }),
    ).resolves.toBe(newRecipient);
  } finally {
    await revertAnvil(snapshot);
  }
});

test("validates management routes before any direct read", async ({ page }) => {
  await page.goto("/chains/31337/tiers/not-an-address/manage");
  await expect(page.getByText("Invalid tier address")).toBeVisible();
  await expect(page.getByText(/management URL/i)).toBeVisible();
});

test("fails registered-tier management closed without deployment config", async ({
  page,
}) => {
  await page.goto(`/chains/31337/tiers/${tier}/manage`);
  await expect(page.getByText("Onchain state unavailable")).toBeVisible();
  await expect(page.getByText(/not deployed/i)).toBeVisible();
});

test("fails protocol administration closed without a verified factory", async ({
  page,
}) => {
  await page.goto("/protocol");
  await expect(page.getByText("Onchain state unavailable")).toBeVisible();
  await expect(page.getByText(/not deployed/i)).toBeVisible();
});
