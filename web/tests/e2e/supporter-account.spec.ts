import {
  createPortfolioTier,
  expectSingleOwnedPosition,
} from "./helpers/membership-positions";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { zeroAddress } from "viem";
import { membershipTierAbi, usdgAbi } from "../../src/contracts";
import {
  anvilEnabled,
  anvilPublicClient,
  connectAnvilWallet,
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
        functionName: "createMembership",
        args: [2n, zeroAddress],
      }),
    );
    const id = await expectSingleOwnedPosition(client, tier, member);
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
        functionName: "processExpirations",
        args: [25n],
      }),
    );
    const [earned] = await client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "claimableRetiredReward",
      args: [member],
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
    await expect(card).toContainText(
      "No owned membership NFTs in this snapshot.",
    );
    await expect(card).toContainText("Rewards from ended memberships");
    const ended = page
      .getByRole("region", { name: "Ended membership rewards" })
      .filter({
        has: page.getByRole("button", {
          name: "Claim ended membership rewards",
        }),
      });
    await ended
      .getByRole("button", { name: "Claim ended membership rewards" })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Ended membership rewards claimed." }),
    ).toBeVisible({ timeout: 45_000 });
    expect(
      (
        await client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "claimableRetiredReward",
          args: [member],
        })
      )[0],
    ).toBe(0n);
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
          kind: "authentic origin payment token on disposable fork; current split graph",
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
  await expect(
    page.getByText("Your memberships, creations and earnings.", {
      exact: true,
    }),
  ).toBeVisible();
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

test("@anvil pages 101 positions and nine tiers, rejects stale selection, and claims bounded batches", async ({
  page,
}, info) => {
  test.setTimeout(360_000);
  test.skip(!anvilEnabled, "Run through scripts/test-web-anvil.sh.");
  test.skip(
    info.project.name !== "desktop",
    "One large stateful portfolio with narrow-screen review.",
  );
  const saved = await snapshotAnvil();
  const member = requiredAnvilAddress("member");
  const recipient = requiredAnvilAddress("giftRecipient");
  const token = requiredAnvilAddress("paymentToken");
  const client = anvilPublicClient();
  try {
    const tiers = [];
    for (let t = 0; t < 9; t++) {
      const entry = await createPortfolioTier(`Portfolio ${t + 1}`);
      tiers.push(entry);
      const count = t === 0 ? 101 : 1;
      expectSuccessfulReceipt(
        await sendContract({
          account: member,
          address: token,
          abi: usdgAbi,
          functionName: "approve",
          args: [entry.tier, entry.price * BigInt(count)],
        }),
      );
      for (let id = 0; id < count; id++)
        expectSuccessfulReceipt(
          await sendContract({
            account: member,
            address: entry.tier,
            abi: membershipTierAbi,
            functionName: "createMembership",
            args: [1n, member],
          }),
        );
    }
    await rpcRequest("evm_increaseTime", [43_200]);
    await rpcRequest("evm_mine");
    await installAnvilWallet(page, member);
    await page.goto("/account");
    await page
      .getByRole("combobox", { name: "Membership network" })
      .selectOption("31337");
    await connectAnvilWallet(page, member);
    const first = tiers[0];
    const card = page
      .locator(".account-membership-card")
      .filter({ hasText: first.name });
    await expect(card).toContainText("Showing 100 of 101 owned memberships.");
    await expect(
      page.getByText(
        "Discovery is incomplete. Loaded position and balance totals cover only the pages shown.",
      ),
    ).toBeVisible();
    await card
      .getByRole("button", { name: `More memberships in ${first.name}` })
      .click();
    await expect(card).toContainText("Showing 101 of 101 owned memberships.");
    const rewards = page.getByRole("region", { name: "Rewards", exact: true });
    const firstGroup = rewards.getByRole("group", {
      name: first.name,
      exact: true,
    });
    await firstGroup
      .getByRole("checkbox", {
        name: `${first.name} membership #1`,
        exact: true,
      })
      .check();
    expectSuccessfulReceipt(
      await sendContract({
        account: member,
        address: first.tier,
        abi: membershipTierAbi,
        functionName: "transferFrom",
        args: [member, recipient, 1n],
      }),
    );
    await expect(rewards.getByRole("alert")).toBeVisible({ timeout: 25_000 });
    await expect(
      rewards.getByRole("button", { name: "Claim selected rewards" }),
    ).toBeDisabled();
    await rewards.getByRole("button", { name: "Clear selection" }).click();
    await page.getByRole("button", { name: "Refresh memberships" }).click();
    await expect(card).toContainText("Showing 100 of 100 owned memberships.");
    for (let start = 2; start <= 101; start += 32) {
      for (let id = start; id <= Math.min(start + 31, 101); id++)
        await firstGroup
          .getByRole("checkbox", {
            name: `${first.name} membership #${id}`,
            exact: true,
          })
          .check();
      await rewards
        .getByRole("button", { name: "Claim selected rewards" })
        .click();
      await expect(
        rewards
          .getByRole("status")
          .filter({ hasText: "Selected rewards claimed." }),
      ).toBeVisible({ timeout: 45_000 });
      await expect(rewards.getByText("No rewards selected.")).toBeVisible();
    }
    // Seven remaining tiers fit on page one; the ninth tier is a separate batch.
    for (const entry of tiers.slice(1, 8))
      await rewards
        .getByRole("checkbox", {
          name: `${entry.name} membership #1`,
          exact: true,
        })
        .check();
    await rewards
      .getByRole("button", { name: "Claim selected rewards" })
      .click();
    await expect(rewards.getByText("No rewards selected.")).toBeVisible({
      timeout: 45_000,
    });
    await rewards.getByRole("button", { name: "More reward tiers" }).click();
    await rewards
      .getByRole("checkbox", {
        name: `${tiers[8].name} membership #1`,
        exact: true,
      })
      .check();
    await rewards
      .getByRole("button", { name: "Claim selected rewards" })
      .click();
    await expect(rewards.getByText("No rewards selected.")).toBeVisible({
      timeout: 45_000,
    });
    await page.setViewportSize({ width: 320, height: 844 });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: info.outputPath("portfolio-narrow.png"),
      fullPage: true,
    });
    expect(
      await client.readContract({
        address: first.tier,
        abi: membershipTierAbi,
        functionName: "ownerOf",
        args: [1n],
      }),
    ).toBe(recipient);
  } finally {
    await revertAnvil(saved);
  }
});
