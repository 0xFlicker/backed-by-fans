import { expectSingleOwnedPosition } from "./helpers/membership-positions";
import { expect, test } from "@playwright/test";
import { erc20Abi, encodeFunctionData, encodeFunctionResult } from "viem";

import {
  membershipTierAbi,
  membershipFactoryAbi,
  protocolBuybackVaultAbi,
  iScaledUiAmountAbi,
} from "../../src/contracts";
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
  rpcRequest,
  revertAnvil,
  sendContract,
  snapshotAnvil,
  switchAnvilAccount,
} from "./helpers/anvil";

for (const scenario of [
  {
    name: "authentic AMD lifecycle",
    publishMultiplier: 1n,
    laterMultiplier: 1n,
  },
  {
    name: "labeled AMD display-read adjustments",
    publishMultiplier: 2n,
    laterMultiplier: 4n,
  },
])
  test(`@anvil publishes and operates ${scenario.name}`, async ({
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
    const tokenName = await client.readContract({
      address: scaledToken,
      abi: erc20Abi,
      functionName: "name",
    });
    const rawPrice = 50_000_000_000_000_000n / scenario.publishMultiplier;
    let shownMultiplier = 10n ** 18n;
    const shown = (raw: bigint) =>
      `${formatRawTokenAmount({ raw, decimals: 18, multiplier: shownMultiplier })} AMD`;

    try {
      const balance = await client.readContract({
        address: scaledToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [member],
      });
      if (balance < rawPrice * 2n)
        expectSuccessfulReceipt(
          await sendContract({
            account: creator,
            address: scaledToken,
            abi: erc20Abi,
            functionName: "transfer",
            args: [member, rawPrice * 2n - balance],
          }),
        );
      if (scenario.publishMultiplier !== 1n) {
        // Explicit view-only fault injection. The issuer implementation, raw
        // balances, transfers and successful contract operations stay authentic.
        const selector = encodeFunctionData({
          abi: iScaledUiAmountAbi,
          functionName: "uiMultiplier",
        });
        await page.route(`${requiredAnvilRpc()}/`, async (route) => {
          const payload = route.request().postDataJSON(),
            requests = Array.isArray(payload) ? payload : [payload];
          const targeted = (request: {
            method: string;
            params?: { to?: string; data?: string }[];
          }) =>
            request.method === "eth_call" &&
            request.params?.[0]?.to?.toLowerCase() ===
              scaledToken.toLowerCase() &&
            request.params?.[0]?.data === selector;
          if (!requests.some(targeted)) {
            await route.continue();
            return;
          }
          const upstream = await route.fetch(),
            data = await upstream.json();
          const responses = (Array.isArray(data) ? data : [data]).map((item) =>
            requests.some(
              (request) => request.id === item.id && targeted(request),
            )
              ? {
                  jsonrpc: "2.0",
                  id: item.id,
                  result: encodeFunctionResult({
                    abi: iScaledUiAmountAbi,
                    functionName: "uiMultiplier",
                    result: shownMultiplier,
                  }),
                }
              : item,
          );
          await route.fulfill({
            response: upstream,
            json: Array.isArray(data) ? responses : responses[0],
          });
        });
      }
      await installAnvilWallet(page, creator);
      await page.goto("/create");
      await connectAnvilWallet(page, creator);
      await page.getByLabel("Membership name").fill("AMD After Hours");
      await page.getByLabel("Symbol").fill("AMDHR");
      await page.getByRole("button", { name: /^price & period$/i }).click();
      await page.getByRole("radio", { name: /AMD/i }).check();
      await page.getByLabel("Price per period (AMD)").fill("0.05");
      await page.getByRole("button", { name: /^risks$/i }).click();
      await page
        .getByRole("checkbox", { name: /I understand the price, period/ })
        .check();
      await page.getByRole("button", { name: /^review$/i }).click();

      await expect(page.getByText(`${tokenName} (AMD)`)).toBeVisible();
      await expect(page.getByText("0.05 AMD / 30 days")).toBeVisible();

      shownMultiplier = scenario.publishMultiplier * 10n ** 18n;

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
      ).resolves.toBe(rawPrice);

      await page.goto(`/chains/31337/tiers/${tier}/manage`);
      await expect(page.getByText("0.05 AMD", { exact: true })).toBeVisible();

      shownMultiplier = scenario.laterMultiplier * 10n ** 18n;

      await page.goto(`/chains/31337/tiers/${tier}`);
      await connectAnvilWallet(page, creator);
      await switchAnvilAccount(page, member);
      await expect(
        page.getByText(shown(rawPrice), { exact: true }).first(),
      ).toBeVisible();
      const join = page.getByRole("button", { name: "New membership" });
      await expect(join).toBeEnabled();
      await join.click();
      await expectReconciled(page, "New membership");

      const tokenId = await expectSingleOwnedPosition(client, tier, member);
      const firstExpiration = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "expiresAt",
        args: [tokenId],
      });
      await page
        .getByLabel("Membership action")
        .selectOption(tokenId.toString());
      await page
        .getByRole("button", { name: `Renew membership #${tokenId}` })
        .click();
      await expectReconciled(page, `Renew membership #${tokenId}`);
      const renewedExpiration = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "expiresAt",
        args: [tokenId],
      });
      expect(renewedExpiration - firstExpiration).toBe(2_592_000n);

      // Settle half of the first period; the remaining paid time stays refundable.
      await rpcRequest("evm_setNextBlockTimestamp", [
        Number(firstExpiration - 1_296_000n),
      ]);
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
      const earnedReward = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "claimableReward",
        args: [tokenId],
      });
      expect(earnedReward).toBeGreaterThan(0n);
      expect(earnedReward).toBeLessThan(rawPrice / 10n);
      await page.reload();
      await switchAnvilAccount(page, member);
      const rewardRow = page
        .locator(".claim-row")
        .filter({ hasText: "Membership rewards" });
      await expect(rewardRow).toContainText(shown(earnedReward));
      await page
        .locator(".claim-groups")
        .getByRole("button", { name: "Claim rewards" })
        .click();
      await expectReconciled(page, "Claim rewards");
      await expect(
        client.readContract({
          address: scaledToken,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [factory],
        }),
      ).resolves.toBe(0n);
      await expect(
        client
          .readContract({
            address: tier,
            abi: membershipTierAbi,
            functionName: "allocationState",
            args: [tokenId],
          })
          .then((allocation) => allocation.allocatedScaled[3]),
      ).resolves.toBe(2n * (rawPrice / 100n) * (1n << 128n));
      await expect(
        client.readContract({
          address: tier,
          abi: membershipTierAbi,
          functionName: "pricePerPeriod",
        }),
      ).resolves.toBe(rawPrice);

      // A display-only adjustment also scales released public inventory;
      // the actual fee transfer and raw accounting use the unchanged asset.
      expectSuccessfulReceipt(
        await sendContract({
          account: member,
          address: tier,
          abi: membershipTierAbi,
          functionName: "processAccounting",
          args: [25n],
        }),
      );
      expectSuccessfulReceipt(
        await sendContract({
          account: member,
          address: tier,
          abi: membershipTierAbi,
          functionName: "releaseProtocolFees",
        }),
      );
      const vault = await client.readContract({
        address: factory,
        abi: membershipFactoryAbi,
        functionName: "buybackVault",
      });
      const inventory = await client.readContract({
        address: vault,
        abi: protocolBuybackVaultAbi,
        functionName: "inventory",
        args: [scaledToken, 0],
      });
      expect(inventory.available).toBeGreaterThan(0n);
      await page.goto("/chains/31337/protocol");
      const stockInventory = page.locator(".protocol-asset").filter({
        has: page.getByRole("heading", { name: "AMD", exact: true }),
      });
      await expect(
        stockInventory
          .getByRole("row")
          .filter({ hasText: "Available to process" })
          .locator("td")
          .first(),
      ).toHaveText(
        formatRawTokenAmount({
          raw: inventory.available,
          decimals: 18,
          multiplier: shownMultiplier,
        }),
      );

      const earnedCreator = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "creatorProceeds",
      });
      await page.goto(`/chains/31337/tiers/${tier}/manage`);
      await switchAnvilAccount(page, creator);
      await expect(
        page.getByRole("heading", {
          name: shown(earnedCreator),
        }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Pause time increases" }).click();
      await expectReconciled(page, "Pause tier");
      await page
        .getByLabel("Membership token", { exact: true })
        .fill(tokenId.toString());
      await page.getByRole("button", { name: "Read refund preview" }).click();
      const { grossRefund } = await client.readContract({
        address: tier,
        abi: membershipTierAbi,
        functionName: "previewRefund",
        args: [tokenId],
      });
      const refundPreview = page.locator(".refund-preview[aria-live]");
      const display = (raw: bigint) =>
        `${formatRawTokenAmount({
          raw,
          decimals: 18,
          multiplier: shownMultiplier,
        })} AMD`;
      await expect(refundPreview).toContainText(display(grossRefund));

      await page.getByRole("button", { name: "Refund unused time" }).click();
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
