import { formatRawTokenAmount } from "../../src/lib/token-amount";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";

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
          .getByRole("heading", { name: "Membership active" }),
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
      const quotedGift = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "previewShares",
        args: [10_000_000n],
      });
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
      ).resolves.toBe(quotedGift.sharesAdded);

      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    } finally {
      await revertAnvil(snapshot);
    }
  });
});

test("@anvil vesting-lifecycle distinguishes free access, suspended weight and durable claims", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  test.skip(
    !process.env.BBF_ANVIL_RPC_URL,
    "Requires a configured local chain.",
  );
  test.skip(
    testInfo.project.name !== "desktop",
    "One lifecycle is sufficient.",
  );
  const creator = requiredAnvilAddress("creator");
  const client = anvilPublicClient();
  const checkpoint = await snapshotAnvil();
  const evidence: unknown[] = [];
  try {
    await installAnvilWallet(page, creator);
    await page.goto("/create");
    await page
      .getByRole("combobox", { name: "Membership network" })
      .selectOption("31337");
    await connectAnvilWallet(page, creator);
    await page
      .getByLabel("Membership name")
      .fill("Free access and vested weight");
    await page.getByLabel("Symbol", { exact: true }).fill("LIFE");
    await page.getByRole("button", { name: /^price & period$/i }).click();
    await page.getByLabel(/price per period/i).fill("0");
    await page.getByRole("button", { name: /^risks$/i }).click();
    await page.getByRole("checkbox").nth(0).check();
    await page.getByRole("checkbox").nth(1).check();
    await page.getByRole("button", { name: /^review$/i }).click();
    await page.getByRole("button", { name: "Publish this membership" }).click();
    await expect(
      page.getByRole("heading", { name: "Your membership is ready to share." }),
    ).toBeVisible({ timeout: 45_000 });
    const tier = (await page
      .locator(".creator-success code")
      .first()
      .innerText()) as `0x${string}`;
    await page.getByRole("link", { name: "Open membership page" }).click();
    const contribution = page.getByLabel(/optional USDG contribution/i);
    const pay = page.getByRole("button", { name: "Add one membership period" });
    await contribution.fill("10");
    await pay.click();
    await expectReconciled(page);
    const id = await client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "tokenOf",
      args: [creator],
    });
    const oldShares = await client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "sharesOf",
      args: [id],
    });
    const status = page.getByRole("region", {
      name: "Current membership status",
    });
    const read = async () => {
      const [time, shares, eligible, claim] = await Promise.all([
        client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "timeBalances",
          args: [id],
        }),
        client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "sharesOf",
          args: [id],
        }),
        client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "rewardEligible",
          args: [id],
        }),
        client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "claimableReward",
          args: [id],
        }),
      ]);
      evidence.push({
        time: time.map(String),
        shares: String(shares),
        eligible,
        claim: String(claim),
      });
      return { shares, eligible, claim };
    };
    const expire = async () => {
      const expiration = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "expiresAt",
        args: [id],
      });
      await rpcRequest("evm_setNextBlockTimestamp", [Number(expiration + 1n)]);
      await rpcRequest("evm_mine");
      await page.reload();
      await expect(status.getByText("Inactive", { exact: true })).toBeVisible();
    };
    const creatorWrite = async (
      functionName: "synchronizeExpiredMemberships" | "grantTime" | "setPaused",
      args: readonly unknown[],
    ) =>
      expectSuccessfulReceipt(
        await sendContract({
          account: creator,
          address: tier,
          abi: membershipTierAbi,
          functionName,
          args,
        }),
      );
    await contribution.fill("0");
    await pay.click();
    await expectReconciled(page);
    expect((await read()).shares).toBe(oldShares);
    await expire();
    await expect(status.getByText("Eligible", { exact: true })).toBeVisible();
    await contribution.fill("0");
    await pay.click();
    await expectReconciled(page);
    expect((await read()).eligible).toBe(true);
    await expire();
    await creatorWrite("synchronizeExpiredMemberships", [[id]]);
    await page.reload();
    await expect(
      status.getByText("Not eligible", { exact: true }),
    ).toBeVisible();
    const suspended = await read();
    expect(suspended.claim).toBeGreaterThan(0n);
    await contribution.fill("0");
    await pay.click();
    await expectReconciled(page);
    await expect(status.getByText("Active", { exact: true })).toBeVisible();
    await expect(
      status.getByText("Not eligible", { exact: true }),
    ).toBeVisible();
    await creatorWrite("grantTime", [creator, 1n]);
    await page.reload();
    expect((await read()).eligible).toBe(false);
    await contribution.fill("0.000001");
    await expect(pay).toBeDisabled();
    expect((await read()).eligible).toBe(false);
    await contribution.fill("1");
    await pay.click();
    await expectReconciled(page);
    await expect(
      page.getByText(
        new RegExp(
          `Historical reward weight restored: ${formatRawTokenAmount({ raw: oldShares, decimals: 6, multiplier: 10n ** 18n })} shares`,
        ),
      ),
    ).toBeVisible();
    const restored = await read();
    expect(restored.eligible).toBe(true);
    expect(restored.shares).toBeGreaterThan(oldShares);
    expect(restored.claim).toBe(suspended.claim);
    await creatorWrite("setPaused", [true]);
    await expire();
    await creatorWrite("synchronizeExpiredMemberships", [[id]]);
    await page.reload();
    await expect(
      status.getByText("Not eligible", { exact: true }),
    ).toBeVisible();
    const memberClaim = page
      .locator(".claim-row")
      .filter({ hasText: "Membership rewards" });
    await memberClaim
      .getByRole("button", { name: "Claim to this wallet" })
      .click();
    await expectReconciled(page, "Claim membership rewards");
    expect((await read()).claim).toBe(0n);
    expect((await read()).shares).toBe(restored.shares);
    const path = testInfo.outputPath("free-access-eligibility-claims.json");
    await writeFile(path, JSON.stringify(evidence, null, 2));
    await testInfo.attach("free-access-eligibility-claims.json", {
      path,
      contentType: "application/json",
    });
  } finally {
    await revertAnvil(checkpoint);
  }
});
