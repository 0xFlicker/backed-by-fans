import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { getAddress, zeroAddress } from "viem";
import { membershipTierAbi, usdgAbi } from "../../src/contracts";
import { mintedPosition } from "./helpers/membership-positions";
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

test("@anvil transfers a selected live position while paused with an incomplete preview, then refunds its current owner", async ({
  page,
}, info) => {
  test.skip(!anvilEnabled, "Run through scripts/test-web-anvil.sh.");
  test.skip(
    info.project.name !== "desktop",
    "One mutation history is sufficient.",
  );
  // The fixture mines 260 independent grants on a one-second block interval.
  test.setTimeout(600_000);
  const saved = await snapshotAnvil();
  const tier = requiredAnvilAddress("tier"),
    creator = requiredAnvilAddress("creator"),
    member = requiredAnvilAddress("member"),
    recipient = requiredAnvilAddress("giftRecipient"),
    token = requiredAnvilAddress("paymentToken");
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
        address: token,
        abi: usdgAbi,
        account: member,
        functionName: "approve",
        args: [tier, price * 6n],
      }),
    );
    const first = mintedPosition(
      await sendContract({
        ...common,
        account: member,
        functionName: "createMembership",
        args: [2n, zeroAddress],
      }),
      tier,
      member,
    );
    const sibling = mintedPosition(
      await sendContract({
        ...common,
        account: member,
        functionName: "createMembership",
        args: [2n, zeroAddress],
      }),
      tier,
      member,
    );
    const recipientExisting = mintedPosition(
      await sendContract({
        ...common,
        account: member,
        functionName: "giftMembership",
        args: [recipient, 2n],
      }),
      tier,
      recipient,
    );
    let expiry = 0n;
    for (let i = 0; i < 260; ++i) {
      const grantee = getAddress(
        `0x${(0x10000 + i).toString(16).padStart(40, "0")}`,
      );
      const id = mintedPosition(
        await sendContract({
          ...common,
          account: creator,
          functionName: "grantMembership",
          args: [grantee, 1n],
        }),
        tier,
        grantee,
      );
      expiry = await client.readContract({
        ...common,
        functionName: "expiresAt",
        args: [id],
      });
    }
    await rpcRequest("evm_setNextBlockTimestamp", [Number(expiry)]);
    await rpcRequest("evm_mine");
    expectSuccessfulReceipt(
      await sendContract({
        ...common,
        account: creator,
        functionName: "setPaused",
        args: [true],
      }),
    );
    const fingerprint = async () =>
      Promise.all([
        client.readContract({
          ...common,
          functionName: "sharesOf",
          args: [first],
        }),
        client.readContract({
          ...common,
          functionName: "expiresAt",
          args: [first],
        }),
        client.readContract({
          ...common,
          functionName: "referralOf",
          args: [first],
        }),
        client.readContract({
          ...common,
          functionName: "claimableReward",
          args: [first],
        }),
        client.readContract({ ...common, functionName: "accountingStatus" }),
      ]);
    const before = await fingerprint();
    expect(
      (
        await client.readContract({
          ...common,
          functionName: "previewAccounting",
          args: [first, member, member, 256n],
        })
      ).current.status.complete,
    ).toBe(false);
    await installAnvilWallet(page, member);
    await page.goto(`/chains/31337/tiers/${tier}?tokenId=${first}`);
    await connectAnvilWallet(page, member);
    const transfer = page.getByRole("region", {
      name: `Transfer membership #${first}`,
      exact: true,
    });
    await expect(transfer).toBeVisible();
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

    await transfer.getByText("NFT transfer approvals", { exact: true }).click();
    await transfer.getByLabel("Token transfer delegate").fill(recipient);
    await transfer
      .getByRole("button", { name: "Approve token transfer", exact: true })
      .click();
    await expectReconciled(page, "Update token transfer approval");
    expect(
      await client.readContract({
        ...common,
        functionName: "getApproved",
        args: [first],
      }),
    ).toBe(recipient);
    await expect(
      client.simulateContract({
        ...common,
        account: recipient,
        functionName: "claimReward",
        args: [first],
      }),
    ).rejects.toThrow();
    await transfer.getByLabel("Transfer recipient wallet").fill(recipient);
    await transfer
      .getByRole("checkbox", { name: /transfer the entire membership/i })
      .check();
    await expect(
      transfer.getByRole("button", {
        name: `Transfer membership #${first}`,
        exact: true,
      }),
    ).toBeEnabled();
    await transfer
      .getByRole("button", {
        name: `Transfer membership #${first}`,
        exact: true,
      })
      .click();
    await expectReconciled(page, `Transfer membership #${first}`);
    expect(
      await client.readContract({
        ...common,
        functionName: "ownerOf",
        args: [first],
      }),
    ).toBe(recipient);
    expect(
      await client.readContract({
        ...common,
        functionName: "ownerOf",
        args: [sibling],
      }),
    ).toBe(member);
    expect(
      await client.readContract({
        ...common,
        functionName: "ownerOf",
        args: [recipientExisting],
      }),
    ).toBe(recipient);
    expect(
      await client.readContract({
        ...common,
        functionName: "getApproved",
        args: [first],
      }),
    ).toBe(zeroAddress);
    expect(await fingerprint()).toEqual(before);
    await expect(
      client.simulateContract({
        ...common,
        account: member,
        functionName: "claimReward",
        args: [first],
      }),
    ).rejects.toThrow();
    await expect(
      client.simulateContract({
        ...common,
        account: member,
        functionName: "renewMembership",
        args: [first, 1n, zeroAddress],
      }),
    ).rejects.toThrow();
    for (
      let batch = 0;
      batch < 12 &&
      (
        await client.readContract({
          ...common,
          functionName: "accountingStatus",
        })
      ).scheduledExpirations > 3n;
      ++batch
    ) {
      expectSuccessfulReceipt(
        await sendContract({
          ...common,
          account: member,
          functionName: "processExpirations",
          args: [25n],
        }),
      );
    }
    const caughtUp = await client.readContract({
      ...common,
      functionName: "accountingStatus",
    });
    expect(caughtUp.scheduledExpirations).toBe(3n);
    expect(caughtUp.nextBoundary).toBeGreaterThan(expiry);
    const beforeCash = await client.readContract({
      address: token,
      abi: usdgAbi,
      functionName: "balanceOf",
      args: [recipient],
    });
    await page.goto(`/chains/31337/tiers/${tier}/manage`);
    await connectAnvilWallet(page, member);
    await switchAnvilAccount(page, creator);
    await page
      .getByLabel("Membership token", { exact: true })
      .fill(first.toString());
    await page.getByRole("button", { name: "Read refund preview" }).click();
    await expect(page.locator(".refund-preview[aria-live]")).toContainText(
      recipient,
    );
    await page
      .getByRole("button", { name: "Refund unused time", exact: true })
      .click();
    await expectReconciled(page, `Refund membership #${first}`);
    expect(
      await client.readContract({
        address: token,
        abi: usdgAbi,
        functionName: "balanceOf",
        args: [recipient],
      }),
    ).toBeGreaterThan(beforeCash);
    await expect(
      client.readContract({
        ...common,
        functionName: "ownerOf",
        args: [first],
      }),
    ).rejects.toThrow();
    const retiredCredit = await client.readContract({
      ...common,
      functionName: "claimableRetiredReward",
      args: [recipient],
    });
    expect(retiredCredit[0]).toBeGreaterThan(0n);
    const beforeClaim = await client.readContract({
      address: token,
      abi: usdgAbi,
      functionName: "balanceOf",
      args: [recipient],
    });
    await page.goto(`/chains/31337/tiers/${tier}`);
    await connectAnvilWallet(page, member);
    await switchAnvilAccount(page, recipient);
    await page.getByText("Rewards & accounting", { exact: true }).click();
    await page
      .getByRole("region", { name: "Ended membership rewards" })
      .getByRole("button", { name: "Claim ended membership rewards" })
      .click();
    await expectReconciled(page, "Claim ended membership rewards");
    expect(
      await client.readContract({
        address: token,
        abi: usdgAbi,
        functionName: "balanceOf",
        args: [recipient],
      }),
    ).toBe(beforeClaim + retiredCredit[0]);
    expect(
      await client.readContract({
        ...common,
        functionName: "claimableRetiredReward",
        args: [recipient],
      }),
    ).toEqual([0n, retiredCredit[1]]);
  } finally {
    await revertAnvil(saved);
  }
});
