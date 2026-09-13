import { hasLiveOwnedPosition } from "./helpers/membership-positions";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import {
  zeroAddress,
  encodeFunctionData,
  parseEventLogs,
  type Address,
} from "viem";

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
  rpcRequest,
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
      functionName: "createMembership",
      args: [1n, referrer, 25n],
    }),
  );
}

async function vestSeedPurchase() {
  const tier = requiredAnvilAddress("tier");
  const client = anvilPublicClient();
  const end = await client.readContract({
    address: tier,
    abi: membershipTierAbi,
    functionName: "expiresAt",
    args: [1n],
  });
  expectSuccessfulReceipt(
    await sendContract({
      account: requiredAnvilAddress("creator"),
      address: tier,
      abi: membershipTierAbi,
      functionName: "addGrantTime",
      args: [1n, requiredAnvilAddress("member"), 1n, 25n],
    }),
  );
  await rpcRequest("evm_setNextBlockTimestamp", [Number(end)]);
  await rpcRequest("evm_mine");
  expectSuccessfulReceipt(
    await sendContract({
      account: requiredAnvilAddress("member"),
      address: tier,
      abi: membershipTierAbi,
      functionName: "processAccounting",
      args: [25n],
    }),
  );
  return client.readContract({
    address: tier,
    abi: membershipTierAbi,
    functionName: "claimableReward",
    args: [1n],
  });
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
      const reward = await vestSeedPurchase();
      await page.goto(`/chains/31337/tiers/${tier}?tokenId=1`);
      await connectAnvilWallet(page, member);

      const rewardRow = page
        .locator(".claim-row")
        .filter({ hasText: "Membership rewards" });
      await expect(rewardRow).toContainText(usdgDisplay(reward));
      await page
        .locator(".claim-groups")
        .getByRole("button", { name: "Claim rewards" })
        .click();
      await expectReconciled(page, "Claim rewards");
      await expect(rewardRow).toHaveCount(0);

      await switchAnvilAccount(page, referrer);
      const referralRow = page
        .locator(".claim-row")
        .filter({ hasText: "Referral proceeds" });
      await expect(referralRow).toContainText("0.1 USDG");
      const referralClaim = page
        .locator(".claim-groups")
        .getByRole("button", { name: "Claim rewards" });
      await expect(referralClaim).toBeEnabled();
      await referralClaim.click();
      await expectReconciled(page, "Claim rewards");
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
      const reward = await vestSeedPurchase();
      // Labeled browser RPC fault only. Authentic USDG code/storage and all
      // successful membership proofs remain untouched; Foundry separately
      // exercises issuer-restricted token delivery.
      const claimData = encodeFunctionData({
        abi: membershipTierAbi,
        functionName: "claimRewards",
        args: [[1n], 25n],
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
      await page.goto(`/chains/31337/tiers/${tier}?tokenId=1`);
      await connectAnvilWallet(page, member);

      const rewardRow = page
        .locator(".claim-row")
        .filter({ hasText: "Membership rewards" });
      await expect(rewardRow).toContainText(usdgDisplay(reward));
      await page
        .locator(".claim-groups")
        .getByRole("button", { name: "Claim rewards" })
        .click();
      await expect(
        page
          .locator(".membership-transaction")
          .filter({ hasText: "Claim rewards" }),
      ).toBeVisible();
      await expect(
        page.locator(".membership-transaction.transaction-retry"),
      ).toBeVisible();
      await expect(rewardRow).toContainText(usdgDisplay(reward));
      await expect(
        client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "claimableReward",
          args: [1n],
        }),
      ).resolves.toBe(reward);
      await expect(
        page.locator(".membership-transaction.transaction-retry"),
      ).toContainText("That did not go through.");
      await expect(rewardRow.locator("input")).toHaveCount(0);
      await page.unroute(`${requiredAnvilRpc()}/`);
      const balanceBeforeRetry = await client.readContract({
        address: usdg,
        abi: usdgAbi,
        functionName: "balanceOf",
        args: [member],
      });
      await page
        .locator(".claim-groups")
        .getByRole("button", { name: "Claim rewards" })
        .click();
      await expectReconciled(page, "Claim rewards");
      expect(
        (await client.readContract({
          address: usdg,
          abi: usdgAbi,
          functionName: "balanceOf",
          args: [member],
        })) - balanceBeforeRetry,
      ).toBe(reward);
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
      const { grossRefund } = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "previewRefund",
        args: [1n],
      });
      const components = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "previewRefund",
        args: [1n],
      });
      expect(components.fundingScaled[3]).toBeGreaterThan(0n);
      expect(
        components.fundingScaled.reduce((sum, amount) => sum + amount, 0n),
      ).toBe(components.grossRefund * (1n << 128n));
      const refundPreview = page.locator(".refund-preview[aria-live]");

      // The quote is pinned to its own block; interval mining may have moved
      // the direct read forward. Receipt amounts are covered by the partial
      // refund journey below; do not compare quotes from different blocks.
      expect(grossRefund).toBeGreaterThan(0n);
      await expect(refundPreview).toContainText(
        "Reserved unused membership payments",
      );

      const refund = page.getByRole("button", {
        name: "Refund unused time",
      });
      await expect(refund).toBeEnabled();
      await refund.click();
      await expectReconciled(page, "Refund membership #1");
      await expect(refundPreview).toHaveCount(0);
      await page
        .getByRole("button", { name: "Unpause time increases" })
        .click();
      await expectReconciled(page, "Unpause tier");

      const tokenId = 1n;
      expect(
        await client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "balanceOf",
          args: [member],
        }),
      ).toBe(0n);
      const balances = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "timeBalances",
        args: [tokenId],
      });
      expect(balances[0]).toBe(0n);
      expect(balances[1]).toBe(0n);
      await expect(hasLiveOwnedPosition(client, tier, member)).resolves.toBe(
        false,
      );
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

      const refundPreview = page.locator(".refund-preview[aria-live]");
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
        name: "Refund unused time",
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

for (const variablePrice of [false, true]) {
  test(`@anvil vested-refund ${variablePrice ? "mixed free and paid periods" : "checkpoint recovery after claims"}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    test.skip(
      !process.env.BBF_ANVIL_RPC_URL,
      "Requires a configured local chain.",
    );
    test.skip(
      testInfo.project.name !== "desktop",
      "One mutation journey is sufficient.",
    );
    const checkpoint = await snapshotAnvil();
    const creator = requiredAnvilAddress("creator");
    const member = requiredAnvilAddress("member");
    const token = requiredAnvilAddress("paymentToken");
    const client = anvilPublicClient();
    try {
      await installAnvilWallet(page, creator);
      await page.goto("/create");
      await page
        .getByRole("combobox", { name: "Membership network" })
        .selectOption("31337");
      await connectAnvilWallet(page, creator);
      await page
        .getByLabel("Membership name")
        .fill(
          variablePrice
            ? "Mixed payment refunds"
            : "Refund after earned claims",
        );
      await page.getByLabel("Symbol", { exact: true }).fill("RFND");
      await page.getByRole("button", { name: /^price & period$/i }).click();
      await page
        .getByLabel(/price per period/i)
        .fill(variablePrice ? "0" : "10");
      await page.getByRole("button", { name: /^support split$/i }).click();
      await page.getByLabel("Protocol allocation (%)").fill("5");
      await page.getByLabel("Membership rewards (%)").fill("10");
      await page.getByLabel("Referral share (%)").fill("5");
      await page.getByRole("radio", { name: /^None / }).check();
      await page.getByRole("button", { name: /^risks$/i }).click();
      await page
        .getByRole("checkbox", { name: /I understand the price, period/ })
        .check();
      await page.getByRole("button", { name: /^review$/i }).click();
      await page
        .getByRole("button", { name: "Publish this membership" })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Your membership is ready to share.",
        }),
      ).toBeVisible({ timeout: 45_000 });
      const tier = (await page
        .locator(".creator-success code")
        .first()
        .innerText()) as Address;
      const approve = async (account: Address, amount: bigint) =>
        expectSuccessfulReceipt(
          await sendContract({
            account,
            address: token,
            abi: usdgAbi,
            functionName: "approve",
            args: [tier, amount],
          }),
        );
      await approve(member, variablePrice ? 180_000_000n : 120_000_000n);
      const purchase = await sendContract({
        account: member,
        address: tier,
        abi: membershipTierAbi,
        functionName: variablePrice
          ? "createContributionMembership"
          : "createMembership",
        args: [variablePrice ? 120_000_000n : 12n, creator, 25n],
      });
      expectSuccessfulReceipt(purchase);
      const start = (
        await client.getBlock({ blockNumber: purchase.blockNumber })
      ).timestamp;
      const period = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "periodDuration",
      });
      if (variablePrice) {
        for (const gross of [0n, 60_000_000n])
          expectSuccessfulReceipt(
            await sendContract({
              account: member,
              address: tier,
              abi: membershipTierAbi,
              functionName: "renewContributionMembership",
              args: [1n, gross, creator, 25n],
            }),
          );
      } else {
        // A different member's earlier END blocks projection for everyone.
        await approve(creator, 10_000_000n);
        expectSuccessfulReceipt(
          await sendContract({
            account: creator,
            address: tier,
            abi: membershipTierAbi,
            functionName: "createMembership",
            args: [1n, zeroAddress, 25n],
          }),
        );
      }
      await page.goto(`/chains/31337/tiers/${tier}/manage`);
      await page.getByRole("button", { name: "Pause time increases" }).click();
      await expectReconciled(page, "Pause tier");
      await page.getByLabel("Membership token", { exact: true }).fill("1");
      const preview = page.getByRole("button", { name: "Read refund preview" });
      const refund = page.getByRole("button", { name: "Refund unused time" });
      await preview.click();
      await expect(refund).toBeEnabled();
      await rpcRequest("evm_setNextBlockTimestamp", [
        Number(start + (variablePrice ? period / 4n : 3n * period)),
      ]);
      await rpcRequest("evm_mine");
      if (!variablePrice) {
        await refund.click();
        await expect(
          page.getByText(
            "Advance membership accounting and read a fresh refund preview before continuing.",
          ),
        ).toBeVisible();
        await preview.click();
        await expect(page.locator(".refund-preview[aria-live]")).toContainText(
          "Historical funding estimate",
        );
        await expect(refund).toBeDisabled();
      }
      // Permissionless compatible-client recovery. Website combined advance
      // has its own later task; no auto-signing or browser polling is added.
      expectSuccessfulReceipt(
        await sendContract({
          account: member,
          address: tier,
          abi: membershipTierAbi,
          functionName: "processAccounting",
          args: [25n],
        }),
      );
      const earned = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "previewAccounting",
        args: [1n, creator, creator, 0n],
      });
      for (const value of [
        earned.settled.creator,
        earned.settled.member,
        earned.settled.referral,
        earned.settled.protocol,
      ])
        expect(value).toBeGreaterThan(0n);
      const claims = [];
      for (const functionName of [
        "withdrawCreatorProceeds",
        "claimReferral",
        "releaseProtocolFees",
      ] as const) {
        const receipt = await sendContract({
          account: creator,
          address: tier,
          abi: membershipTierAbi,
          functionName,
        });
        expectSuccessfulReceipt(receipt);
        claims.push(receipt.transactionHash);
      }
      const memberClaim = await sendContract({
        account: member,
        address: tier,
        abi: membershipTierAbi,
        functionName: "claimReward",
        args: [1n, 25n],
      });
      expectSuccessfulReceipt(memberClaim);
      claims.push(memberClaim.transactionHash);
      expect(
        await client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "claimableReward",
          args: [1n],
        }),
      ).toBe(0n);
      const shares = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "sharesOf",
        args: [1n],
      });
      const cursor = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "lifetimeGross",
      });
      const generation = (
        await client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "allocationState",
          args: [1n],
        })
      ).generation;
      expect(
        await client.readContract({
          address: token,
          abi: usdgAbi,
          functionName: "allowance",
          args: [creator, tier],
        }),
      ).toBe(0n);
      await preview.click();
      await expect(refund).toBeEnabled();
      const funding = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "previewRefund",
        args: [1n],
      });
      expect(funding.projected || funding.complete).toBe(true);
      expect(funding.fundingScaled.reduce((sum, part) => sum + part, 0n)).toBe(
        funding.grossRefund * (1n << 128n),
      );
      await expect(page.locator(".refund-preview[aria-live]")).toContainText(
        "Reserved unused membership payments",
      );
      await expect(
        page.getByRole("button", { name: /approve.*refund|top.?up/i }),
      ).toHaveCount(0);
      const memberBalance = await client.readContract({
        address: token,
        abi: usdgAbi,
        functionName: "balanceOf",
        args: [member],
      });
      const firstBlock = await client.getBlockNumber({ cacheTime: 0 });
      if (variablePrice) {
        // Labeled simulation transport fault. Real token-delivery rollback is
        // proved by AdversarialRefundsTest; this verifies the browser retry UX.
        const selector = encodeFunctionData({
          abi: membershipTierAbi,
          functionName: "refund",
          args: [1n, funding.recipient, funding.grossRefund, 25n],
        }).slice(0, 10);
        await page.route(`${requiredAnvilRpc()}/`, async (route) => {
          const payload = route.request().postDataJSON();
          const requests = Array.isArray(payload) ? payload : [payload];
          const failed = (request: {
            method: string;
            params?: { to?: string; data?: string }[];
          }) =>
            request.method === "eth_call" &&
            request.params?.[0]?.to?.toLowerCase() === tier.toLowerCase() &&
            request.params?.[0]?.data?.startsWith(selector);
          if (!requests.some(failed)) return route.continue();
          const upstream = await route.fetch();
          const data = await upstream.json();
          const responses = (Array.isArray(data) ? data : [data]).map((item) =>
            requests.some(
              (request) => request.id === item.id && failed(request),
            )
              ? {
                  jsonrpc: "2.0",
                  id: item.id,
                  error: {
                    code: 3,
                    message:
                      "execution reverted: Labeled refund delivery failure",
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
        await refund.click();
        await expect(
          page.getByText(/Labeled refund delivery failure/).first(),
        ).toBeVisible();
        expect(
          (
            await client.readContract({
              address: tier,
              abi: membershipTierAbi,
              functionName: "allocationState",
              args: [1n],
            })
          ).generation,
        ).toBe(generation);
        expect(
          await client.readContract({
            address: token,
            abi: usdgAbi,
            functionName: "balanceOf",
            args: [member],
          }),
        ).toBe(memberBalance);
        await page.unroute(`${requiredAnvilRpc()}/`);
        await preview.click();
        await expect(refund).toBeEnabled();
      }
      await refund.click();
      await expectReconciled(page, "Refund membership #1");
      const events = await client.getContractEvents({
        address: tier,
        abi: membershipTierAbi,
        eventName: "MembershipRefunded",
        fromBlock: firstBlock,
        toBlock: "latest",
      });
      expect(events).toHaveLength(1);
      const event = events[0];
      const actual = parseEventLogs({
        abi: membershipTierAbi,
        eventName: "MembershipRefunded",
        logs: (
          await client.getTransactionReceipt({ hash: event.transactionHash })
        ).logs,
      })[0].args;
      const execution = (
        await client.getBlock({ blockNumber: event.blockNumber })
      ).timestamp;
      const expectedGross = variablePrice
        ? (120_000_000n * (period - (execution - start))) / period + 60_000_000n
        : (120_000_000n * (12n * period - (execution - start))) /
          (12n * period);
      expect(actual.grossRefund).toBe(expectedGross);
      expect(actual.grossRefund).toBeLessThanOrEqual(funding.grossRefund);
      expect(actual.recipient.toLowerCase()).toBe(member.toLowerCase());
      expect(
        (await client.readContract({
          address: token,
          abi: usdgAbi,
          functionName: "balanceOf",
          args: [member],
        })) - memberBalance,
      ).toBe(actual.grossRefund);
      await expect(
        page
          .getByRole("status")
          .filter({ hasText: "The membership is permanently retired." }),
      ).toContainText(usdgDisplay(actual.grossRefund));
      expect(
        await client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "sharesOf",
          args: [1n],
        }),
      ).toBe(0n);
      expect(
        await client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "lifetimeGross",
        }),
      ).toBe(cursor);
      expect(
        (
          await client.readContract({
            address: tier,
            abi: membershipTierAbi,
            functionName: "allocationState",
            args: [1n],
          })
        ).generation,
      ).toBe(generation + 1n);
      const remaining = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "timeBalances",
        args: [1n],
      });
      expect(remaining.slice(0, 2)).toEqual([0n, 0n]);
      expect(remaining[2]).toBe(0n);
      await expect(
        client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "ownerOf",
          args: [1n],
        }),
      ).rejects.toThrow();
      const liability = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "totalProtectedLiability",
      });
      const custody = await client.readContract({
        address: token,
        abi: usdgAbi,
        functionName: "balanceOf",
        args: [tier],
      });
      expect(custody).toBeGreaterThanOrEqual(liability);
      const evidence = {
        kind: "authentic origin payment token on disposable fork; current split protocol graph",
        tier,
        variablePrice,
        claims,
        earned,
        funding,
        actual,
        execution,
        shares,
        cursor,
        liability,
        custody,
        receipt: event.transactionHash,
      };
      const path = testInfo.outputPath(
        `refund-${variablePrice ? "mixed" : "after-claims"}.json`,
      );
      await writeFile(
        path,
        JSON.stringify(
          evidence,
          (_, value) => (typeof value === "bigint" ? String(value) : value),
          2,
        ),
      );
      await testInfo.attach("refund-evidence", {
        path,
        contentType: "application/json",
      });
      await page.screenshot({
        path: testInfo.outputPath("refund-confirmed.png"),
        fullPage: true,
      });
    } finally {
      await revertAnvil(checkpoint);
    }
  });
}

test("@anvil vested-claims pays all beneficiaries after ownership transfer with ongoing accrual", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  test.skip(
    !process.env.BBF_ANVIL_RPC_URL,
    "Requires a configured local chain.",
  );
  test.skip(
    testInfo.project.name !== "desktop",
    "One beneficiary journey is sufficient.",
  );
  const checkpoint = await snapshotAnvil();
  const creator = requiredAnvilAddress("creator");
  const member = requiredAnvilAddress("member");
  const token = requiredAnvilAddress("paymentToken");
  const client = anvilPublicClient();
  const evidence: unknown[] = [];
  try {
    await installAnvilWallet(page, creator);
    await page.goto("/create");
    await page
      .getByRole("combobox", { name: "Membership network" })
      .selectOption("31337");
    await connectAnvilWallet(page, creator);
    await page.getByLabel("Membership name").fill("Vested beneficiary claims");
    await page.getByLabel("Symbol", { exact: true }).fill("CASH");
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
      .innerText()) as Address;
    expectSuccessfulReceipt(
      await sendContract({
        account: member,
        address: token,
        abi: usdgAbi,
        functionName: "approve",
        args: [tier, 120_000_000n],
      }),
    );
    expectSuccessfulReceipt(
      await sendContract({
        account: member,
        address: tier,
        abi: membershipTierAbi,
        functionName: "createMembership",
        args: [12n, creator, 25n],
      }),
    );
    await rpcRequest("evm_increaseTime", [3 * 30 * 86_400]);
    await rpcRequest("evm_mine");
    expectSuccessfulReceipt(
      await sendContract({
        account: member,
        address: tier,
        abi: membershipTierAbi,
        functionName: "processAccounting",
        args: [25n],
      }),
    );
    const originalProceeds = await client.readContract({
      address: tier,
      abi: membershipTierAbi,
      functionName: "creatorProceeds",
    });
    expect(originalProceeds).toBeGreaterThan(0n);
    await page.goto(`/chains/31337/tiers/${tier}/manage`);
    await page.getByRole("button", { name: "Pause time increases" }).click();
    await expectReconciled(page, "Pause tier");
    await page.getByLabel("New creator owner").fill(member);
    await page.getByRole("button", { name: "Name pending owner" }).click();
    await expectReconciled(page, "Start ownership transfer");
    await switchAnvilAccount(page, member);
    await page.getByRole("button", { name: "Accept ownership" }).click();
    await expectReconciled(page, "Accept tier ownership");
    expect(
      await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "owner",
      }),
    ).toBe(member);
    expect(
      await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "creatorProceeds",
      }),
    ).toBe(originalProceeds);
    await expect(
      page.getByRole("region", { name: "Vesting and accounting" }),
    ).toContainText("Reserved creator funding");

    // Another caller advances accounting after each supplied payout transaction
    // but before the browser refreshes. This deliberately leaves positive cash.
    const selectors = [
      encodeFunctionData({
        abi: membershipTierAbi,
        functionName: "claimRewards",
        args: [[1n], 25n],
      }).slice(0, 10),
    ];
    await page.route(`${requiredAnvilRpc()}/`, async (route) => {
      const request = route.request().postDataJSON();
      if (
        Array.isArray(request) ||
        request.method !== "eth_sendTransaction" ||
        request.params?.[0]?.to?.toLowerCase() !== tier.toLowerCase() ||
        !selectors.includes(request.params?.[0]?.data?.slice(0, 10))
      )
        return route.continue();
      const upstream = await route.fetch();
      const response = await upstream.json();
      if (response.error || typeof response.result !== "string")
        throw new Error("Local claim submission failed");
      const receipt = await client.waitForTransactionReceipt({
        hash: response.result,
      });
      expectSuccessfulReceipt(receipt);
      await rpcRequest("evm_increaseTime", [60]);
      await rpcRequest("evm_mine");
      expectSuccessfulReceipt(
        await sendContract({
          account: creator,
          address: tier,
          abi: membershipTierAbi,
          functionName: "processAccounting",
          args: [25n],
        }),
      );
      evidence.push({
        receipt: receipt.transactionHash,
        events: parseEventLogs({
          abi: membershipTierAbi,
          logs: receipt.logs,
        }).filter((event) =>
          [
            "RewardClaimed",
            "ReferralClaimed",
            "CreatorProceedsWithdrawn",
          ].includes(event.eventName),
        ),
        after: await client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "previewAccounting",
          args: [1n, creator, creator, 0n],
        }),
      });
      await route.fulfill({ response: upstream, json: response });
    });
    await page.goto(`/chains/31337/tiers/${tier}?tokenId=1`);
    const memberPool = page.getByRole("region", {
      name: "Vesting and accounting",
    });
    await switchAnvilAccount(page, member);
    await page.getByText("Rewards & accounting", { exact: true }).click();
    await expect(memberPool).toContainText("Reserved for all members");
    await expect(memberPool).toContainText("This pool is shared");
    for (const [label, action] of [
      ["Membership rewards", "Claim rewards"],
      ["Creator proceeds", "Claim rewards"],
      ["Referral proceeds", "Claim rewards"],
    ]) {
      if (label === "Referral proceeds")
        await switchAnvilAccount(page, creator);
      const row = page.locator(".claim-row").filter({ hasText: label });
      await expect(row).toBeVisible();
      await page
        .locator(".claim-groups")
        .getByRole("button", { name: "Claim rewards" })
        .click();
      await expectReconciled(page, action);
      await expect(
        page
          .getByRole("status")
          .filter({ hasText: "New earnings may still become available." }),
      ).toContainText("Paid ");
      await expect(row).toBeVisible();
      const earned = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "previewAccounting",
        args: [1n, creator, creator, 0n],
      });
      expect(
        label === "Membership rewards"
          ? earned.settled.member
          : label === "Creator proceeds"
            ? earned.settled.creator
            : earned.settled.referral,
      ).toBeGreaterThan(0n);
    }
    expect(evidence).toHaveLength(3);
    const path = testInfo.outputPath("beneficiary-claims.json");
    await writeFile(
      path,
      JSON.stringify(
        {
          kind: "local mock payment token; real protocol",
          tier,
          originalCreator: creator,
          currentCreator: member,
          originalProceeds,
          evidence,
        },
        (_, value) => (typeof value === "bigint" ? String(value) : value),
        2,
      ),
    );
    await testInfo.attach("beneficiary-claims", {
      path,
      contentType: "application/json",
    });
    const accounting = page.locator("details.membership-accounting");
    if (
      !(await accounting.evaluate(
        (element) => (element as HTMLDetailsElement).open,
      ))
    )
      await accounting
        .getByText("Rewards & accounting", { exact: true })
        .click();
    await page
      .getByRole("region", { name: "Vesting and accounting" })
      .screenshot({ path: testInfo.outputPath("vesting-summary.png") });
    await page.screenshot({
      path: testInfo.outputPath("beneficiary-claims.png"),
      fullPage: true,
    });
  } finally {
    await revertAnvil(checkpoint);
  }
});
