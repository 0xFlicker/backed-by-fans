import { expectSingleOwnedPosition } from "./helpers/membership-positions";
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
  sendContract,
  expectSuccessfulReceipt,
  rpcRequest,
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
      await expect(page.getByRole("main")).not.toContainText(
        /referrer|referral/i,
        { useInnerText: true },
      );
      await page.reload();
      await connectAnvilWallet(page, member);

      const join = page.getByRole("button", { name: "New membership" });
      await expect(join).toBeEnabled();
      await join.click();
      await expectReconciled(page, "New membership");

      const tokenId = await expectSingleOwnedPosition(client, tier, member);
      await page
        .getByRole("combobox", { name: "Membership action" })
        .selectOption(tokenId.toString());
      await page
        .getByRole("textbox", { name: "Periods", exact: true })
        .fill("1");
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
          .getByRole("heading", { name: "Membership active" }),
      ).toBeVisible();

      const renew = page.getByRole("button", {
        name: `Renew membership #${tokenId}`,
      });
      await expect(renew).toBeEnabled();
      await renew.click();
      await expectReconciled(page, `Renew membership #${tokenId}`);
      const renewedExpiration = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "expiresAt",
        args: [tokenId],
      });
      expect(renewedExpiration - firstExpiration).toBe(2_592_000n);

      await page.getByText("Gift this membership", { exact: true }).click();
      await page
        .getByLabel("Recipient wallet", { exact: true })
        .fill(recipient);
      await expect(page.getByText("Total").last().locator("..")).toContainText(
        "10 USDG",
      );
      const gift = page.getByRole("button", {
        name: "Send gift",
      });
      await expect(gift).toBeEnabled();
      const quotedGift = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "previewShares",
        args: [10_000_000n],
      });
      await gift.click();
      await expectReconciled(page, "Gift 1 period");

      const recipientToken = await expectSingleOwnedPosition(
        client,
        tier,
        recipient,
      );
      expect(recipientToken).not.toBe(0n);
      await expect(
        client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "sharesOf",
          args: [recipientToken],
        }),
      ).resolves.toBe(quotedGift.sharesAdded);

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    } finally {
      await revertAnvil(snapshot);
    }
  });
});

test("@anvil free renewal preserves a live position and a return starts fresh", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  test.skip(!anvilEnabled, "Run through scripts/test-web-anvil.sh.");
  test.skip(
    testInfo.project.name !== "desktop",
    "One mutation history is sufficient.",
  );
  const creator = requiredAnvilAddress("creator");
  const client = anvilPublicClient();
  const saved = await snapshotAnvil();
  try {
    await installAnvilWallet(page, creator);
    await page.goto("/create");
    await page
      .getByRole("combobox", { name: "Membership network" })
      .selectOption("31337");
    await connectAnvilWallet(page, creator);
    await page
      .getByLabel("Membership name")
      .fill("Independent free memberships");
    await page.getByLabel("Symbol", { exact: true }).fill("FRESH");
    await page.getByRole("button", { name: /^price & period$/i }).click();
    await page.getByLabel(/price per period/i).fill("0");
    await page.getByRole("button", { name: /^risks$/i }).click();
    await page
      .getByRole("checkbox", { name: /I understand the price, period/ })
      .check();
    await page.getByRole("button", { name: /^review$/i }).click();
    await page.getByRole("button", { name: "Publish this membership" }).click();
    await expect(
      page.getByRole("heading", { name: "Your membership is ready to share." }),
    ).toBeVisible({ timeout: 45_000 });
    const tier = (await page
      .locator(".creator-success code")
      .first()
      .innerText()) as `0x${string}`;
    const common = { address: tier, abi: membershipTierAbi } as const;
    await page.getByRole("link", { name: "Open membership page" }).click();
    const contribution = page.getByLabel(/optional USDG contribution/i);
    await contribution.fill("10");
    await page
      .getByRole("button", { name: "New membership", exact: true })
      .click();
    await expectReconciled(page);
    const id = await expectSingleOwnedPosition(client, tier, creator);
    await page
      .getByRole("combobox", { name: "Membership action" })
      .selectOption(id.toString());
    const oldShares = await client.readContract({
      ...common,
      functionName: "sharesOf",
      args: [id],
    });
    const oldExpiration = await client.readContract({
      ...common,
      functionName: "expiresAt",
      args: [id],
    });
    await contribution.fill("0");
    await page.getByRole("button", { name: `Renew membership #${id}` }).click();
    await expectReconciled(page);
    expect(
      await client.readContract({
        ...common,
        functionName: "sharesOf",
        args: [id],
      }),
    ).toBe(oldShares);
    const expiry = await client.readContract({
      ...common,
      functionName: "expiresAt",
      args: [id],
    });
    expect(expiry).toBeGreaterThan(oldExpiration);
    const lifetime = await client.readContract({
      ...common,
      functionName: "lifetimeGross",
    });
    await rpcRequest("evm_setNextBlockTimestamp", [Number(expiry)]);
    await rpcRequest("evm_mine");
    await page.reload();
    await page
      .getByRole("combobox", { name: "Membership action" })
      .selectOption(id.toString());
    await expect(
      page.getByRole("button", { name: "Membership ended", exact: true }),
    ).toBeDisabled();
    expectSuccessfulReceipt(
      await sendContract({
        ...common,
        account: creator,
        functionName: "setPaused",
        args: [true],
      }),
    );
    expectSuccessfulReceipt(
      await sendContract({
        ...common,
        account: creator,
        functionName: "processAccounting",
        args: [25n],
      }),
    );
    expect(
      await client.readContract({
        ...common,
        functionName: "balanceOf",
        args: [creator],
      }),
    ).toBe(0n);
    expect(
      await client.readContract({
        ...common,
        functionName: "sharesOf",
        args: [id],
      }),
    ).toBe(0n);
    const retired = await client.readContract({
      ...common,
      functionName: "claimableRetiredReward",
      args: [creator],
    });
    expect(retired[0]).toBeGreaterThan(0n);
    expectSuccessfulReceipt(
      await sendContract({
        ...common,
        account: creator,
        functionName: "setPaused",
        args: [false],
      }),
    );
    await page.goto(`/chains/31337/tiers/${tier}`);
    await connectAnvilWallet(page, creator);
    await contribution.fill("0");
    await page
      .getByRole("button", { name: "New membership", exact: true })
      .click();
    await expectReconciled(page);
    const fresh = await expectSingleOwnedPosition(client, tier, creator);
    expect(fresh).toBeGreaterThan(id);
    expect(
      await client.readContract({
        ...common,
        functionName: "sharesOf",
        args: [fresh],
      }),
    ).toBe(0n);
    expect(
      await client.readContract({
        ...common,
        functionName: "claimableRetiredReward",
        args: [creator],
      }),
    ).toEqual(retired);
    expect(
      await client.readContract({ ...common, functionName: "lifetimeGross" }),
    ).toBe(lifetime);
    await expect(
      client.readContract({ ...common, functionName: "ownerOf", args: [id] }),
    ).rejects.toThrow();
  } finally {
    await revertAnvil(saved);
  }
});
