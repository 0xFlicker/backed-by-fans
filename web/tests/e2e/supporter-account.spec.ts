import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { zeroAddress } from "viem";
import { membershipTierAbi, usdgAbi } from "../../src/contracts";
import {
  anvilPublicClient,
  connectAnvilWallet,
  expectReconciled,
  expectSuccessfulReceipt,
  installAnvilWallet,
  requiredAnvilAddress,
  revertAnvil,
  rpcRequest,
  sendContract,
  snapshotAnvil,
} from "./helpers/anvil";

const validTier = "0x2222222222222222222222222222222222222222";

test("@anvil vested-account discovers a burned membership's durable earned claim", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  test.skip(
    !process.env.BBF_ANVIL_TIER_ADDRESS,
    "Requires a configured local tier.",
  );
  test.skip(
    testInfo.project.name !== "desktop",
    "One discovery journey is sufficient.",
  );
  const checkpoint = await snapshotAnvil();
  const creator = requiredAnvilAddress("creator");
  const member = requiredAnvilAddress("member");
  const tier = requiredAnvilAddress("tier");
  const token = requiredAnvilAddress("paymentToken");
  const client = anvilPublicClient();
  try {
    const price = await client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "pricePerPeriod",
    });
    const name = await client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "name",
    });
    expect(price).toBeGreaterThan(0n);
    expectSuccessfulReceipt(
      await sendContract({
        account: member,
        address: token,
        abi: usdgAbi,
        functionName: "approve",
        args: [tier, price * 2n],
      }),
    );
    expectSuccessfulReceipt(
      await sendContract({
        account: member,
        address: tier,
        abi: membershipTierAbi,
        functionName: "purchase",
        args: [2n, zeroAddress],
      }),
    );
    const id = await client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "tokenOf",
      args: [member],
    });
    const end = await client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "expiresAt",
      args: [id],
    });
    await rpcRequest("evm_setNextBlockTimestamp", [Number(end + 1n)]);
    await rpcRequest("evm_mine");
    expectSuccessfulReceipt(
      await sendContract({
        account: creator,
        address: tier,
        abi: membershipTierAbi,
        functionName: "synchronizeExpiredMemberships",
        args: [[id]],
      }),
    );
    const earned = await client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "claimableReward",
      args: [id],
    });
    expect(earned).toBeGreaterThan(0n);
    await installAnvilWallet(page, member);
    await page.goto("/account");
    await page
      .getByRole("combobox", { name: "Membership network" })
      .selectOption("31337");
    await connectAnvilWallet(page, member);
    const card = page
      .locator(".account-membership-card")
      .filter({ hasText: name });
    await expect(card).toContainText("Membership ended");
    await expect(card).toContainText("Rewards ready");
    await card
      .getByRole("link", { name: "View membership", exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/chains/31337/tiers/${tier}`, "i"),
    );
    await page
      .locator(".claim-groups")
      .getByRole("button", { name: "Claim rewards" })
      .click();
    await expectReconciled(page, "Claim rewards");
    expect(
      await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "claimableReward",
        args: [id],
      }),
    ).toBe(0n);
    expect(
      await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "rewardEligible",
        args: [id],
      }),
    ).toBe(false);
    const path = testInfo.outputPath("account-durable-claim.json");
    await writeFile(
      path,
      JSON.stringify(
        {
          kind: "local mock payment token; real split graph",
          tier,
          tokenId: String(id),
          earned: String(earned),
          after: { claimable: "0", eligible: false },
        },
        null,
        2,
      ),
    );
    await testInfo.attach("account-durable-claim", {
      path,
      contentType: "application/json",
    });
  } finally {
    await revertAnvil(checkpoint);
  }
});

test("keeps account recovery focused on retrying discovery", async ({
  page,
}) => {
  await page.goto("/account");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Your account.",
    }),
  ).toBeVisible();
  await expect(page.getByText(/manage the ones you create/i)).toBeVisible();
  const discoveryState = page.locator("[data-read-state='unavailable']");
  await expect(discoveryState).toBeVisible();
  await expect(
    discoveryState.getByText(/^(Your memberships|Memberships unavailable)$/),
  ).toBeVisible();
  await expect(page.getByText("List settings")).toHaveCount(0);
  await expect(page.getByText("Already have a membership link?")).toHaveCount(
    0,
  );
});

test("never turns an unavailable supporter read into balances or success", async ({
  page,
}) => {
  await page.goto(`/chains/4663/tiers/${validTier}`);

  await expect(page.getByText("Onchain state unavailable")).toBeVisible();
  await expect(page.getByText(/not deployed/i)).toBeVisible();
  await expect(page.getByText(/complete and reconciled onchain/i)).toHaveCount(
    0,
  );
  await expect(page.getByText(/0 USDG/i)).toHaveCount(0);
});

test("keeps the account route keyboard reachable, responsive, and accessible", async ({
  page,
}) => {
  await page.goto("/account");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
