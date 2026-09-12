import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { getAddress, parseEventLogs, zeroAddress } from "viem";
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
  switchAnvilAccount,
} from "./helpers/anvil";

test("@anvil permissionless paused batches retire memberships and preserve a zero-NFT owner's rewards", async ({
  page,
}, info) => {
  test.skip(!anvilEnabled, "Run through scripts/test-web-anvil.sh.");
  test.skip(
    info.project.name !== "desktop",
    "One mutation history is sufficient.",
  );
  test.setTimeout(180_000);
  const saved = await snapshotAnvil();
  const tier = requiredAnvilAddress("tier");
  const creator = requiredAnvilAddress("creator");
  const member = requiredAnvilAddress("member");
  const maintainer = requiredAnvilAddress("freshWallet");
  const paymentToken = requiredAnvilAddress("paymentToken");
  const client = anvilPublicClient();
  const common = { address: tier, abi: membershipTierAbi } as const;
  try {
    expectSuccessfulReceipt(
      await sendContract({
        ...common,
        account: creator,
        functionName: "setSupplyCap",
        args: [0n],
      }),
    );
    const price = await client.readContract({
      ...common,
      functionName: "pricePerPeriod",
    });
    expectSuccessfulReceipt(
      await sendContract({
        address: paymentToken,
        abi: usdgAbi,
        account: member,
        functionName: "approve",
        args: [tier, price],
      }),
    );
    const purchase = await sendContract({
      ...common,
      account: member,
      functionName: "createMembership",
      args: [1n, zeroAddress],
    });
    expectSuccessfulReceipt(purchase);
    const created = parseEventLogs({
      abi: membershipTierAbi,
      eventName: "Transfer",
      logs: purchase.logs,
      strict: true,
    }).find(
      (event) =>
        event.args.from === zeroAddress &&
        event.address.toLowerCase() === tier.toLowerCase(),
    );
    expect(created).toBeDefined();
    let expiration = await client.readContract({
      ...common,
      functionName: "expiresAt",
      args: [created!.args.tokenId],
    });
    for (let i = 0; i < 27; ++i) {
      const recipient = getAddress(
        `0x${(0x60000 + i).toString(16).padStart(40, "0")}`,
      );
      const receipt = await sendContract({
        ...common,
        account: creator,
        functionName: "grantMembership",
        args: [recipient, 1n],
      });
      expectSuccessfulReceipt(receipt);
      const grant = parseEventLogs({
        abi: membershipTierAbi,
        eventName: "Transfer",
        logs: receipt.logs,
        strict: true,
      }).find(
        (event) =>
          event.args.from === zeroAddress &&
          event.address.toLowerCase() === tier.toLowerCase(),
      );
      const end = await client.readContract({
        ...common,
        functionName: "expiresAt",
        args: [grant!.args.tokenId],
      });
      if (end > expiration) expiration = end;
    }
    expectSuccessfulReceipt(
      await sendContract({
        ...common,
        account: creator,
        functionName: "setPaused",
        args: [true],
      }),
    );
    await rpcRequest("evm_setNextBlockTimestamp", [Number(expiration + 1n)]);
    await rpcRequest("evm_mine");
    await installAnvilWallet(page, maintainer);
    await page.goto(`/chains/31337/tiers/${tier}/manage`);
    await connectAnvilWallet(page, maintainer);
    const maintenance = page.getByRole("region", {
      name: "Membership maintenance",
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
      path: info.outputPath("lifecycle-narrow.png"),
      fullPage: true,
    });
    await maintenance
      .getByRole("button", { name: "Advance maintenance" })
      .click();
    await expect(maintenance.getByRole("status")).toContainText(
      "More remains",
      { timeout: 25_000 },
    );
    const partial = await client.readContract({
      ...common,
      functionName: "accountingStatus",
    });
    expect(partial.complete).toBe(false);
    expect(partial.scheduledExpirations).toBeLessThan(28n);
    await maintenance
      .getByRole("button", { name: "Advance maintenance" })
      .click();
    await expect(maintenance).toContainText("This batch completed", {
      timeout: 25_000,
    });
    // The receipt confirms completion at its timestamp; interval mining may
    // advance time again before this read. All scheduled work must be gone.
    expect(
      await client.readContract({
        ...common,
        functionName: "accountingStatus",
      }),
    ).toMatchObject({
      scheduledMembers: 0n,
      scheduledExpirations: 0n,
      nextBoundary: 0n,
    });
    expect(
      await client.readContract({
        ...common,
        functionName: "balanceOf",
        args: [member],
      }),
    ).toBe(0n);
    const credit = await client.readContract({
      ...common,
      functionName: "claimableRetiredReward",
      args: [member],
    });
    expect(credit[0]).toBeGreaterThan(0n);
    const before = await client.readContract({
      address: paymentToken,
      abi: usdgAbi,
      functionName: "balanceOf",
      args: [member],
    });
    await page.goto(`/chains/31337/tiers/${tier}`);
    await connectAnvilWallet(page, maintainer);
    await switchAnvilAccount(page, member);
    await page.getByText("Rewards & accounting", { exact: true }).click();
    const ended = page.getByRole("region", {
      name: "Ended membership rewards",
    });
    await ended
      .getByRole("button", { name: "Claim ended membership rewards" })
      .click();
    await expect
      .poll(
        async () =>
          (
            await client.readContract({
              ...common,
              functionName: "claimableRetiredReward",
              args: [member],
            })
          )[0],
      )
      .toBe(0n);
    expect(
      await client.readContract({
        address: paymentToken,
        abi: usdgAbi,
        functionName: "balanceOf",
        args: [member],
      }),
    ).toBe(before + credit[0]);
    expect(
      (
        await client.readContract({
          ...common,
          functionName: "claimableRetiredReward",
          args: [member],
        })
      )[1],
    ).toBe(credit[1]);
  } finally {
    await revertAnvil(saved);
  }
});
