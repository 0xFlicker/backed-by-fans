import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { erc20Abi, parseEventLogs, zeroAddress } from "viem";
import { membershipTierAbi } from "../../src/contracts";
import {
  createPortfolioTier,
  mintedPosition,
} from "./helpers/membership-positions";
import { reviewMemberCancellation } from "./helpers/cancellation";
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

test("@anvil approved operator cancels a transferred membership while paused, paying its owner and retaining creator proceeds", async ({
  page,
}, info) => {
  test.skip(!anvilEnabled, "Requires the isolated fork fixture.");
  test.skip(
    info.project.name !== "desktop",
    "One sequential mutation history.",
  );
  test.setTimeout(180_000);
  const saved = await snapshotAnvil();
  const client = anvilPublicClient();
  const creator = requiredAnvilAddress("creator");
  const member = requiredAnvilAddress("member");
  const recipient = requiredAnvilAddress("giftRecipient");
  const operator = requiredAnvilAddress("newOwner");
  const paymentToken = requiredAnvilAddress("paymentToken");
  try {
    const { tier, price } = await createPortfolioTier(
      "Cancellation retention acceptance",
      4000,
    );
    const common = { address: tier, abi: membershipTierAbi } as const;
    expectSuccessfulReceipt(
      await sendContract({
        account: member,
        address: paymentToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [tier, price * 2n],
      }),
    );
    const tokenId = mintedPosition(
      await sendContract({
        ...common,
        account: member,
        functionName: "createMembership",
        args: [2n, zeroAddress, 25n],
      }),
      tier,
      member,
    );
    expectSuccessfulReceipt(
      await sendContract({
        ...common,
        account: member,
        functionName: "transferFrom",
        args: [member, recipient, tokenId],
      }),
    );
    expectSuccessfulReceipt(
      await sendContract({
        ...common,
        account: creator,
        functionName: "setPaused",
        args: [true],
      }),
    );
    await installAnvilWallet(page, creator);
    await page.goto(`/chains/31337/tiers/${tier}/manage`);
    await connectAnvilWallet(page, creator);
    const retention = page.getByLabel("Creator share on cancellation (%)", {
      exact: true,
    });
    await retention.fill("41");
    await expect(
      page.getByRole("button", { name: "Lower creator share", exact: true }),
    ).toBeDisabled();
    await retention.fill("30");
    await page
      .getByRole("button", { name: "Lower creator share", exact: true })
      .click();
    await expectReconciled(page, "Lower cancellation retention");
    expect(
      await client.readContract({
        ...common,
        functionName: "creatorRetentionBps",
      }),
    ).toBe(3000);
    await page.goto(`/chains/31337/tiers/${tier}`);
    await page
      .getByLabel("Membership to cancel", { exact: true })
      .fill(tokenId.toString());
    await page
      .getByRole("button", { name: "Review cancellation", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Cancel membership", exact: true }),
    ).toContainText("Only the current owner or approved operator can cancel.");
    expectSuccessfulReceipt(
      await sendContract({
        ...common,
        account: recipient,
        functionName: "approve",
        args: [operator, tokenId],
      }),
    );
    await switchAnvilAccount(page, operator);
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByLabel("Membership to cancel", { exact: true })
      .fill(tokenId.toString());
    await reviewMemberCancellation(page);
    const region = page.getByRole("region", {
      name: "Cancel membership",
      exact: true,
    });
    await expect(region).toContainText("30% of unused funding");
    await expect(region).toContainText(recipient);
    const accessibility = await new AxeBuilder({ page })
      .include('[aria-label="Cancel membership"]')
      .analyze();
    expect(accessibility.violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const before = await client.readContract({
      address: paymentToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [recipient],
    });
    const firstBlock = await client.getBlockNumber({ cacheTime: 0 });
    const confirmation = page.getByRole("checkbox", {
      name: /End membership #/,
    });
    await confirmation.uncheck();
    await confirmation.focus();
    await page.keyboard.press("Space");
    await expect(confirmation).toBeChecked();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("button", {
        name: `Cancel membership #${tokenId}`,
        exact: true,
      }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expectReconciled(page, `Cancel membership #${tokenId}`);
    await expect(region.getByRole("status")).toContainText(
      `Canceled membership #${tokenId}`,
    );
    expect(
      await region.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const events = await client.getContractEvents({
      ...common,
      eventName: "MembershipCanceled",
      fromBlock: firstBlock,
    });
    expect(events).toHaveLength(1);
    const receipt = await client.getTransactionReceipt({
      hash: events[0].transactionHash,
    });
    const event = parseEventLogs({
      abi: membershipTierAbi,
      eventName: "MembershipCanceled",
      logs: receipt.logs,
      strict: true,
    })[0];
    expect(event.args.owner.toLowerCase()).toBe(recipient.toLowerCase());
    expect(event.args.operator.toLowerCase()).toBe(operator.toLowerCase());
    expect(event.args.ownerRefund).toBe(
      (event.args.canceledGross * 7000n) / 10000n,
    );
    expect(event.args.creatorRetained + event.args.ownerRefund).toBe(
      event.args.canceledGross,
    );
    const after = await client.readContract({
      address: paymentToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [recipient],
    });
    expect(after - before).toBe(event.args.ownerRefund);
    await expect(
      client.readContract({
        ...common,
        functionName: "ownerOf",
        args: [tokenId],
      }),
    ).rejects.toThrow();
    const totals = await client.readContract({
      ...common,
      functionName: "previewPaymentTotals",
      args: [25n],
    });
    expect(totals.creatorCancellationProceeds).toBe(event.args.creatorRetained);
    expect(totals.refunded).toBe(event.args.ownerRefund);
  } finally {
    await revertAnvil(saved);
  }
});

for (const refillFirst of [true, false]) {
  test(`@anvil ${refillFirst ? "refill then cancellation settles the added funding" : "cancellation then refill cannot charge or revive"}`, async ({
    page,
  }, info) => {
    test.skip(
      !anvilEnabled || info.project.name !== "desktop",
      "One isolated mutation history.",
    );
    test.setTimeout(180_000);
    const saved = await snapshotAnvil();
    const client = anvilPublicClient();
    const member = requiredAnvilAddress("member");
    const executor = requiredAnvilAddress("newOwner");
    const paymentToken = requiredAnvilAddress("paymentToken");
    try {
      const { tier, price } = await createPortfolioTier(
        `Cancellation refill order ${refillFirst}`,
        3000,
        { periodicEnabled: true },
      );
      const common = { address: tier, abi: membershipTierAbi } as const;
      expectSuccessfulReceipt(
        await sendContract({
          account: member,
          address: paymentToken,
          abi: erc20Abi,
          functionName: "approve",
          args: [tier, 10n * price],
        }),
      );
      const tokenId = mintedPosition(
        await sendContract({
          ...common,
          account: member,
          functionName: "createMembership",
          args: [1n, zeroAddress, 25n],
        }),
        tier,
        member,
      );
      expectSuccessfulReceipt(
        await sendContract({
          ...common,
          account: member,
          functionName: "setRefillTarget",
          args: [tokenId, 216000n, zeroAddress],
        }),
      );
      await installAnvilWallet(page, member);
      await page.goto(`/chains/31337/tiers/${tier}`);
      await connectAnvilWallet(page, member);
      const refill = page.getByRole("region", {
        name: "Periodic refill",
        exact: true,
      });
      await refill
        .getByLabel("Refill membership NFT", { exact: true })
        .fill(tokenId.toString());
      await refill
        .getByRole("button", { name: "Review periodic refill", exact: true })
        .click();
      await expect(
        refill.getByRole("button", { name: "Refill 2 periods", exact: true }),
      ).toBeEnabled();
      await page
        .getByLabel("Membership to cancel", { exact: true })
        .fill(tokenId.toString());
      await reviewMemberCancellation(page);
      if (refillFirst) {
        await refill
          .getByRole("button", { name: "Refill 2 periods", exact: true })
          .click();
        await expectReconciled(page, `Refill membership #${tokenId}`);
      }
      const before = await client.readContract({
        address: paymentToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [member],
      });
      const firstBlock = await client.getBlockNumber({ cacheTime: 0 });
      await page
        .getByRole("button", {
          name: `Cancel membership #${tokenId}`,
          exact: true,
        })
        .click();
      await expectReconciled(page, `Cancel membership #${tokenId}`);
      const canceled = (
        await client.getContractEvents({
          ...common,
          eventName: "MembershipCanceled",
          fromBlock: firstBlock,
        })
      )[0];
      expect(canceled.args.ownerRefund).toBeGreaterThan(0n);
      if (refillFirst)
        expect(canceled.args.canceledGross!).toBeGreaterThan(price);
      expect(
        (await client.readContract({
          address: paymentToken,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [member],
        })) - before,
      ).toBe(canceled.args.ownerRefund);
      const receipt = await client.getTransactionReceipt({
        hash: canceled.transactionHash,
      });
      const update = parseEventLogs({
        abi: membershipTierAbi,
        eventName: "SubscriptionUpdate",
        logs: receipt.logs,
      })[0];
      expect(update.args.expiration).toBe(0n);
      expect(
        (
          await client.readContract({
            ...common,
            functionName: "refillEnrollment",
            args: [tokenId],
          })
        ).targetSeconds,
      ).toBe(0n);
      const afterCancel = await client.readContract({
        address: paymentToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [member],
      });
      await refill
        .getByRole("button", { name: "Review periodic refill", exact: true })
        .click();
      await expect(refill).toContainText("Membership retired");
      await refill
        .getByRole("button", { name: "Revoke tier allowance", exact: true })
        .click();
      await expectReconciled(page, "Revoke tier allowance");
      expect(
        await client.readContract({
          address: paymentToken,
          abi: erc20Abi,
          functionName: "allowance",
          args: [member, tier],
        }),
      ).toBe(0n);

      await expect(
        refill.getByRole("button", { name: /^Refill \d+ periods$/ }),
      ).toHaveCount(0);
      await expect(
        client.simulateContract({
          ...common,
          account: executor,
          functionName: "refillMembership",
          args: [tokenId, 1n, 25n],
        }),
      ).rejects.toThrow();
      expect(
        await client.readContract({
          address: paymentToken,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [member],
        }),
      ).toBe(afterCancel);
    } finally {
      await revertAnvil(saved);
    }
  });
}
