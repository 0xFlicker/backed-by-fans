import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { erc20Abi, zeroAddress } from "viem";
import { membershipTierAbi } from "../../src/contracts";
import {
  createPortfolioTier,
  mintedPosition,
} from "./helpers/membership-positions";
import {
  anvilEnabled,
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
  switchAnvilAccount,
} from "./helpers/anvil";

test("@anvil holder enrolls, a third wallet refills whole periods, and expiration remains final", async ({
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
  const executor = requiredAnvilAddress("newOwner");
  const paymentToken = requiredAnvilAddress("paymentToken");
  try {
    const { tier, price } = await createPortfolioTier(
      "Periodic refill acceptance",
      3000,
    );
    const common = { address: tier, abi: membershipTierAbi } as const;
    expectSuccessfulReceipt(
      await sendContract({
        account: member,
        address: paymentToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [tier, price * 10n],
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
    await installAnvilWallet(page, creator);
    await page.goto(`/chains/31337/tiers/${tier}/manage`);
    await connectAnvilWallet(page, creator);
    await page
      .getByRole("button", { name: "Enable periodic refill", exact: true })
      .click();
    await expectReconciled(page, "Enable periodic refill");
    expect(
      (
        await client.readContract({
          ...common,
          functionName: "refillEnrollment",
          args: [tokenId],
        })
      ).targetSeconds,
    ).toBe(0n);
    await page.goto(`/chains/31337/tiers/${tier}`);
    await switchAnvilAccount(page, member);
    const region = page.getByRole("region", {
      name: "Periodic refill",
      exact: true,
    });
    await region
      .getByLabel("Refill membership NFT", { exact: true })
      .fill(tokenId.toString());
    await region
      .getByRole("button", { name: "Review periodic refill", exact: true })
      .click();
    await region
      .getByLabel("Refill target (days)", { exact: true })
      .fill("2.5");
    const before = await client.readContract({
      address: paymentToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [member],
    });
    await region
      .getByRole("button", {
        name: "Enable periodic refill for this NFT",
        exact: true,
      })
      .click();
    await expectReconciled(page, `Set refill target for #${tokenId}`);
    expect(
      await client.readContract({
        address: paymentToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [member],
      }),
    ).toBe(before);
    expect(
      (
        await client.readContract({
          ...common,
          functionName: "refillEnrollment",
          args: [tokenId],
        })
      ).targetSeconds,
    ).toBe(216000n);
    const expiry = await client.readContract({
      ...common,
      functionName: "expiresAt",
      args: [tokenId],
    });
    await switchAnvilAccount(page, executor);
    await region
      .getByLabel("Refill membership NFT", { exact: true })
      .fill(tokenId.toString());
    await region
      .getByRole("button", { name: "Review periodic refill", exact: true })
      .click();
    await expect(
      region.getByRole("button", { name: "Stop periodic refill", exact: true }),
    ).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      (
        await new AxeBuilder({ page })
          .include('[aria-label="Periodic refill"]')
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await region
      .getByRole("button", { name: "Refill 2 periods", exact: true })
      .click();
    await expectReconciled(page, `Refill membership #${tokenId}`);
    await expect(region.getByRole("status")).toContainText(
      "Purchased 2 periods",
    );
    expect(
      await client.readContract({
        ...common,
        functionName: "expiresAt",
        args: [tokenId],
      }),
    ).toBe(expiry + 172800n);
    expect(
      before -
        (await client.readContract({
          address: paymentToken,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [member],
        })),
    ).toBe(2n * price);
    expectSuccessfulReceipt(
      await sendContract({
        ...common,
        account: member,
        functionName: "renewMembership",
        args: [tokenId, 1n, zeroAddress, 25n],
      }),
    );
    await switchAnvilAccount(page, member);
    await region
      .getByLabel("Refill membership NFT", { exact: true })
      .fill(tokenId.toString());
    await region
      .getByRole("button", { name: "Review periodic refill", exact: true })
      .click();
    await expect(region).toContainText("Target covered");
    await region.getByLabel("Refill target (days)", { exact: true }).fill("6");
    await region
      .getByRole("button", { name: "Update refill target", exact: true })
      .click();
    await expectReconciled(page, `Set refill target for #${tokenId}`);
    const finalExpiry = await client.readContract({
      ...common,
      functionName: "expiresAt",
      args: [tokenId],
    });
    await rpcRequest("evm_setNextBlockTimestamp", [Number(finalExpiry)]);
    await rpcRequest("evm_mine");
    await page.reload();
    await switchAnvilAccount(page, member);
    await region
      .getByLabel("Refill membership NFT", { exact: true })
      .fill(tokenId.toString());
    await region
      .getByRole("button", { name: "Review periodic refill", exact: true })
      .click();
    await expect(region).toContainText("Membership expired");
    await expect(
      region.getByRole("button", { name: /^Refill \d+ periods$/ }),
    ).toHaveCount(0);
    await expect(
      client.simulateContract({
        ...common,
        account: executor,
        functionName: "refillMembership",
        args: [tokenId, 1n, 25n],
      }),
    ).rejects.toThrow();
  } finally {
    await revertAnvil(saved);
  }
});

test("@anvil shared coverage, a competing refill, and paused allowance controls preserve enrollment", async ({
  page,
}, info) => {
  test.skip(
    !anvilEnabled || info.project.name !== "desktop",
    "One isolated mutation history.",
  );
  test.setTimeout(240_000);
  const saved = await snapshotAnvil();
  const client = anvilPublicClient();
  const creator = requiredAnvilAddress("creator");
  const member = requiredAnvilAddress("member");
  const executor = requiredAnvilAddress("newOwner");
  const paymentToken = requiredAnvilAddress("paymentToken");
  try {
    const { tier, price } = await createPortfolioTier(
      "Shared refill controls",
      3000,
      { price: 20_000_000n, periodicEnabled: true },
    );
    const common = { address: tier, abi: membershipTierAbi } as const;
    expectSuccessfulReceipt(
      await sendContract({
        account: member,
        address: paymentToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [tier, 2n * price],
      }),
    );
    const first = mintedPosition(
      await sendContract({
        ...common,
        account: member,
        functionName: "createMembership",
        args: [1n, zeroAddress, 25n],
      }),
      tier,
      member,
    );
    const second = mintedPosition(
      await sendContract({
        ...common,
        account: member,
        functionName: "createMembership",
        args: [1n, zeroAddress, 25n],
      }),
      tier,
      member,
    );
    const balance = await client.readContract({
      address: paymentToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [member],
    });
    expectSuccessfulReceipt(
      await sendContract({
        account: member,
        address: paymentToken,
        abi: erc20Abi,
        functionName: "transfer",
        args: [creator, balance - 55_000_000n],
      }),
    );
    for (const tokenId of [first, second])
      expectSuccessfulReceipt(
        await sendContract({
          ...common,
          account: member,
          functionName: "setRefillTarget",
          args: [tokenId, 259200n, zeroAddress],
        }),
      );
    await installAnvilWallet(page, member);
    await page.goto(`/chains/31337/tiers/${tier}`);
    await connectAnvilWallet(page, member);
    const region = page.getByRole("region", {
      name: "Periodic refill",
      exact: true,
    });
    const review = async (tokenId = second) => {
      await region
        .getByLabel("Refill membership NFT", { exact: true })
        .fill(tokenId.toString());
      await region
        .getByRole("button", { name: "Review periodic refill", exact: true })
        .click();
      await expect(
        region.getByLabel("Refill approval", { exact: true }),
      ).toBeVisible();
    };
    await review();
    await region
      .getByLabel("Refill approval", { exact: true })
      .selectOption("finite");
    await region.getByLabel("Approval periods", { exact: true }).fill("2");
    await region
      .getByRole("button", { name: "Set tier allowance", exact: true })
      .click();
    await expectReconciled(page, "Set tier allowance");
    await review();
    await expect(region).toContainText("2.75 balance-equivalent periods");
    await expect(region).toContainText("2 allowance-equivalent periods");
    await expect(region).toContainText(
      "Other memberships share this balance and tier allowance",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      (
        await new AxeBuilder({ page })
          .include('[aria-label="Periodic refill"]')
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await region.getByLabel("Refill target (days)", { exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(
      region.getByRole("button", { name: "Update refill target", exact: true }),
    ).toBeFocused();
    await page.screenshot({
      path: info.outputPath("refill-coverage-phone.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 768, height: 1024 });
    expect(
      (
        await new AxeBuilder({ page })
          .include('[aria-label="Periodic refill"]')
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("refill-coverage-tablet.png"),
      fullPage: true,
    });
    expectSuccessfulReceipt(
      await sendContract({
        ...common,
        account: executor,
        functionName: "refillMembership",
        args: [first, 2n, 25n],
      }),
    );
    await region
      .getByRole("button", { name: "Refill 2 periods", exact: true })
      .click();
    await expectReconciled(page, `Refill membership #${second}`);
    await expect(region.getByRole("status")).toContainText("No refill payment");
    expect(
      await client.readContract({
        address: paymentToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [member],
      }),
    ).toBe(15_000_000n);
    expectSuccessfulReceipt(
      await sendContract({
        ...common,
        account: creator,
        functionName: "setPaused",
        args: [true],
      }),
    );
    await page.reload();
    await review();
    await region
      .getByLabel("Refill approval", { exact: true })
      .selectOption("unlimited");
    await region
      .getByRole("button", { name: "Set tier allowance", exact: true })
      .click();
    await expectReconciled(page, "Set tier allowance");
    await review();
    await expect(region).toContainText("Unlimited allowance");
    await region
      .getByLabel("Refill approval", { exact: true })
      .selectOption("finite");
    await region.getByLabel("Approval periods", { exact: true }).fill("2");
    await expect(region).toContainText("two approvals");
    await region
      .getByRole("button", { name: "Set tier allowance", exact: true })
      .click();
    await expectReconciled(page, "Set tier allowance");
    expect(
      await client.readContract({
        address: paymentToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [member, tier],
      }),
    ).toBe(40_000_000n);
    await review();
    await region
      .getByRole("button", { name: "Revoke tier allowance", exact: true })
      .click();
    await expectReconciled(page, "Revoke tier allowance");
    await expect(region.getByRole("status")).toContainText(
      "Enrollment is unchanged",
    );
    expect(
      (
        await client.readContract({
          ...common,
          functionName: "refillEnrollment",
          args: [second],
        })
      ).targetSeconds,
    ).toBe(259200n);
    await review();
    await region.getByLabel("Refill target (days)", { exact: true }).fill("4");
    await region
      .getByRole("button", { name: "Update refill target", exact: true })
      .click();
    await expectReconciled(page, `Set refill target for #${second}`);
    await review();
    await region
      .getByRole("button", { name: "Stop periodic refill", exact: true })
      .click();
    await expectReconciled(page, `Stop refill for #${second}`);
    expect(
      (
        await client.readContract({
          ...common,
          functionName: "refillEnrollment",
          args: [second],
        })
      ).targetSeconds,
    ).toBe(0n);
    await review();
    await expect(
      region.getByRole("heading", { name: "Periodic refill off", exact: true }),
    ).toBeVisible();
    await region.getByLabel("Refill target (days)", { exact: true }).fill("3");
    await region
      .getByRole("button", {
        name: "Enable periodic refill for this NFT",
        exact: true,
      })
      .click();
    await expectReconciled(page, `Set refill target for #${second}`);
    expectSuccessfulReceipt(
      await sendContract({
        account: creator,
        address: paymentToken,
        abi: erc20Abi,
        functionName: "transfer",
        args: [member, 40_000_000n],
      }),
    );
    await review();
    await region
      .getByLabel("Refill approval", { exact: true })
      .selectOption("finite");
    await region.getByLabel("Approval periods", { exact: true }).fill("2");
    await region
      .getByRole("button", { name: "Set tier allowance", exact: true })
      .click();
    await expectReconciled(page, "Set tier allowance");
    expectSuccessfulReceipt(
      await sendContract({
        ...common,
        account: creator,
        functionName: "setPaused",
        args: [false],
      }),
    );
    await page.reload();
    await review();
    await region
      .getByRole("button", { name: "Refill 2 periods", exact: true })
      .click();
    await expectReconciled(page, `Refill membership #${second}`);
    await expect(region.getByRole("status")).toContainText(
      "Purchased 2 periods",
    );
  } finally {
    await revertAnvil(saved);
  }
});

test("@anvil grant revocation and transfer clear refill consent and require an explicit restart", async ({
  page,
}, info) => {
  test.skip(
    !anvilEnabled || info.project.name !== "desktop",
    "One isolated mutation history.",
  );
  test.setTimeout(240_000);
  const saved = await snapshotAnvil();
  const client = anvilPublicClient();
  const creator = requiredAnvilAddress("creator");
  const member = requiredAnvilAddress("member");
  const recipient = requiredAnvilAddress("giftRecipient");
  const paymentToken = requiredAnvilAddress("paymentToken");
  try {
    const { tier, price } = await createPortfolioTier(
      "Refill consent lifecycle",
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
        account: creator,
        functionName: "addGrantTime",
        args: [tokenId, member, 2n, 25n],
      }),
    );
    expectSuccessfulReceipt(
      await sendContract({
        ...common,
        account: member,
        functionName: "setRefillTarget",
        args: [tokenId, 345600n, zeroAddress],
      }),
    );
    const before = await client.readContract({
      address: paymentToken,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [member],
    });
    await installAnvilWallet(page, creator);
    await page.goto(`/chains/31337/tiers/${tier}/manage`);
    await connectAnvilWallet(page, creator);
    await page
      .getByLabel("Membership token to revoke")
      .fill(tokenId.toString());
    await expect(
      page.getByText(
        "Revoking this gifted time will also stop this membership’s periodic refill. The holder can enroll again.",
        { exact: true },
      ),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Revoke grant time", exact: true })
      .click();
    await expectReconciled(page, "Revoke remaining grant time");
    expect(
      (
        await client.readContract({
          ...common,
          functionName: "refillEnrollment",
          args: [tokenId],
        })
      ).targetSeconds,
    ).toBe(0n);
    expect(
      await client.readContract({
        address: paymentToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [member],
      }),
    ).toBe(before);
    await page.goto(`/chains/31337/tiers/${tier}`);
    await switchAnvilAccount(page, member);
    const region = page.getByRole("region", {
      name: "Periodic refill",
      exact: true,
    });
    const review = async () => {
      await region
        .getByLabel("Refill membership NFT", { exact: true })
        .fill(tokenId.toString());
      await region
        .getByRole("button", { name: "Review periodic refill", exact: true })
        .click();
      await expect(
        region.getByLabel("Refill target (days)", { exact: true }),
      ).toBeVisible();
    };
    await review();
    await expect(
      region.getByRole("heading", { name: "Periodic refill off", exact: true }),
    ).toBeVisible();
    await region
      .getByLabel("Refill target (days)", { exact: true })
      .fill("2.5");
    await region
      .getByRole("button", {
        name: "Enable periodic refill for this NFT",
        exact: true,
      })
      .click();
    await expectReconciled(page, `Set refill target for #${tokenId}`);
    await review();
    expectSuccessfulReceipt(
      await sendContract({
        ...common,
        account: member,
        functionName: "setRefillTarget",
        args: [tokenId, 345600n, zeroAddress],
      }),
    );
    await region
      .getByRole("button", { name: "Refill 2 periods", exact: true })
      .click();
    await expect(
      page.getByText(
        "Membership ownership or refill terms changed. Review again.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      await client.readContract({
        address: paymentToken,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [member],
      }),
    ).toBe(before);
    await review();
    const transfer = page.getByRole("region", {
      name: `Transfer membership #${tokenId}`,
      exact: true,
    });
    await expect(transfer).toContainText(
      "Transfer stops periodic refill. The recipient must opt in again.",
    );
    await transfer
      .getByLabel("Transfer recipient wallet", { exact: true })
      .fill(recipient);
    await transfer.getByRole("checkbox").check();
    await transfer
      .getByRole("button", {
        name: `Transfer membership #${tokenId}`,
        exact: true,
      })
      .click();
    await expectReconciled(page, `Transfer membership #${tokenId}`);
    expect(
      (
        await client.readContract({
          ...common,
          functionName: "refillEnrollment",
          args: [tokenId],
        })
      ).authorizingOwner,
    ).toBe(zeroAddress);
    await region
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
    await switchAnvilAccount(page, recipient);
    await review();
    await expect(
      region.getByRole("heading", { name: "Periodic refill off", exact: true }),
    ).toBeVisible();
    await region
      .getByLabel("Refill target (days)", { exact: true })
      .fill("2.5");
    await region
      .getByRole("button", {
        name: "Enable periodic refill for this NFT",
        exact: true,
      })
      .click();
    await expectReconciled(page, `Set refill target for #${tokenId}`);
    expect(
      (
        await client.readContract({
          ...common,
          functionName: "refillEnrollment",
          args: [tokenId],
        })
      ).authorizingOwner.toLowerCase(),
    ).toBe(recipient.toLowerCase());
  } finally {
    await revertAnvil(saved);
  }
});
